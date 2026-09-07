/**
 * Transaction Service
 *
 * The PRIVATE negotiation layer. Either party may initiate a transaction with
 * one specific, already-known counterparty; nothing is ever broadcast.
 *
 * Storage key: tf_transactions
 *
 * Structural guarantees:
 *  - sendTransactionRequest() is the ONLY way a transaction record is created,
 *    and it refuses to run without a confirmed AI refinement record. There is
 *    no code path that stores raw, vague requirements as agreed terms.
 *  - Every query is participant-scoped. There is no "list all" export.
 *  - Every mutation re-checks participation before writing.
 *  - AGREED requires both parties to have accepted the SAME terms snapshot id.
 *    Revising the terms mints a new id, which silently voids any earlier
 *    acceptance — a party can never have their edit become active alone.
 *  - On AGREED the execution Project and AgreementVersion v1 are created
 *    together, so escrow always operates against the locked agreement.
 */

import type {
    AgreementChangeProposal,
    AgreementVersion,
    AIRefinementRecord,
    Project,
    TermsSnapshot,
    Transaction,
    TransactionRequirement,
    TransactionStatus,
    User,
} from "@/types";
import {
    assertTransactionParticipant,
    isProjectParticipant,
    isTransactionCounterparty,
    isTransactionInitiator,
    resolveExecutionRoles,
} from "@/lib/authz";
import { getUserById } from "@/lib/auth";
import {
    applyAgreedTerms,
    createProjectFromAgreement,
    getProjectById,
} from "@/services/projects";
import {
    acceptChangeProposal,
    createAgreementVersion,
    createChangeProposal,
    getCurrentAgreementVersion,
    getPendingChangeProposal,
    rejectChangeProposal,
} from "@/services/agreements";
import { syncPendingPaymentToAgreement } from "@/services/payments";
import { isValidTransactionTransition } from "./state-machine";

// ─── Storage key ─────────────────────────────────────────────

const TRANSACTIONS_KEY = "tf_transactions";

// ─── Stored shape (dates as ISO strings for JSON) ────────────

interface StoredTerms {
    id: string;
    title: string;
    description: string;
    proposedAmount: number;
    currency: string;
    deadline: string;
    requirements: TransactionRequirement[];
    createdAt: string;
}

interface StoredRefinement {
    id: string;
    roughRequirements: { title: string }[];
    refinedRequirements: TransactionRequirement[];
    ambiguities: string[];
    confirmedByInitiator: boolean;
    confirmedAt: string | null;
    createdAt: string;
}

interface StoredTransaction {
    id: string;
    initiatorUserId: string;
    counterpartyUserId: string;
    initiatorRole: User["role"];
    counterpartyRole: User["role"];
    status: TransactionStatus;
    currentTerms: StoredTerms;
    initiatorAcceptedTermsId: string | null;
    counterpartyAcceptedTermsId: string | null;
    refinement: StoredRefinement | null;
    changeRequestNote: string | null;
    rejectReason: string | null;
    projectId: string | null;
    createdAt: string;
    updatedAt: string;
}

// ─── Conversion helpers ──────────────────────────────────────

function toTerms(stored: StoredTerms): TermsSnapshot {
    return {
        ...stored,
        deadline: new Date(stored.deadline),
        createdAt: new Date(stored.createdAt),
    };
}

function toStoredTerms(terms: TermsSnapshot): StoredTerms {
    return {
        ...terms,
        deadline: terms.deadline.toISOString(),
        createdAt: terms.createdAt.toISOString(),
    };
}

function toRefinement(stored: StoredRefinement): AIRefinementRecord {
    return {
        ...stored,
        confirmedAt: stored.confirmedAt ? new Date(stored.confirmedAt) : null,
        createdAt: new Date(stored.createdAt),
    };
}

function toStoredRefinement(
    record: AIRefinementRecord,
): StoredRefinement {
    return {
        ...record,
        confirmedAt: record.confirmedAt ? record.confirmedAt.toISOString() : null,
        createdAt: record.createdAt.toISOString(),
    };
}

function toTransaction(stored: StoredTransaction): Transaction {
    return {
        ...stored,
        currentTerms: toTerms(stored.currentTerms),
        refinement: stored.refinement ? toRefinement(stored.refinement) : null,
        createdAt: new Date(stored.createdAt),
        updatedAt: new Date(stored.updatedAt),
    };
}

function toStoredTransaction(tx: Transaction): StoredTransaction {
    return {
        ...tx,
        currentTerms: toStoredTerms(tx.currentTerms),
        refinement: tx.refinement ? toStoredRefinement(tx.refinement) : null,
        createdAt: tx.createdAt.toISOString(),
        updatedAt: tx.updatedAt.toISOString(),
    };
}

// ─── Raw storage helpers ─────────────────────────────────────

function getStoredTransactions(): StoredTransaction[] {
    const raw = localStorage.getItem(TRANSACTIONS_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function saveStoredTransactions(list: StoredTransaction[]): void {
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(list));
}

function writeTransaction(tx: Transaction): void {
    const list = getStoredTransactions();
    const idx = list.findIndex((t) => t.id === tx.id);
    const stored = toStoredTransaction({ ...tx, updatedAt: new Date() });
    if (idx === -1) list.push(stored);
    else list[idx] = stored;
    saveStoredTransactions(list);
}

// ─── Terms snapshot construction ─────────────────────────────

/**
 * Build a NEW terms snapshot.
 *
 * A fresh `id` is minted on every call. Both parties record the snapshot id
 * they accepted, so minting a new id is what invalidates a stale acceptance
 * when terms move.
 */
export function buildTermsSnapshot(data: {
    title: string;
    description: string;
    proposedAmount: number;
    currency: string;
    deadline: Date;
    requirements: TransactionRequirement[];
}): TermsSnapshot {
    return {
        id: crypto.randomUUID(),
        title: data.title.trim(),
        description: data.description.trim(),
        proposedAmount: data.proposedAmount,
        currency: data.currency.trim().toUpperCase() || "USD",
        deadline: data.deadline,
        requirements: data.requirements.map((r) => ({ ...r })),
        createdAt: new Date(),
    };
}

/**
 * Order-insensitive fingerprint of a requirement set.
 * Used to decide whether a revision touched requirements (and therefore must
 * go through AI refinement again) or only touched money/schedule.
 */
function requirementSignature(
    requirements: TransactionRequirement[],
): string {
    return requirements
        .map(
            (r) =>
                `${r.title.trim().toLowerCase()}|${r.description
                    .trim()
                    .toLowerCase()}|${r.isRequired}`,
        )
        .sort()
        .join("\n");
}

function requirementsChanged(
    before: TransactionRequirement[],
    after: TransactionRequirement[],
): boolean {
    return requirementSignature(before) !== requirementSignature(after);
}

/**
 * Validate a confirmed AI refinement record.
 * Refinement is mandatory: without it the terms are refused.
 */
function assertConfirmedRefinement(
    refinement: AIRefinementRecord | null | undefined,
): void {
    if (!refinement) {
        throw new Error(
            "Requirements must be refined with AI before the request can be sent.",
        );
    }
    if (!refinement.confirmedByInitiator || !refinement.confirmedAt) {
        throw new Error(
            "Review and confirm the AI-refined requirements before sending the request.",
        );
    }
    if (refinement.refinedRequirements.length === 0) {
        throw new Error(
            "The refined requirement set is empty. Add at least one acceptance criterion.",
        );
    }
}

// ─── Sending a request (the only creation path) ─────────────

/**
 * Create and privately send a transaction request to ONE selected account.
 *
 * Preconditions, all enforced here:
 *  - initiator is a client or freelancer
 *  - counterparty exists and holds the OPPOSITE role (a payer/worker split is
 *    required by the escrow and review stages)
 *  - terms are complete and contain at least one requirement
 *  - a confirmed AI refinement record backs those requirements
 *
 * The record is written with status REQUEST_SENT. Nothing is stored before
 * this point, so an unrefined draft can never exist.
 */
export function sendTransactionRequest(data: {
    initiator: User;
    counterpartyUserId: string;
    terms: TermsSnapshot;
    refinement: AIRefinementRecord | null;
}): Transaction {
    const { initiator, terms } = data;

    if (initiator.role !== "client" && initiator.role !== "freelancer") {
        throw new Error("Only client and freelancer accounts can create transactions.");
    }

    const counterparty = getUserById(data.counterpartyUserId);
    if (!counterparty) {
        throw new Error("No Adjudex account was found for that counterparty.");
    }
    if (counterparty.id === initiator.id) {
        throw new Error("You cannot create a transaction with yourself.");
    }
    if (!resolveExecutionRoles(initiator, counterparty)) {
        throw new Error(
            `The counterparty must have the opposite role. As a ${initiator.role}, select a ${initiator.role === "client" ? "freelancer" : "client"
            } account.`,
        );
    }

    if (!terms.title) throw new Error("A transaction title is required.");
    if (!terms.description) throw new Error("A description of the work is required.");
    if (!(terms.proposedAmount > 0)) {
        throw new Error("The proposed amount must be greater than zero.");
    }
    if (terms.requirements.length === 0) {
        throw new Error("At least one acceptance criterion is required.");
    }
    if (isNaN(terms.deadline.getTime())) {
        throw new Error("A valid deadline is required.");
    }

    assertConfirmedRefinement(data.refinement);

    const now = new Date();
    const transaction: Transaction = {
        id: crypto.randomUUID(),
        initiatorUserId: initiator.id,
        counterpartyUserId: counterparty.id,
        initiatorRole: initiator.role,
        counterpartyRole: counterparty.role,
        status: "REQUEST_SENT",
        currentTerms: terms,
        // The initiator confirms the refined terms as part of sending.
        initiatorAcceptedTermsId: terms.id,
        counterpartyAcceptedTermsId: null,
        refinement: data.refinement,
        changeRequestNote: null,
        rejectReason: null,
        projectId: null,
        createdAt: now,
        updatedAt: now,
    };

    writeTransaction(transaction);
    return transaction;
}

// ─── Participant-scoped reads ────────────────────────────────

/**
 * RAW read. No authorization — internal use by services that have already
 * established participation. UI code must use getTransactionForUser().
 */
export function getTransactionById(id: string): Transaction | null {
    const stored = getStoredTransactions().find((t) => t.id === id);
    return stored ? toTransaction(stored) : null;
}

/**
 * Authorized read. Returns null for anyone who is not one of the two parties,
 * so the transaction's existence is not even disclosed to outsiders.
 */
export function getTransactionForUser(
    id: string,
    userId: string | null | undefined,
): Transaction | null {
    const tx = getTransactionById(id);
    if (!tx) return null;
    return isTransactionInitiator(tx, userId) ||
        isTransactionCounterparty(tx, userId)
        ? tx
        : null;
}

/** Every transaction the user participates in. Never includes anyone else's. */
export function getTransactionsForUser(userId: string): Transaction[] {
    if (!userId) return [];
    return getStoredTransactions()
        .map(toTransaction)
        .filter(
            (t) =>
                t.initiatorUserId === userId || t.counterpartyUserId === userId,
        )
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * Requests awaiting ME as the invited counterparty.
 * Also includes requests I sent back for revision, so nothing is lost.
 */
export function getRequestsReceived(userId: string): Transaction[] {
    return getTransactionsForUser(userId).filter(
        (t) =>
            t.counterpartyUserId === userId &&
            (t.status === "REQUEST_SENT" ||
                t.status === "CHANGE_REQUESTED" ||
                t.status === "REJECTED"),
    );
}

/** Requests I initiated that are still in negotiation (or were declined). */
export function getRequestsSent(userId: string): Transaction[] {
    return getTransactionsForUser(userId).filter(
        (t) =>
            t.initiatorUserId === userId &&
            (t.status === "REQUEST_SENT" ||
                t.status === "CHANGE_REQUESTED" ||
                t.status === "REJECTED"),
    );
}

/** Transactions that reached a locked agreement. */
export function getAgreedTransactions(userId: string): Transaction[] {
    return getTransactionsForUser(userId).filter((t) => t.status === "AGREED");
}

/** Look up the negotiation behind an execution project. */
export function getTransactionByProjectId(
    projectId: string,
): Transaction | null {
    return (
        getStoredTransactions()
            .map(toTransaction)
            .find((t) => t.projectId === projectId) ?? null
    );
}

/** True when both parties have accepted the same terms snapshot. */
export function isMutuallyAccepted(tx: Transaction): boolean {
    return (
        tx.initiatorAcceptedTermsId !== null &&
        tx.initiatorAcceptedTermsId === tx.currentTerms.id &&
        tx.counterpartyAcceptedTermsId !== null &&
        tx.counterpartyAcceptedTermsId === tx.currentTerms.id
    );
}

// ─── Shared mutation guard ───────────────────────────────────

function loadForMutation(
    transactionId: string,
    userId: string | null | undefined,
    to: TransactionStatus,
): Transaction {
    if (!userId) throw new Error("You must be signed in.");

    const tx = getTransactionById(transactionId);
    if (!tx) throw new Error("Transaction not found.");

    // Privacy first: a non-participant gets the same error as a missing record.
    assertTransactionParticipant(tx, userId);

    if (!isValidTransactionTransition(tx.status, to)) {
        throw new Error(
            `This transaction is "${tx.status.replace(/_/g, " ").toLowerCase()}" and can no longer be changed that way.`,
        );
    }

    return tx;
}

// ─── Counterparty decision ───────────────────────────────────

/**
 * Counterparty accepts the terms currently on the table.
 *
 * When — and only when — both acceptances point at the SAME snapshot id, the
 * agreement is locked: an execution Project and AgreementVersion v1 are
 * created in the same operation.
 */
export function acceptTransaction(
    transactionId: string,
    userId: string,
): { transaction: Transaction; project: Project | null } {
    const tx = loadForMutation(transactionId, userId, "AGREED");

    if (!isTransactionCounterparty(tx, userId)) {
        throw new Error("Only the invited counterparty can accept this request.");
    }

    const accepted: Transaction = {
        ...tx,
        counterpartyAcceptedTermsId: tx.currentTerms.id,
        changeRequestNote: null,
    };

    if (!isMutuallyAccepted(accepted)) {
        // Not both on the same version — stay in negotiation.
        accepted.status = "REQUEST_SENT";
        writeTransaction(accepted);
        return { transaction: accepted, project: null };
    }

    const initiator = getUserById(tx.initiatorUserId);
    const counterparty = getUserById(tx.counterpartyUserId);
    if (!initiator || !counterparty) {
        throw new Error("One of the participant accounts is missing.");
    }

    const roles = resolveExecutionRoles(initiator, counterparty);
    if (!roles) {
        throw new Error(
            "Cannot lock the agreement: the two parties do not have opposite roles.",
        );
    }

    const terms = accepted.currentTerms;

    // 1. Execution project — starts at FREELANCER_ACCEPTED, both sides committed.
    const project = createProjectFromAgreement({
        transactionId: tx.id,
        title: terms.title,
        description: terms.description,
        budget: terms.proposedAmount,
        currency: terms.currency,
        deadline: terms.deadline,
        clientId: roles.clientId,
        freelancerId: roles.freelancerId,
        requirements: terms.requirements,
    });

    // 2. Agreement v1 — the authoritative locked snapshot.
    createAgreementVersion({
        transactionId: tx.id,
        projectId: project.id,
        terms,
        agreedBy: [tx.initiatorUserId, tx.counterpartyUserId],
        proposedBy: tx.initiatorUserId,
        changeSummary: null,
    });

    // 3. Link and close the negotiation.
    accepted.status = "AGREED";
    accepted.projectId = project.id;
    writeTransaction(accepted);

    return { transaction: accepted, project };
}

/**
 * Counterparty asks for changes.
 *
 * Records the note and CLEARS the counterparty's acceptance. It never edits the
 * terms — only the initiator can put a revised set on the table, and doing so
 * requires a fresh acceptance from both sides.
 */
export function requestChanges(
    transactionId: string,
    userId: string,
    note: string,
): Transaction {
    const tx = loadForMutation(transactionId, userId, "CHANGE_REQUESTED");

    if (!isTransactionCounterparty(tx, userId)) {
        throw new Error("Only the invited counterparty can request changes.");
    }
    if (!note.trim()) {
        throw new Error("Explain what needs to change.");
    }

    const updated: Transaction = {
        ...tx,
        status: "CHANGE_REQUESTED",
        counterpartyAcceptedTermsId: null,
        changeRequestNote: note.trim(),
    };
    writeTransaction(updated);
    return updated;
}

/**
 * Either party walks away. Terminal.
 */
export function rejectTransaction(
    transactionId: string,
    userId: string,
    reason?: string,
): Transaction {
    const tx = loadForMutation(transactionId, userId, "REJECTED");

    const updated: Transaction = {
        ...tx,
        status: "REJECTED",
        counterpartyAcceptedTermsId: null,
        rejectReason: reason?.trim() || null,
    };
    writeTransaction(updated);
    return updated;
}

/**
 * Initiator revises the terms and re-sends.
 *
 * A new snapshot id is minted and BOTH acceptances are cleared except the
 * initiator's (who is confirming the revision by sending it). The counterparty
 * must accept the new version from scratch — their earlier acceptance of
 * different terms cannot carry over.
 *
 * If the revision touches requirements, a fresh confirmed AI refinement record
 * is mandatory; money/schedule-only revisions reuse the existing record.
 */
export function reviseAndResendTerms(
    transactionId: string,
    userId: string,
    data: { terms: TermsSnapshot; refinement?: AIRefinementRecord | null },
): Transaction {
    const tx = loadForMutation(transactionId, userId, "REQUEST_SENT");

    if (!isTransactionInitiator(tx, userId)) {
        throw new Error("Only the initiator can revise and re-send the request.");
    }
    if (tx.status === "AGREED") {
        throw new Error(
            "This agreement is locked. Propose a change instead of editing it.",
        );
    }

    const terms = data.terms;
    if (terms.requirements.length === 0) {
        throw new Error("At least one acceptance criterion is required.");
    }
    if (!(terms.proposedAmount > 0)) {
        throw new Error("The proposed amount must be greater than zero.");
    }

    const touchedRequirements = requirementsChanged(
        tx.currentTerms.requirements,
        terms.requirements,
    );

    let refinement = tx.refinement;
    if (touchedRequirements) {
        assertConfirmedRefinement(data.refinement);
        refinement = data.refinement as AIRefinementRecord;
    } else {
        assertConfirmedRefinement(refinement);
    }

    const updated: Transaction = {
        ...tx,
        status: "REQUEST_SENT",
        currentTerms: terms,
        initiatorAcceptedTermsId: terms.id,
        counterpartyAcceptedTermsId: null,
        refinement,
        changeRequestNote: null,
    };
    writeTransaction(updated);
    return updated;
}

// ─── Post-agreement change proposals ─────────────────────────

function loadProjectForParticipant(
    projectId: string,
    userId: string,
): { project: Project; transaction: Transaction } {
    const project = getProjectById(projectId);
    if (!project) throw new Error("Transaction not found.");
    if (!isProjectParticipant(project, userId)) {
        throw new Error("You do not have access to this transaction.");
    }

    const transaction = getTransactionByProjectId(projectId);
    if (!transaction) {
        throw new Error("No agreement record exists for this transaction.");
    }
    assertTransactionParticipant(transaction, userId);

    return { project, transaction };
}

/** The locked version currently in force, with a participant check. */
export function getAgreementForUser(
    projectId: string,
    userId: string,
): AgreementVersion | null {
    loadProjectForParticipant(projectId, userId);
    return getCurrentAgreementVersion(projectId);
}

/**
 * Propose an amendment to the locked agreement.
 *
 * Changes NOTHING until the other party accepts. Either party may propose.
 * Requirement changes must have been through AI refinement, exactly as at
 * creation — vague wording cannot enter the agreement by the back door.
 */
export function proposeAgreementChange(data: {
    projectId: string;
    proposerUserId: string;
    reason: string;
    terms: TermsSnapshot;
    refinement?: AIRefinementRecord | null;
}): AgreementChangeProposal {
    const { project, transaction } = loadProjectForParticipant(
        data.projectId,
        data.proposerUserId,
    );

    if (transaction.status !== "AGREED") {
        throw new Error(
            "Changes can only be proposed once the agreement is locked.",
        );
    }

    const base = getCurrentAgreementVersion(project.id);
    if (!base) throw new Error("No locked agreement version was found.");

    if (data.terms.requirements.length === 0) {
        throw new Error("An agreement must keep at least one acceptance criterion.");
    }
    if (!(data.terms.proposedAmount > 0)) {
        throw new Error("The proposed amount must be greater than zero.");
    }

    if (requirementsChanged(base.requirements, data.terms.requirements)) {
        assertConfirmedRefinement(data.refinement);
    }

    return createChangeProposal({
        transactionId: transaction.id,
        projectId: project.id,
        proposerUserId: data.proposerUserId,
        reason: data.reason,
        proposedTerms: data.terms,
    });
}

/** The proposal awaiting the other party's decision, if any. */
export function getPendingProposalForUser(
    projectId: string,
    userId: string,
): AgreementChangeProposal | null {
    loadProjectForParticipant(projectId, userId);
    return getPendingChangeProposal(projectId);
}

/**
 * Mirror a newly agreed version back onto the transaction record.
 *
 * `currentTerms` is the snapshot the two parties last accepted. When a change
 * proposal is accepted the agreement has moved on, so the snapshot has to move
 * with it — otherwise the transaction keeps advertising the pre-change amount
 * and requirement set, and both acceptance pointers keep naming a version that
 * is no longer in force.
 *
 * The proposal's terms snapshot is reused verbatim rather than rebuilt from the
 * version: it IS the exact snapshot one party put forward and the other
 * accepted, so recording both acceptances against its id keeps the "both
 * accepted the SAME version" invariant true after the amendment.
 */
function syncTransactionToAcceptedProposal(
    proposal: AgreementChangeProposal,
): void {
    const tx = getTransactionById(proposal.transactionId);
    if (!tx) return;

    const acceptedTermsId = proposal.proposedTerms.id;

    writeTransaction({
        ...tx,
        currentTerms: proposal.proposedTerms,
        initiatorAcceptedTermsId: acceptedTermsId,
        counterpartyAcceptedTermsId: acceptedTermsId,
    });
}

/**
 * Accept or reject a change proposal.
 *
 * Accepting is the ONLY way agreed terms move after locking. It appends a new
 * immutable version, syncs the transaction snapshot and the execution project
 * to it, and re-values a not-yet-locked escrow payment. Rejecting leaves the
 * agreement untouched.
 */
export function respondToChangeProposal(
    proposalId: string,
    userId: string,
    decision: "accept" | "reject",
): { proposal: AgreementChangeProposal; version: AgreementVersion | null } {
    if (decision === "reject") {
        const proposal = rejectChangeProposal(proposalId, userId);
        return { proposal, version: null };
    }

    const { proposal, version } = acceptChangeProposal(proposalId, userId);

    // The negotiation record must not keep pointing at the superseded snapshot.
    syncTransactionToAcceptedProposal(proposal);

    // The project must never hold terms that were not mutually agreed.
    applyAgreedTerms(version.projectId, version);

    // Escrow follows the agreed version while it is still un-locked. Once
    // locked, the held amount is left alone (see syncPendingPaymentToAgreement).
    syncPendingPaymentToAgreement(version.projectId);

    return { proposal, version };
}

// Re-export so pages can build proposal/revision terms from a version.
export { getCurrentAgreementVersion } from "@/services/agreements";
