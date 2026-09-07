/**
 * StatusBadge — Displays transaction, project or payment status with color coding
 */

import { Badge } from "./Badge";
import type { ProjectStatus, TransactionStatus } from "@/types";

interface StatusBadgeProps {
    status: ProjectStatus | TransactionStatus | string;
}

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "danger"> = {
    // ── Negotiation (private transaction) ──
    DRAFT: "default",
    AI_REFINING: "warning",
    AWAITING_INITIATOR_CONFIRMATION: "warning",
    REQUEST_SENT: "warning",
    CHANGE_REQUESTED: "danger",
    AGREED: "success",
    REJECTED: "danger",

    // ── Execution (locked agreement) ──
    CREATED: "default",
    FREELANCER_ACCEPTED: "default",
    PAYMENT_LOCKED: "warning",
    IN_PROGRESS: "warning",
    SUBMITTED: "default",
    AI_VERIFICATION: "warning",
    CLIENT_REVIEW: "warning",
    REVISION_REQUIRED: "danger",
    DISPUTED: "danger",
    APPROVED: "success",
    PAYMENT_RELEASED: "success",
    FINAL_DELIVERY_RELEASED: "success",
    COMPLETED: "success",
};

/**
 * Human labels. Negotiation wording is deliberately neutral — either party can
 * initiate, so nothing says "client posted a job" or "freelancer claimed it".
 */
const STATUS_LABEL: Record<string, string> = {
    DRAFT: "Draft",
    AI_REFINING: "AI Refining",
    AWAITING_INITIATOR_CONFIRMATION: "Awaiting Your Confirmation",
    REQUEST_SENT: "Awaiting Response",
    CHANGE_REQUESTED: "Changes Requested",
    AGREED: "Agreement Locked",
    REJECTED: "Declined",

    CREATED: "Created",
    FREELANCER_ACCEPTED: "Awaiting Escrow",
    PAYMENT_LOCKED: "Payment Locked",
    IN_PROGRESS: "In Progress",
    SUBMITTED: "Delivered",
    AI_VERIFICATION: "AI Verifying",
    CLIENT_REVIEW: "Awaiting Review",
    REVISION_REQUIRED: "Revision Required",
    DISPUTED: "Disputed",
    APPROVED: "Approved",
    PAYMENT_RELEASED: "Payment Released",
    FINAL_DELIVERY_RELEASED: "Delivery Released",
    COMPLETED: "Completed",
};

export function StatusBadge({ status }: StatusBadgeProps) {
    const variant = STATUS_VARIANT[status] ?? "default";
    const label = STATUS_LABEL[status] ?? status.replace(/_/g, " ");
    return <Badge variant={variant}>{label}</Badge>;
}
