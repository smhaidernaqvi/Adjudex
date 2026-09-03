/**
 * StatusBadge — Displays project or payment status with color coding
 */

import { Badge } from "./Badge";
import type { ProjectStatus } from "@/types";

interface StatusBadgeProps {
    status: ProjectStatus | string;
}

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "danger"> = {
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

export function StatusBadge({ status }: StatusBadgeProps) {
    const variant = STATUS_VARIANT[status] ?? "default";
    return <Badge variant={variant}>{status.replace(/_/g, " ")}</Badge>;
}
