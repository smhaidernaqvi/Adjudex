/**
 * Agreement Service
 *
 * Owns the LOCKED agreement: immutable versions and the change proposals that
 * are the only legal way to amend one.
 *
 * Storage keys: tf_agreement_versions, tf_change_proposals
 *
 * Rules enforced here:
 *  - Versions are append-only. Nothing ever mutates or deletes a version.
 *  - A new version is created ONLY by acceptChangeProposal() (or, for v1, by
 *    the transaction service when both parties agree).
 *  - A proposal cannot be accepted by the person who proposed it.
 *  - Only the two participants recorded on the base version may respond.
 *
 * This module deliberately does not import the projects or transactions
 * services: it is a leaf, which keeps the dependency graph acyclic.
 */

import type {
    AgreementChangeProposal,
    AgreementVersion,
    ChangeProposalStatus,
    ProposalChange,
    TermsSnapshot,
    TransactionRequirement,
} from "@/types";

// ─── Storage keys ────────────────────────────────────────────

const VERSIONS_KEY = "tf_agreement_versions";
const PROPOSALS_KEY = "tf_change_proposals";

// ─── Stored shapes (dates as ISO strings for JSON) ───────────

interface StoredVersion {
    id: string;
    transactionId: string;
    projectId: string;
    version: number;
    title: string;
    description: string;
    amount: number;
    currency: string;
    deadline: string;
    requirements: TransactionRequirement[];
    agreedBy: string[];
    proposedBy: string;
    changeSummary: string | null;
    agreedAt: string;
}

interface StoredProposal {
    id: string;
    transactionId: string;
    projectId: string;
    proposerUserId: string;
    baseVersionId: string;
    status: ChangeProposalStatus;
    reason: string;
    proposedTerms: {
        id: string;
        title: string;
        description: string;
        proposedAmount: number;
        currency: string;
        deadline: string;
        requirements: TransactionRequirement[];
        createdAt: string;
    };
    changes: ProposalChange[];
    respondedBy: string | null;
    respondedAt: string | null;
    resultingVersionId: string | null;
    createdAt: string;
    updatedAt: string;
}

// ─── Conversion helpers ──────────────────────────────────────

function toVersion(stored: StoredVersion): AgreementVersion {
    return {
        ...stored,
        deadline: new Date(stored.deadline),
        agreedAt: new Date(stored.agreedAt),
    };
}

function toStoredVersion(v: AgreementVersion): StoredVersion {
    return {
        ...v,
        deadline: v.deadline.toISOString(),
        agreedAt: v.agreedAt.toISOString(),
    };
}

function toTermsSnapshot(
    stored: StoredProposal["proposedTerms"],
): TermsSnapshot {
    return {
        ...stored,
        deadline: new Date(stored.deadline),
        createdAt: new Date(stored.createdAt),
    };
}

function toStoredTerms(terms: TermsSnapshot): StoredProposal["proposedTerms"] {
    return {
        ...terms,
        deadline: terms.deadline.toISOString(),
        createdAt: terms.createdAt.toISOString(),
    };
}

function toProposal(stored: StoredProposal): AgreementChangeProposal {
    return {
        ...stored,
        proposedTerms: toTermsSnapshot(stored.proposedTerms),
        respondedAt: stored.respondedAt ? new Date(stored.respondedAt) : null,
        createdAt: new Date(stored.createdAt),
        updatedAt: new Date(stored.updatedAt),
    };
}

function toStoredProposal(p: AgreementChangeProposal): StoredProposal {
    return {
        ...p,
        proposedTerms: toStoredTerms(p.proposedTerms),
        respondedAt: p.respondedAt ? p.respondedAt.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
    };
}

// ─── Raw storage helpers ─────────────────────────────────────

function getStoredVersions(): StoredVersion[] {
    const raw = localStorage.getItem(VERSIONS_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function saveStoredVersions(versions: StoredVersion[]): void {
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions));
}

function getStoredProposals(): StoredProposal[] {
    const raw = localStorage.getItem(PROPOSALS_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function saveStoredProposals(proposals: StoredProposal[]): void {
    localStorage.setItem(PROPOSALS_KEY, JSON.stringify(proposals));
}

// ─── Terms diffing ───────────────────────────────────────────

function sameDay(a: Date, b: Date): boolean {
    return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/**
 * Compare a proposed set of terms against the version they are based on.
 *
 * Requirements are matched by id, so an edit shows as "updated" rather than
 * as a removal plus an addition. The result is stored on the proposal so both
 * parties review the exact same diff, and so the diff survives later edits.
 */
export function diffTerms(
    base: {
        title: string;
        description: string;
        amount: number;
        currency: string;
        deadline: Date;
        requirements: TransactionRequirement[];
    },
    proposed: TermsSnapshot,
): ProposalChange[] {
    const changes: ProposalChange[] = [];

    if (base.title !== proposed.title) {
        changes.push({
            kind: "title",
            label: "Title",
            before: base.title,
            after: proposed.title,
        });
    }

    if (base.description !== proposed.description) {
        changes.push({
            kind: "description",
            label: "Scope / description",
            before: base.description,
            after: proposed.description,
        });
    }

    if (base.amount !== proposed.proposedAmount) {
        const delta = proposed.proposedAmount - base.amount;
        changes.push({
            kind: "amount",
            label: "Amount",
            before: `${base.currency} ${base.amount.toLocaleString()}`,
            after: `${proposed.currency} ${proposed.proposedAmount.toLocaleString()} (${delta > 0 ? "+" : ""
                }${delta.toLocaleString()})`,
        });
    } else if (base.currency !== proposed.currency) {
        changes.push({
            kind: "currency",
            label: "Currency",
            before: base.currency,
            after: proposed.currency,
        });
    }

    if (!sameDay(base.deadline, proposed.deadline)) {
        changes.push({
            kind: "deadline",
            label: "Deadline",
            before: base.deadline.toLocaleDateString(),
            after: proposed.deadline.toLocaleDateString(),
        });
    }

    const baseById = new Map(base.requirements.map((r) => [r.id, r]));
    const proposedById = new Map(proposed.requirements.map((r) => [r.id, r]));

    for (const req of proposed.requirements) {
        const before = baseById.get(req.id);
        if (!before) {
            changes.push({
                kind: "requirement_added",
                label: "Requirement added",
                before: null,
                after: req.title,
            });
        } else if (
            before.title !== req.title ||
            before.description !== req.description ||
            before.isRequired !== req.isRequired
        ) {
            changes.push({
                kind: "requirement_updated",
                label: "Requirement changed",
                before: before.title,
                after: req.title,
            });
        }
    }

    for (const req of base.requirements) {
        if (!proposedById.has(req.id)) {
            changes.push({
                kind: "requirement_removed",
                label: "Requirement removed",
                before: req.title,
                after: null,
            });
        }
    }

    return changes;
}

// ─── Versions ────────────────────────────────────────────────

/**
 * Append a new immutable agreement version. Version numbers are sequential
 * per project. Existing versions are never touched.
 */
export function createAgreementVersion(data: {
    transactionId: string;
    projectId: string;
    terms: TermsSnapshot;
    /** Both participant user ids — the mutual acceptance of this version. */
    agreedBy: string[];
    proposedBy: string;
    changeSummary?: string | null;
}): AgreementVersion {
    const existing = getStoredVersions();
    const nextNumber =
        existing
            .filter((v) => v.projectId === data.projectId)
            .reduce((max, v) => Math.max(max, v.version), 0) + 1;

    const version: AgreementVersion = {
        id: crypto.randomUUID(),
        transactionId: data.transactionId,
        projectId: data.projectId,
        version: nextNumber,
        title: data.terms.title,
        description: data.terms.description,
        amount: data.terms.proposedAmount,
        currency: data.terms.currency,
        deadline: data.terms.deadline,
        requirements: data.terms.requirements.map((r) => ({ ...r })),
        agreedBy: [...data.agreedBy],
        proposedBy: data.proposedBy,
        changeSummary: data.changeSummary ?? null,
        agreedAt: new Date(),
    };

    existing.push(toStoredVersion(version));
    saveStoredVersions(existing);

    return version;
}

/** All versions for a project, oldest first — the immutable history. */
export function getAgreementVersionsByProjectId(
    projectId: string,
): AgreementVersion[] {
    return getStoredVersions()
        .filter((v) => v.projectId === projectId)
        .map(toVersion)
        .sort((a, b) => a.version - b.version);
}

/**
 * The authoritative, currently agreed terms.
 *
 * AI verification, requirement display and escrow all read THIS — never the
 * original rough input and never a pending, unaccepted proposal.
 */
export function getCurrentAgreementVersion(
    projectId: string,
): AgreementVersion | null {
    const versions = getAgreementVersionsByProjectId(projectId);
    return versions.length > 0 ? versions[versions.length - 1] : null;
}

export function getAgreementVersionById(id: string): AgreementVersion | null {
    const stored = getStoredVersions().find((v) => v.id === id);
    return stored ? toVersion(stored) : null;
}

/** Convenience: the agreed requirements of the current version. */
export function getAgreedRequirements(
    projectId: string,
): TransactionRequirement[] {
    return getCurrentAgreementVersion(projectId)?.requirements ?? [];
}

// ─── Change proposals ────────────────────────────────────────

/**
 * Propose an amendment to the locked agreement.
 *
 * Creating a proposal changes NOTHING about the agreement. It only records an
 * offer plus the diff against the version it was drafted from.
 */
export function createChangeProposal(data: {
    transactionId: string;
    projectId: string;
    proposerUserId: string;
    reason: string;
    proposedTerms: TermsSnapshot;
}): AgreementChangeProposal {
    const base = getCurrentAgreementVersion(data.projectId);
    if (!base) {
        throw new Error(
            "There is no locked agreement to amend yet.",
        );
    }

    const pending = getPendingChangeProposal(data.projectId);
    if (pending) {
        throw new Error(
            "A change proposal is already awaiting a response. Resolve it before proposing another change.",
        );
    }

    if (!data.reason.trim()) {
        throw new Error("Please explain why this change is needed.");
    }

    const changes = diffTerms(
        {
            title: base.title,
            description: base.description,
            amount: base.amount,
            currency: base.currency,
            deadline: base.deadline,
            requirements: base.requirements,
        },
        data.proposedTerms,
    );

    if (changes.length === 0) {
        throw new Error(
            "This proposal does not change anything in the agreement.",
        );
    }

    const now = new Date();
    const proposal: AgreementChangeProposal = {
        id: crypto.randomUUID(),
        transactionId: data.transactionId,
        projectId: data.projectId,
        proposerUserId: data.proposerUserId,
        baseVersionId: base.id,
        status: "PENDING",
        reason: data.reason.trim(),
        proposedTerms: data.proposedTerms,
        changes,
        respondedBy: null,
        respondedAt: null,
        resultingVersionId: null,
        createdAt: now,
        updatedAt: now,
    };

    const proposals = getStoredProposals();
    proposals.push(toStoredProposal(proposal));
    saveStoredProposals(proposals);

    return proposal;
}

export function getChangeProposalsByProjectId(
    projectId: string,
): AgreementChangeProposal[] {
    return getStoredProposals()
        .filter((p) => p.projectId === projectId)
        .map(toProposal)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function getPendingChangeProposal(
    projectId: string,
): AgreementChangeProposal | null {
    return (
        getChangeProposalsByProjectId(projectId).find(
            (p) => p.status === "PENDING",
        ) ?? null
    );
}

export function getChangeProposalById(
    id: string,
): AgreementChangeProposal | null {
    const stored = getStoredProposals().find((p) => p.id === id);
    return stored ? toProposal(stored) : null;
}

/**
 * Shared guards for responding to a proposal.
 *
 * Participation is derived from the BASE VERSION's `agreedBy` list, which holds
 * exactly the two parties that locked that version. This keeps the check
 * self-contained without importing the transaction service.
 */
function loadRespondableProposal(
    proposalId: string,
    responderUserId: string,
): { proposal: AgreementChangeProposal; base: AgreementVersion; index: number } {
    if (!responderUserId) {
        throw new Error("You must be signed in.");
    }

    const proposals = getStoredProposals();
    const index = proposals.findIndex((p) => p.id === proposalId);
    if (index === -1) throw new Error("Change proposal not found.");

    const proposal = toProposal(proposals[index]);

    if (proposal.status !== "PENDING") {
        throw new Error(
            `This change proposal has already been ${proposal.status.toLowerCase()}.`,
        );
    }

    const base = getAgreementVersionById(proposal.baseVersionId);
    if (!base) throw new Error("The agreement version behind this proposal is missing.");

    if (!base.agreedBy.includes(responderUserId)) {
        throw new Error("You do not have access to this transaction.");
    }

    if (proposal.proposerUserId === responderUserId) {
        throw new Error(
            "You proposed this change — only the other party can accept or reject it.",
        );
    }

    return { proposal, base, index };
}

/**
 * Accept a change proposal.
 *
 * This is the ONLY moment the agreed terms move: a new immutable version is
 * appended, recording both parties and the diff that was accepted.
 *
 * Returns the proposal plus the version it produced, so the caller can sync the
 * project's execution fields (amount, currency, deadline, requirements).
 */
export function acceptChangeProposal(
    proposalId: string,
    responderUserId: string,
): { proposal: AgreementChangeProposal; version: AgreementVersion } {
    const { proposal, base, index } = loadRespondableProposal(
        proposalId,
        responderUserId,
    );

    const version = createAgreementVersion({
        transactionId: proposal.transactionId,
        projectId: proposal.projectId,
        terms: proposal.proposedTerms,
        agreedBy: base.agreedBy,
        proposedBy: proposal.proposerUserId,
        changeSummary: proposal.changes.map((c) => c.label).join(", "),
    });

    const proposals = getStoredProposals();
    proposals[index] = toStoredProposal({
        ...proposal,
        status: "ACCEPTED",
        respondedBy: responderUserId,
        respondedAt: new Date(),
        resultingVersionId: version.id,
        updatedAt: new Date(),
    });
    saveStoredProposals(proposals);

    return { proposal: toProposal(proposals[index]), version };
}

/**
 * Reject a change proposal. The agreement stays exactly as it was.
 */
export function rejectChangeProposal(
    proposalId: string,
    responderUserId: string,
): AgreementChangeProposal {
    const { proposal, index } = loadRespondableProposal(
        proposalId,
        responderUserId,
    );

    const proposals = getStoredProposals();
    proposals[index] = toStoredProposal({
        ...proposal,
        status: "REJECTED",
        respondedBy: responderUserId,
        respondedAt: new Date(),
        updatedAt: new Date(),
    });
    saveStoredProposals(proposals);

    return toProposal(proposals[index]);
}

// Re-export for callers that need to mint snapshot ids.
export function newTermsSnapshotId(): string {
    return crypto.randomUUID();
}
