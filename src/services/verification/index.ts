/**
 * Verification Service
 *
 * Orchestrates AI verification of freelancer deliverables.
 * Persists verification results to localStorage (tf_verifications).
 *
 * Flow:
 *   SUBMITTED project
 *     → load the CURRENT MUTUALLY AGREED requirement version + submission
 *     → call the server-side AI route
 *     → store the verification result, stamped with the version it checked
 *     → transition project SUBMITTED → AI_VERIFICATION → CLIENT_REVIEW
 *
 * Privacy: verification results are private to the two parties. Every entry
 * point takes the acting user id and refuses non-participants.
 *
 * Correctness: verification NEVER runs against the original rough requirements,
 * an unaccepted change proposal, or a one-sided edit — it reads the latest
 * AgreementVersion, which by construction only exists once both parties
 * accepted that exact set of terms.
 */

import type { AIVerificationResult } from "@/types";
import { isProjectParticipant } from "@/lib/authz";
import {
    getProjectById,
    getRequirementsByProjectId,
    transitionProject,
} from "@/services/projects";
import { getCurrentAgreementVersion } from "@/services/agreements";
import { getSubmissionByProjectId } from "@/services/submissions";
import {
    verifyDeliverableWithAI,
} from "@/lib/ai";
import type { AIVerificationInput } from "@/lib/ai";

// ─── Storage key ─────────────────────────────────────────────

const VERIFICATIONS_KEY = "tf_verifications";

// ─── Stored shape (dates as ISO strings) ─────────────────────

interface StoredVerification {
    id: string;
    projectId: string;
    submissionId: string;
    overallScore: number;
    summary: string;
    requirementResults: {
        requirementId: string;
        requirementText: string;
        status: "VERIFIED" | "UNCLEAR" | "MISSING";
        explanation: string;
        confidence: number;
    }[];
    status: "pending" | "completed" | "failed";
    agreementVersionId: string | null;
    agreementVersion: number | null;
    createdAt: string;
}

// ─── Conversion helpers ──────────────────────────────────────

function toVerification(stored: StoredVerification): AIVerificationResult {
    return {
        ...stored,
        createdAt: new Date(stored.createdAt),
    };
}

function toStored(v: AIVerificationResult): StoredVerification {
    return {
        ...v,
        createdAt: v.createdAt.toISOString(),
    };
}

// ─── Raw storage helpers ─────────────────────────────────────

function getStoredVerifications(): StoredVerification[] {
    const raw = localStorage.getItem(VERIFICATIONS_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function saveStoredVerifications(vers: StoredVerification[]): void {
    localStorage.setItem(VERIFICATIONS_KEY, JSON.stringify(vers));
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Get the latest completed verification for a project.
 *
 * RAW READ — no authorization. Services use it internally; UI code must call
 * getVerificationForUser().
 */
export function getVerificationByProjectId(
    projectId: string,
): AIVerificationResult | null {
    const all = getStoredVerifications().filter(
        (v) => v.projectId === projectId && v.status === "completed",
    );
    if (all.length === 0) return null;
    const sorted = all.sort(
        (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return toVerification(sorted[0]);
}

/**
 * Authorized read: the verification report, but only for a party to the
 * transaction. Returns null for anyone else.
 */
export function getVerificationForUser(
    projectId: string,
    userId: string | null | undefined,
): AIVerificationResult | null {
    const project = getProjectById(projectId);
    if (!project || !isProjectParticipant(project, userId)) return null;
    return getVerificationByProjectId(projectId);
}

/**
 * The latest verification record of ANY status (used to surface failures).
 * Authorized — participants only.
 */
export function getLatestVerificationRecordForUser(
    projectId: string,
    userId: string | null | undefined,
): AIVerificationResult | null {
    const project = getProjectById(projectId);
    if (!project || !isProjectParticipant(project, userId)) return null;

    const all = getStoredVerifications()
        .filter((v) => v.projectId === projectId)
        .sort(
            (a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
    return all.length > 0 ? toVerification(all[0]) : null;
}

/**
 * Run AI verification on a submitted deliverable.
 *
 * Validates:
 * - The caller is one of the two parties to this transaction
 * - Project exists and is in SUBMITTED state
 * - A mutually agreed, locked requirement version exists
 * - Submission exists and belongs to the project
 * - No completed verification already exists
 *
 * On success:
 * - Calls the server-side AI route with the AGREED requirements
 * - Stores the verification result, stamped with the agreement version
 * - Transitions project: SUBMITTED → AI_VERIFICATION → CLIENT_REVIEW
 *
 * On failure:
 * - Stores a "failed" verification record so the user can retry
 * - Throws with descriptive error
 */
export async function runVerification(
    projectId: string,
    actingUserId: string,
): Promise<AIVerificationResult> {
    // ── Validate project + authorization ────────────────────
    const project = getProjectById(projectId);
    if (!project) throw new Error("Transaction not found.");

    if (!isProjectParticipant(project, actingUserId)) {
        throw new Error("You do not have access to this transaction.");
    }

    if (project.status !== "SUBMITTED") {
        throw new Error(
            `Project is in "${project.status}" status. Verification requires SUBMITTED status.`,
        );
    }

    // ── Validate submission ─────────────────────────────────
    const submission = getSubmissionByProjectId(projectId);
    if (!submission) {
        throw new Error("No deliverable submission found for this project.");
    }

    // ── Check for existing verification ─────────────────────
    const existing = getVerificationByProjectId(projectId);
    if (existing) {
        throw new Error(
            "This project has already been verified. Re-verification is not supported yet.",
        );
    }

    // ── Load the LOCKED, mutually agreed requirements ───────
    // Never the rough input, never a pending change proposal.
    const agreedVersion = getCurrentAgreementVersion(projectId);
    if (!agreedVersion) {
        throw new Error(
            "No mutually agreed requirement version exists for this transaction, so there is nothing objective to verify against.",
        );
    }
    const requirements = getRequirementsByProjectId(projectId);

    // ── Build AI input ──────────────────────────────────────
    const aiInput: AIVerificationInput = {
        requirements,
        submission,
        projectTitle: project.title,
        projectDescription: project.description,
    };

    // ── Create pending verification record ──────────────────
    const verificationId = crypto.randomUUID();
    const pendingVerification: AIVerificationResult = {
        id: verificationId,
        projectId,
        submissionId: submission.id,
        overallScore: 0,
        summary: "",
        requirementResults: [],
        status: "pending",
        agreementVersionId: agreedVersion.id,
        agreementVersion: agreedVersion.version,
        createdAt: new Date(),
    };

    const verifications = getStoredVerifications();
    verifications.push(toStored(pendingVerification));
    saveStoredVerifications(verifications);

    // ── Call AI ─────────────────────────────────────────────
    try {
        const aiOutput = await verifyDeliverableWithAI(aiInput);

        // Build completed verification
        const completed: AIVerificationResult = {
            id: verificationId,
            projectId,
            submissionId: submission.id,
            overallScore: aiOutput.overallScore,
            summary: aiOutput.summary,
            requirementResults: aiOutput.requirementResults,
            status: "completed",
            agreementVersionId: agreedVersion.id,
            agreementVersion: agreedVersion.version,
            createdAt: new Date(),
        };

        // Update storage: replace pending with completed
        const stored = getStoredVerifications();
        const idx = stored.findIndex((v) => v.id === verificationId);
        if (idx !== -1) {
            stored[idx] = toStored(completed);
        } else {
            stored.push(toStored(completed));
        }
        saveStoredVerifications(stored);

        // ── Transition project: SUBMITTED → AI_VERIFICATION → CLIENT_REVIEW
        transitionProject(projectId, "AI_VERIFICATION");
        transitionProject(projectId, "CLIENT_REVIEW");

        return completed;
    } catch (err) {
        // Store failed verification
        const failed: AIVerificationResult = {
            id: verificationId,
            projectId,
            submissionId: submission.id,
            overallScore: 0,
            summary:
                err instanceof Error
                    ? `Verification failed: ${err.message}`
                    : "Verification failed due to an unknown error.",
            requirementResults: [],
            status: "failed",
            agreementVersionId: agreedVersion.id,
            agreementVersion: agreedVersion.version,
            createdAt: new Date(),
        };

        const stored = getStoredVerifications();
        const idx = stored.findIndex((v) => v.id === verificationId);
        if (idx !== -1) {
            stored[idx] = toStored(failed);
        }
        saveStoredVerifications(stored);

        throw err;
    }
}

/**
 * Remove a failed verification record to allow retry.
 * Only removes failed records — completed verifications are kept.
 * Participants only.
 */
export function clearFailedVerification(
    projectId: string,
    actingUserId: string,
): void {
    const project = getProjectById(projectId);
    if (!project || !isProjectParticipant(project, actingUserId)) return;

    const stored = getStoredVerifications();
    const filtered = stored.filter(
        (v) => !(v.projectId === projectId && v.status === "failed"),
    );
    saveStoredVerifications(filtered);
}
