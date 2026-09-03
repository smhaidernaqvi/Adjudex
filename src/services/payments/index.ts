/**
 * Payment Service
 *
 * Simulated escrow / payment operations backed by localStorage.
 * No real payment processing — this is a hackathon MVP.
 *
 * Storage key: tf_payments
 */

import type { Payment } from "@/types";
import { getProjectById, transitionProject } from "@/services/projects";

// ─── Storage key ──────────────────────────────────────────────

const PAYMENTS_KEY = "tf_payments";

// ─── Stored shape (dates as ISO strings for JSON) ────────────

interface StoredPayment {
    id: string;
    projectId: string;
    amount: number;
    currency: string;
    status: "pending" | "locked" | "released" | "refunded";
    createdAt: string;
    lockedAt: string | null;
    releasedAt: string | null;
}

// ─── Conversion helpers ──────────────────────────────────────

function toPayment(stored: StoredPayment): Payment {
    return {
        ...stored,
        createdAt: new Date(stored.createdAt),
        lockedAt: stored.lockedAt ? new Date(stored.lockedAt) : null,
        releasedAt: stored.releasedAt ? new Date(stored.releasedAt) : null,
    };
}

function toStored(payment: Payment): StoredPayment {
    return {
        ...payment,
        createdAt: payment.createdAt.toISOString(),
        lockedAt: payment.lockedAt ? payment.lockedAt.toISOString() : null,
        releasedAt: payment.releasedAt ? payment.releasedAt.toISOString() : null,
    };
}

// ─── Raw storage helpers ─────────────────────────────────────

function getStoredPayments(): StoredPayment[] {
    const raw = localStorage.getItem(PAYMENTS_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function saveStoredPayments(payments: StoredPayment[]): void {
    localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments));
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Get the payment record for a project. Returns null if none exists.
 */
export function getPaymentByProjectId(projectId: string): Payment | null {
    const stored = getStoredPayments().find((p) => p.projectId === projectId);
    return stored ? toPayment(stored) : null;
}

/**
 * Create a PENDING payment for a project.
 *
 * Validates:
 * - Project exists
 * - Freelancer has been accepted (project status === FREELANCER_ACCEPTED or later)
 * - No payment already exists for this project
 * - Amount matches the project budget
 */
export function createPayment(
    projectId: string,
    clientId: string,
): Payment {
    const project = getProjectById(projectId);
    if (!project) throw new Error("Project not found.");
    if (project.clientId !== clientId)
        throw new Error("Only the project client can create payments.");
    if (!project.freelancerId)
        throw new Error("A freelancer must accept the project before locking payment.");

    const existing = getPaymentByProjectId(projectId);
    if (existing) throw new Error("A payment already exists for this project.");

    const payment: Payment = {
        id: crypto.randomUUID(),
        projectId,
        amount: project.budget,
        currency: project.currency,
        status: "pending",
        createdAt: new Date(),
        lockedAt: null,
        releasedAt: null,
    };

    const payments = getStoredPayments();
    payments.push(toStored(payment));
    saveStoredPayments(payments);

    return payment;
}

/**
 * Lock an existing PENDING payment (simulated escrow).
 *
 * Validates:
 * - Payment exists for the project
 * - Payment is in "pending" status
 * - Caller is the project client
 */
export function lockPayment(
    projectId: string,
    clientId: string,
): Payment {
    const project = getProjectById(projectId);
    if (!project) throw new Error("Project not found.");
    if (project.clientId !== clientId)
        throw new Error("Only the project client can lock payment.");

    const payments = getStoredPayments();
    const idx = payments.findIndex((p) => p.projectId === projectId);
    if (idx === -1) throw new Error("No payment found for this project.");

    const current = payments[idx];
    if (current.status !== "pending")
        throw new Error(`Cannot lock payment in status "${current.status}".`);

    payments[idx] = {
        ...current,
        status: "locked",
        lockedAt: new Date().toISOString(),
    };
    saveStoredPayments(payments);

    return toPayment(payments[idx]);
}

/**
 * Release a LOCKED payment and complete the project.
 *
 * Validates:
 * - Project exists
 * - Caller is the project client
 * - Project is APPROVED
 * - Payment exists and is LOCKED
 * - Payment has not already been released
 *
 * On success:
 * - Payment status: LOCKED → RELEASED
 * - Project transitions: APPROVED → PAYMENT_RELEASED → FINAL_DELIVERY_RELEASED → COMPLETED
 *
 * This is the final step in the happy path.
 * NO REAL MONEY MOVES — this is a simulated hackathon payment.
 */
export function releasePayment(
    projectId: string,
    clientId: string,
): Payment {
    const project = getProjectById(projectId);
    if (!project) throw new Error("Project not found.");

    if (project.clientId !== clientId) {
        throw new Error("Only the project client can release payment.");
    }

    if (project.status !== "APPROVED") {
        throw new Error(
            `Project is in "${project.status}" status. Payment can only be released after approval.`,
        );
    }

    const payments = getStoredPayments();
    const idx = payments.findIndex((p) => p.projectId === projectId);
    if (idx === -1) throw new Error("No payment found for this project.");

    const current = payments[idx];
    if (current.status === "released") {
        throw new Error("Payment has already been released.");
    }
    if (current.status !== "locked") {
        throw new Error(
            `Cannot release payment in status "${current.status}".`,
        );
    }

    // Update payment: LOCKED → RELEASED
    payments[idx] = {
        ...current,
        status: "released",
        releasedAt: new Date().toISOString(),
    };
    saveStoredPayments(payments);

    // Transition project: APPROVED → PAYMENT_RELEASED → FINAL_DELIVERY_RELEASED → COMPLETED
    transitionProject(projectId, "PAYMENT_RELEASED");
    transitionProject(projectId, "FINAL_DELIVERY_RELEASED");
    transitionProject(projectId, "COMPLETED");

    return toPayment(payments[idx]);
}
