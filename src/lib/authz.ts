/**
 * Authorization predicates — the privacy core of Adjudex.
 *
 * A transaction and the project it produces are PRIVATE to exactly two
 * accounts. Every read and every write in the transaction, project,
 * submission, verification, approval and dispute paths must gate on these
 * predicates before touching or returning data.
 *
 * This module is intentionally pure: it takes already-loaded entities and
 * answers yes/no. It never reads storage, which keeps it a dependency-free
 * leaf that any service can import without creating a cycle.
 */

import type { Project, Transaction, User } from "@/types";

/** Thrown when a user tries to touch data they are not a party to. */
export class AuthorizationError extends Error {
    constructor(message = "You do not have access to this transaction.") {
        super(message);
        this.name = "AuthorizationError";
    }
}

// ─── Transaction ─────────────────────────────────────────────

/**
 * True when `userId` is the initiator or the invited counterparty.
 * This is the ONLY way a transaction becomes visible.
 */
export function isTransactionParticipant(
    transaction: Transaction,
    userId: string | null | undefined,
): boolean {
    if (!userId) return false;
    return (
        transaction.initiatorUserId === userId ||
        transaction.counterpartyUserId === userId
    );
}

/** True when `userId` started the negotiation. */
export function isTransactionInitiator(
    transaction: Transaction,
    userId: string | null | undefined,
): boolean {
    return !!userId && transaction.initiatorUserId === userId;
}

/** True when `userId` was invited and must accept / request changes / reject. */
export function isTransactionCounterparty(
    transaction: Transaction,
    userId: string | null | undefined,
): boolean {
    return !!userId && transaction.counterpartyUserId === userId;
}

/** Throws unless `userId` is one of the two participants. */
export function assertTransactionParticipant(
    transaction: Transaction,
    userId: string | null | undefined,
): void {
    if (!isTransactionParticipant(transaction, userId)) {
        throw new AuthorizationError();
    }
}

// ─── Project (post-agreement execution) ─────────────────────

/**
 * True when `userId` is the paying client or the delivering freelancer on
 * this project. Projects are never public — there is no marketplace listing.
 */
export function isProjectParticipant(
    project: Project,
    userId: string | null | undefined,
): boolean {
    if (!userId) return false;
    return project.clientId === userId || project.freelancerId === userId;
}

/** Throws unless `userId` is a party to the project. */
export function assertProjectParticipant(
    project: Project,
    userId: string | null | undefined,
): void {
    if (!isProjectParticipant(project, userId)) {
        throw new AuthorizationError(
            "You do not have access to this transaction.",
        );
    }
}

// ─── Role mapping ────────────────────────────────────────────

/**
 * Map the two negotiating parties onto the execution roles the downstream
 * services depend on.
 *
 * Every escrow/review operation is keyed on `Project.clientId` (payer,
 * reviewer, releaser) and `Project.freelancerId` (worker, submitter), so the
 * mapping is by ROLE, not by who initiated. A freelancer-initiated request
 * still produces `clientId` = the client party.
 *
 * Returns null when the two parties do not have opposite roles — there is then
 * no defined payer/worker split, and the transaction cannot be created.
 */
export function resolveExecutionRoles(
    initiator: User,
    counterparty: User,
): { clientId: string; freelancerId: string } | null {
    const parties = [initiator, counterparty];
    const client = parties.find((p) => p.role === "client");
    const freelancer = parties.find((p) => p.role === "freelancer");

    if (!client || !freelancer || client.id === freelancer.id) return null;

    return { clientId: client.id, freelancerId: freelancer.id };
}

/** The role the counterparty must have for a valid two-sided transaction. */
export function requiredCounterpartyRole(
    initiatorRole: User["role"],
): User["role"] | null {
    if (initiatorRole === "client") return "freelancer";
    if (initiatorRole === "freelancer") return "client";
    return null;
}
