/**
 * Project State Machine
 *
 * Defines the valid transitions between project states.
 * This will be enforced in the project service layer.
 *
 * Flow:
 *   CREATED → FREELANCER_ACCEPTED → PAYMENT_LOCKED → IN_PROGRESS →
 *   SUBMITTED → AI_VERIFICATION → CLIENT_REVIEW →
 *     → APPROVED → PAYMENT_RELEASED → FINAL_DELIVERY_RELEASED → COMPLETED
 *     → REVISION_REQUIRED → IN_PROGRESS (loop)
 *     → DISPUTED
 */

import type { ProjectStatus } from "@/types";

/**
 * Map of valid state transitions.
 * Each key is a source state; the value is the set of states it can transition to.
 */
export const PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
    CREATED: ["FREELANCER_ACCEPTED"],
    FREELANCER_ACCEPTED: ["PAYMENT_LOCKED"],
    PAYMENT_LOCKED: ["IN_PROGRESS"],
    IN_PROGRESS: ["SUBMITTED"],
    SUBMITTED: ["AI_VERIFICATION"],
    AI_VERIFICATION: ["CLIENT_REVIEW"],
    CLIENT_REVIEW: ["APPROVED", "REVISION_REQUIRED", "DISPUTED"],
    REVISION_REQUIRED: ["IN_PROGRESS"],
    DISPUTED: [],
    APPROVED: ["PAYMENT_RELEASED"],
    PAYMENT_RELEASED: ["FINAL_DELIVERY_RELEASED"],
    FINAL_DELIVERY_RELEASED: ["COMPLETED"],
    COMPLETED: [],
};

/**
 * Check whether a transition from one state to another is valid.
 */
export function isValidTransition(
    from: ProjectStatus,
    to: ProjectStatus
): boolean {
    return PROJECT_TRANSITIONS[from]?.includes(to) ?? false;
}
