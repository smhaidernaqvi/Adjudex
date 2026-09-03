/**
 * Approval Service
 *
 * Handles deliverable approval by the client.
 * Does NOT release payment — Feature 8 will handle that.
 *
 * On approval, the project transitions:
 *   CLIENT_REVIEW → APPROVED
 */

import type { Approval } from "@/types";
import { getProjectById, transitionProject } from "@/services/projects";
import { getSubmissionByProjectId } from "@/services/submissions";
import { getVerificationByProjectId } from "@/services/verification";

// ─── Storage key ─────────────────────────────────────────────

const APPROVALS_KEY = "tf_approvals";

// ─── Stored shape ────────────────────────────────────────────

interface StoredApproval {
    id: string;
    projectId: string;
    approvedBy: string;
    approvedAt: string;
    notes: string | null;
}

// ─── Conversion helpers ──────────────────────────────────────

function toApproval(stored: StoredApproval): Approval {
    return {
        ...stored,
        approvedAt: new Date(stored.approvedAt),
    };
}

function toStored(a: Approval): StoredApproval {
    return {
        ...a,
        approvedAt: a.approvedAt.toISOString(),
    };
}

// ─── Raw storage helpers ─────────────────────────────────────

function getStoredApprovals(): StoredApproval[] {
    const raw = localStorage.getItem(APPROVALS_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function saveStoredApprovals(approvals: StoredApproval[]): void {
    localStorage.setItem(APPROVALS_KEY, JSON.stringify(approvals));
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Get approval for a project.
 * Returns null if no approval exists.
 */
export function getApprovalByProjectId(projectId: string): Approval | null {
    const found = getStoredApprovals().find((a) => a.projectId === projectId);
    return found ? toApproval(found) : null;
}

/**
 * Approve a deliverable.
 *
 * Validates:
 * - Project exists
 * - Caller is the project client
 * - Project is in CLIENT_REVIEW state
 * - Submission exists
 * - AI verification exists (completed)
 * - No existing approval
 *
 * Transitions project: CLIENT_REVIEW → APPROVED
 *
 * Does NOT call releasePayment() — Feature 8 handles that.
 */
export function approveDeliverable(
    projectId: string,
    clientId: string,
    notes?: string,
): Approval {
    const project = getProjectById(projectId);
    if (!project) throw new Error("Project not found.");

    if (project.clientId !== clientId) {
        throw new Error("Only the project client can approve deliverables.");
    }

    if (project.status !== "CLIENT_REVIEW") {
        throw new Error(
            `Project is in "${project.status}" status. Approval requires CLIENT_REVIEW status.`,
        );
    }

    const submission = getSubmissionByProjectId(projectId);
    if (!submission) {
        throw new Error("No deliverable submission found for this project.");
    }

    const verification = getVerificationByProjectId(projectId);
    if (!verification || verification.status !== "completed") {
        throw new Error(
            "AI verification must be completed before approving.",
        );
    }

    const existing = getApprovalByProjectId(projectId);
    if (existing) {
        throw new Error("This deliverable has already been approved.");
    }

    // Transition project: CLIENT_REVIEW → APPROVED
    transitionProject(projectId, "APPROVED");

    // Store approval record
    const approval: Approval = {
        id: crypto.randomUUID(),
        projectId,
        approvedBy: clientId,
        approvedAt: new Date(),
        notes: notes || null,
    };

    const approvals = getStoredApprovals();
    approvals.push(toStored(approval));
    saveStoredApprovals(approvals);

    return approval;
}
