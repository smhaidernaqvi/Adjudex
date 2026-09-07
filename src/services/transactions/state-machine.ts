/**
 * Transaction State Machine
 *
 * Governs the PRIVATE negotiation lifecycle that happens before an agreement
 * is locked. It is deliberately separate from the project execution state
 * machine (./../projects/state-machine.ts), which is unchanged.
 *
 * Flow:
 *   DRAFT → AI_REFINING → AWAITING_INITIATOR_CONFIRMATION → REQUEST_SENT
 *     REQUEST_SENT → AGREED              (counterparty accepts the same terms)
 *     REQUEST_SENT → CHANGE_REQUESTED    (counterparty asks for changes)
 *     REQUEST_SENT → REJECTED            (either party walks away)
 *     CHANGE_REQUESTED → REQUEST_SENT    (initiator revises + re-sends)
 *     CHANGE_REQUESTED → REJECTED
 *
 * DRAFT / AI_REFINING / AWAITING_INITIATOR_CONFIRMATION model the creation
 * wizard. A transaction is only persisted once the initiator has confirmed the
 * AI-refined terms, so no unrefined transaction can ever be written to storage.
 *
 * The REQUEST_SENT → REQUEST_SENT self-loop represents a re-send after
 * revision: the state is unchanged, but a NEW terms snapshot id is minted and
 * any prior counterparty acceptance is cleared.
 */

import type { TransactionStatus } from "@/types";

export const TRANSACTION_TRANSITIONS: Record<
    TransactionStatus,
    TransactionStatus[]
> = {
    DRAFT: ["AI_REFINING", "REJECTED"],
    AI_REFINING: ["AWAITING_INITIATOR_CONFIRMATION", "DRAFT", "REJECTED"],
    AWAITING_INITIATOR_CONFIRMATION: ["REQUEST_SENT", "AI_REFINING", "REJECTED"],
    REQUEST_SENT: ["REQUEST_SENT", "AGREED", "CHANGE_REQUESTED", "REJECTED"],
    CHANGE_REQUESTED: ["REQUEST_SENT", "REJECTED"],
    AGREED: [],
    REJECTED: [],
};

/**
 * Check whether a negotiation transition is allowed.
 */
export function isValidTransactionTransition(
    from: TransactionStatus,
    to: TransactionStatus,
): boolean {
    return TRANSACTION_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Statuses in which the counterparty is the party whose action is required.
 */
export const AWAITING_COUNTERPARTY: TransactionStatus[] = [
    "REQUEST_SENT",
];

/**
 * Statuses in which the initiator is the party whose action is required.
 */
export const AWAITING_INITIATOR: TransactionStatus[] = [
    "CHANGE_REQUESTED",
];

/**
 * Statuses that are terminal for the negotiation.
 */
export function isTerminalTransactionStatus(
    status: TransactionStatus,
): boolean {
    return status === "AGREED" || status === "REJECTED";
}
