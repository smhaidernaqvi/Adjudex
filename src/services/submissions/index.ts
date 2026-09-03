/**
 * Submission Service
 *
 * Handles deliverable submission by the freelancer.
 * Persists data to localStorage (tf_submissions).
 *
 * On submission, the project transitions through:
 *   FREELANCER_ACCEPTED → PAYMENT_LOCKED → IN_PROGRESS → SUBMITTED
 *
 * Feature 6 (AI Verification) will read the submission from
 * getSubmissionByProjectId() and transition SUBMITTED → AI_VERIFICATION.
 */

import type { Submission } from "@/types";
import { getProjectById, transitionProject } from "@/services/projects";
import { getPaymentByProjectId } from "@/services/payments";

// ─── Storage key ──────────────────────────────────────────────

const SUBMISSIONS_KEY = "tf_submissions";

// ─── Stored shape (dates as ISO strings) ─────────────────────

interface StoredSubmission {
    id: string;
    projectId: string;
    freelancerId: string;
    title: string;
    description: string;
    fileUrl: string | null;
    status: "submitted" | "under_review" | "approved" | "revision_requested";
    submittedAt: string;
}

// ─── Conversion helpers ──────────────────────────────────────

function toSubmission(stored: StoredSubmission): Submission {
    return {
        ...stored,
        submittedAt: new Date(stored.submittedAt),
    };
}

function toStored(sub: Submission): StoredSubmission {
    return {
        ...sub,
        submittedAt: sub.submittedAt.toISOString(),
    };
}

// ─── Raw storage helpers ─────────────────────────────────────

function getStoredSubmissions(): StoredSubmission[] {
    const raw = localStorage.getItem(SUBMISSIONS_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function saveStoredSubmissions(subs: StoredSubmission[]): void {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(subs));
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Get the latest submission for a project.
 * Returns null if no submission exists.
 */
export function getSubmissionByProjectId(projectId: string): Submission | null {
    const all = getStoredSubmissions().filter((s) => s.projectId === projectId);
    if (all.length === 0) return null;
    // Return the most recent submission
    const sorted = all.sort(
        (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
    );
    return toSubmission(sorted[0]);
}

/**
 * Create a deliverable submission.
 *
 * Validates:
 * - Project exists
 * - Caller is the assigned freelancer
 * - Payment for the project is LOCKED
 * - No existing submission in "submitted" status (prevent duplicate)
 *
 * On success, transitions the project:
 *   FREELANCER_ACCEPTED → PAYMENT_LOCKED → IN_PROGRESS → SUBMITTED
 */
export function createSubmission(data: {
    projectId: string;
    freelancerId: string;
    title: string;
    description: string;
    fileUrl?: string;
}): Submission {
    const project = getProjectById(data.projectId);
    if (!project) throw new Error("Project not found.");

    if (project.freelancerId !== data.freelancerId) {
        throw new Error("Only the assigned freelancer can submit deliverables.");
    }

    // Check payment is locked
    const payment = getPaymentByProjectId(data.projectId);
    if (!payment || payment.status !== "locked") {
        throw new Error("Payment must be locked before submitting a deliverable.");
    }

    // Check for existing active submission
    const existing = getSubmissionByProjectId(data.projectId);
    if (existing && existing.status === "submitted") {
        throw new Error(
            "A deliverable has already been submitted. Wait for client review.",
        );
    }

    // Validate URL if provided
    if (data.fileUrl) {
        try {
            new URL(data.fileUrl);
        } catch {
            throw new Error("Please enter a valid URL.");
        }
    }

    // Transition project through the state machine
    // FREELANCER_ACCEPTED → PAYMENT_LOCKED → IN_PROGRESS → SUBMITTED
    if (project.status === "FREELANCER_ACCEPTED") {
        transitionProject(data.projectId, "PAYMENT_LOCKED");
    }
    const p2 = getProjectById(data.projectId);
    if (p2 && p2.status === "PAYMENT_LOCKED") {
        transitionProject(data.projectId, "IN_PROGRESS");
    }
    const p3 = getProjectById(data.projectId);
    if (p3 && p3.status === "IN_PROGRESS") {
        transitionProject(data.projectId, "SUBMITTED");
    }

    // Create the submission record
    const submission: Submission = {
        id: crypto.randomUUID(),
        projectId: data.projectId,
        freelancerId: data.freelancerId,
        title: data.title,
        description: data.description,
        fileUrl: data.fileUrl || null,
        status: "submitted",
        submittedAt: new Date(),
    };

    const subs = getStoredSubmissions();
    subs.push(toStored(submission));
    saveStoredSubmissions(subs);

    return submission;
}

/**
 * Update a submission's status (for future use by AI verification / client review).
 */
export function updateSubmissionStatus(
    submissionId: string,
    newStatus: Submission["status"],
): Submission {
    const subs = getStoredSubmissions();
    const idx = subs.findIndex((s) => s.id === submissionId);
    if (idx === -1) throw new Error("Submission not found.");

    subs[idx] = { ...subs[idx], status: newStatus };
    saveStoredSubmissions(subs);

    return toSubmission(subs[idx]);
}
