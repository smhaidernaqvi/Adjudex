/**
 * Adjudex — Core Type Definitions
 *
 * Adjudex is a PRIVATE trust + agreement + escrow layer between two parties
 * who already found each other elsewhere. It is NOT a public marketplace.
 *
 * Domain layering:
 *   Transaction  — private two-party negotiation (DRAFT … AGREED / REJECTED)
 *   AgreementVersion — immutable, mutually accepted snapshot of the terms
 *   Project      — execution record materialised once an agreement is locked;
 *                  owns the downstream escrow/delivery state machine
 */

// ─── User Roles ───────────────────────────────────────────────

export type UserRole = "client" | "freelancer" | "admin";

// ─── Transaction States (negotiation state machine) ─────────

/**
 * Negotiation lifecycle of a private transaction request.
 *
 * DRAFT / AI_REFINING / AWAITING_INITIATOR_CONFIRMATION describe the
 * pre-send creation wizard. A transaction record is only persisted once the
 * initiator has confirmed the AI-refined terms and sent the request, so there
 * is no code path that stores unrefined requirements.
 */
export type TransactionStatus =
    | "DRAFT"
    | "AI_REFINING"
    | "AWAITING_INITIATOR_CONFIRMATION"
    | "REQUEST_SENT"
    | "CHANGE_REQUESTED"
    | "AGREED"
    | "REJECTED";

// ─── Project States (execution state machine) ───────────────

export type ProjectStatus =
    | "CREATED"
    | "FREELANCER_ACCEPTED"
    | "PAYMENT_LOCKED"
    | "IN_PROGRESS"
    | "SUBMITTED"
    | "AI_VERIFICATION"
    | "CLIENT_REVIEW"
    | "REVISION_REQUIRED"
    | "DISPUTED"
    | "APPROVED"
    | "PAYMENT_RELEASED"
    | "FINAL_DELIVERY_RELEASED"
    | "COMPLETED";

// ─── Core Entities (placeholder shapes) ──────────────────────

export interface User {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    createdAt: Date;
}

export interface Project {
    id: string;
    title: string;
    description: string;
    status: ProjectStatus;
    budget: number;
    currency: string;
    deadline: Date;
    clientId: string;
    freelancerId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface Requirement {
    id: string;
    projectId: string;
    title: string;
    description: string;
    isRequired: boolean;
}

// ─── Private Transaction (negotiation layer) ────────────────

/**
 * One acceptance criterion inside a set of transaction terms.
 * Mirrors `Requirement` but is not bound to a project — it lives in the
 * negotiated terms and in immutable agreement versions.
 */
export interface TransactionRequirement {
    id: string;
    title: string;
    description: string;
    isRequired: boolean;
}

/**
 * A complete, self-describing set of negotiated terms.
 *
 * `id` is regenerated whenever ANY negotiable value changes (title, scope,
 * amount, currency, deadline, requirements). Both parties record the snapshot
 * id they accepted, which is what makes "both accepted the SAME version"
 * enforceable rather than aspirational: revising the terms mints a new id and
 * silently invalidates any earlier acceptance.
 */
export interface TermsSnapshot {
    id: string;
    title: string;
    description: string;
    proposedAmount: number;
    currency: string;
    deadline: Date;
    requirements: TransactionRequirement[];
    createdAt: Date;
}

/**
 * Record of the mandatory AI refinement pass for one set of rough inputs.
 * Retained on the transaction so both parties can see what was refined and
 * which ambiguities the AI flagged.
 */
export interface AIRefinementRecord {
    id: string;
    roughRequirements: { title: string }[];
    refinedRequirements: TransactionRequirement[];
    /** Ambiguities / missing information the AI identified. */
    ambiguities: string[];
    confirmedByInitiator: boolean;
    confirmedAt: Date | null;
    createdAt: Date;
}

/**
 * A private transaction request between exactly two accounts.
 *
 * Visibility rule: only `initiatorUserId` and `counterpartyUserId` may read
 * or write this record. It never appears in any global listing.
 */
export interface Transaction {
    id: string;
    initiatorUserId: string;
    counterpartyUserId: string;
    initiatorRole: UserRole;
    counterpartyRole: UserRole;
    status: TransactionStatus;

    /** The terms currently on the table. */
    currentTerms: TermsSnapshot;

    /** Snapshot id each party last accepted; null = has not accepted. */
    initiatorAcceptedTermsId: string | null;
    counterpartyAcceptedTermsId: string | null;

    /** Mandatory AI refinement record backing the confirmed terms. */
    refinement: AIRefinementRecord | null;

    /** Note left by the counterparty when requesting changes. */
    changeRequestNote: string | null;
    /** Reason recorded when either party rejects. */
    rejectReason: string | null;

    /** Execution project created once the agreement is locked. */
    projectId: string | null;

    createdAt: Date;
    updatedAt: Date;
}

// ─── Locked Agreement (immutable versions + change proposals) ─

/**
 * An immutable, mutually accepted snapshot of the agreement.
 *
 * Version 1 is created when the transaction reaches AGREED. Later versions are
 * created only when a change proposal is accepted by the counterparty. Previous
 * versions are never mutated or deleted — they form the agreement history.
 */
export interface AgreementVersion {
    id: string;
    transactionId: string;
    projectId: string;
    version: number;
    title: string;
    description: string;
    amount: number;
    currency: string;
    deadline: Date;
    requirements: TransactionRequirement[];
    /** Both participant user ids — acceptance of this exact version. */
    agreedBy: string[];
    /** Who put this version on the table (initiator for v1, proposer after). */
    proposedBy: string;
    /** Human-readable summary of what changed; null for the first version. */
    changeSummary: string | null;
    /** Agreement timestamp. */
    agreedAt: Date;
}

export type ChangeProposalStatus = "PENDING" | "ACCEPTED" | "REJECTED";

/**
 * A proposed amendment to a locked agreement.
 *
 * Neither party can edit agreed terms directly. Either party may propose a
 * change; it only takes effect if the counterparty accepts, at which point a
 * new AgreementVersion is appended and the proposal is linked to it.
 */
export interface AgreementChangeProposal {
    id: string;
    transactionId: string;
    projectId: string;
    proposerUserId: string;
    /** Version this proposal was drafted against. */
    baseVersionId: string;
    status: ChangeProposalStatus;
    reason: string;
    /** Full proposed terms — a snapshot, so it can be diffed and applied. */
    proposedTerms: TermsSnapshot;
    /** What actually differs from the base version, precomputed for display. */
    changes: ProposalChange[];
    respondedBy: string | null;
    respondedAt: Date | null;
    /** Version created when accepted; null otherwise. */
    resultingVersionId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

/** One line item describing a difference between two sets of terms. */
export interface ProposalChange {
    kind: "requirement_added" | "requirement_removed" | "requirement_updated" | "amount" | "currency" | "deadline" | "title" | "description";
    label: string;
    before: string | null;
    after: string | null;
}

export interface Payment {
    id: string;
    projectId: string;
    amount: number;
    currency: string;
    status: "pending" | "locked" | "released" | "refunded";
    createdAt: Date;
    lockedAt: Date | null;
    releasedAt: Date | null;
}

export interface Submission {
    id: string;
    projectId: string;
    freelancerId: string;
    title: string;
    description: string;
    fileUrl: string | null;
    status: "submitted" | "under_review" | "approved" | "revision_requested";
    submittedAt: Date;
}

// ─── Requirement-level verification status ──────────────────

export type RequirementStatus = "VERIFIED" | "UNCLEAR" | "MISSING";

export interface RequirementResult {
    requirementId: string;
    requirementText: string;
    status: RequirementStatus;
    explanation: string;
    confidence: number;
}

// ─── AI Verification Result ─────────────────────────────────

export type VerificationStatus = "pending" | "completed" | "failed";

export interface AIVerificationResult {
    id: string;
    projectId: string;
    submissionId: string;
    overallScore: number;
    summary: string;
    requirementResults: RequirementResult[];
    status: VerificationStatus;
    /**
     * The locked agreement version these results were produced against.
     * Recorded so it is provable that verification never ran against rough
     * input, a pending proposal, or a one-sided edit.
     */
    agreementVersionId: string | null;
    agreementVersion: number | null;
    createdAt: Date;
}

export interface Approval {
    id: string;
    projectId: string;
    approvedBy: string;
    approvedAt: Date;
    notes: string | null;
}

export type DisputeCategory =
    | "missing_requirement"
    | "incorrect_implementation"
    | "does_not_match_agreement"
    | "other";

export interface Dispute {
    id: string;
    projectId: string;
    submissionId: string;
    raisedBy: string;
    reason: string;
    category: DisputeCategory;
    status: "open" | "under_review" | "resolved";
    createdAt: Date;
}

export interface AuditLog {
    id: string;
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    details: string;
    createdAt: Date;
}
