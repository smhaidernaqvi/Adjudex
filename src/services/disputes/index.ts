/**
 * Dispute Service
 *
 * Handles dispute creation by the client.
 * Persists data to localStorage (tf_disputes).
 *
 * On dispute, the project transitions:
 *   CLIENT_REVIEW → DISPUTED
 *
 * Payment remains LOCKED — Feature 8 will handle dispute resolution.
 */

import type { Dispute, DisputeCategory } from "@/types";
import { getProjectById, transitionProject } from "@/services/projects";
import { getSubmissionByProjectId } from "@/services/submissions";
import { getVerificationByProjectId } from "@/services/verification";

// ─── Storage key ─────────────────────────────────────────────

const DISPUTES_KEY = "tf_disputes";

// ─── Stored shape ────────────────────────────────────────────

interface StoredDispute {
    id: string;
    projectId: string;
    submissionId: string;
    raisedBy: string;
    reason: string;
    category: DisputeCategory;
    status: "open" | "under_review" | "resolved";
    createdAt: string;
}

// ─── Conversion helpers ──────────────────────────────────────

function toDispute(stored: StoredDispute): Dispute {
    return {
        ...stored,
        createdAt: new Date(stored.createdAt),
    };
}

function toStored(d: Dispute): StoredDispute {
    return {
        ...d,
        createdAt: d.createdAt.toISOString(),
    };
}

// ─── Raw storage helpers ─────────────────────────────────────

function getStoredDisputes(): StoredDispute[] {
    const raw = localStorage.getItem(DISPUTES_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function saveStoredDisputes(disputes: StoredDispute[]): void {
    localStorage.setItem(DISPUTES_KEY, JSON.stringify(disputes));
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Get the active dispute for a project.
 * Returns null if no open/active dispute exists.
 */
export function getDisputeByProjectId(projectId: string): Dispute | null {
    const all = getStoredDisputes().filter(
        (d) =>
            d.projectId === projectId &&
            (d.status === "open" || d.status === "under_review"),
    );
    if (all.length === 0) return null;
    const sorted = all.sort(
        (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return toDispute(sorted[0]);
}

/**
 * Get any dispute (including resolved) for a project.
 */
export function getAnyDisputeByProjectId(
    projectId: string,
): Dispute | null {
    const all = getStoredDisputes().filter((d) => d.projectId === projectId);
    if (all.length === 0) return null;
    const sorted = all.sort(
        (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return toDispute(sorted[0]);
}

/**
 * Create a dispute against a deliverable.
 *
 * Validates:
 * - Project exists
 * - Caller is the project client
 * - Project is in CLIENT_REVIEW state
 * - Submission exists
 * - AI verification exists (completed)
 * - No existing active dispute
 * - Reason is not empty
 *
 * Transitions project: CLIENT_REVIEW → DISPUTED
 * Payment remains LOCKED.
 */
export function createDispute(data: {
    projectId: string;
    clientId: string;
    reason: string;
    category: DisputeCategory;
}): Dispute {
    const project = getProjectById(data.projectId);
    if (!project) throw new Error("Project not found.");

    if (project.clientId !== data.clientId) {
        throw new Error("Only the project client can raise disputes.");
    }

    if (project.status !== "CLIENT_REVIEW") {
        throw new Error(
            `Project is in "${project.status}" status. Disputes require CLIENT_REVIEW status.`,
        );
    }

    const submission = getSubmissionByProjectId(data.projectId);
    if (!submission) {
        throw new Error("No deliverable submission found for this project.");
    }

    const verification = getVerificationByProjectId(data.projectId);
    if (!verification || verification.status !== "completed") {
        throw new Error(
            "AI verification must be completed before raising a dispute.",
        );
    }

    if (!data.reason.trim()) {
        throw new Error("Dispute reason is required.");
    }

    const existing = getDisputeByProjectId(data.projectId);
    if (existing) {
        throw new Error("An active dispute already exists for this project.");
    }

    // Transition project: CLIENT_REVIEW → DISPUTED
    transitionProject(data.projectId, "DISPUTED");

    // Create dispute record
    const dispute: Dispute = {
        id: crypto.randomUUID(),
        projectId: data.projectId,
        submissionId: submission.id,
        raisedBy: data.clientId,
        reason: data.reason.trim(),
        category: data.category,
        status: "open",
        createdAt: new Date(),
    };

    const disputes = getStoredDisputes();
    disputes.push(toStored(dispute));
    saveStoredDisputes(disputes);

    return dispute;
}
