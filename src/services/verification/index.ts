/**
 * Verification Service
 *
 * Orchestrates AI verification of freelancer deliverables.
 * Persists verification results to localStorage (tf_verifications).
 *
 * Flow:
 *   SUBMITTED project
 *     → load requirements + submission
 *     → call AI service
 *     → store verification result
 *     → transition project SUBMITTED → AI_VERIFICATION → CLIENT_REVIEW
 *
 * Feature 7 (Client Review / Approval) will read the verification from
 * getVerificationByProjectId() and act on it.
 */

import type { AIVerificationResult } from "@/types";
import {
    getProjectById,
    getRequirementsByProjectId,
    transitionProject,
} from "@/services/projects";
import { getSubmissionByProjectId } from "@/services/submissions";
import {
    verifyDeliverableWithAI,
    isAIConfigured,
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
 * Returns null if no verification exists.
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
 * Check if AI verification is available (API key configured).
 */
export function isVerificationAvailable(): boolean {
    return isAIConfigured();
}

/**
 * Run AI verification on a submitted deliverable.
 *
 * Validates:
 * - Project exists and is in SUBMITTED state
 * - Submission exists and belongs to the project
 * - No completed verification already exists (unless re-verification is needed)
 * - AI API key is configured
 *
 * On success:
 * - Calls AI service
 * - Stores verification result
 * - Transitions project: SUBMITTED → AI_VERIFICATION → CLIENT_REVIEW
 *
 * On failure:
 * - Stores a "failed" verification record
 * - Throws with descriptive error
 */
export async function runVerification(
    projectId: string,
): Promise<AIVerificationResult> {
    // ── Validate project ────────────────────────────────────
    const project = getProjectById(projectId);
    if (!project) throw new Error("Project not found.");

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

    // ── Check AI availability ───────────────────────────────
    if (!isAIConfigured()) {
        throw new Error(
            "AI verification is not configured. Add NEXT_PUBLIC_AI_API_KEY to your .env.local file.",
        );
    }

    // ── Load requirements ───────────────────────────────────
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
 */
export function clearFailedVerification(projectId: string): void {
    const stored = getStoredVerifications();
    const filtered = stored.filter(
        (v) => !(v.projectId === projectId && v.status === "failed"),
    );
    saveStoredVerifications(filtered);
}
