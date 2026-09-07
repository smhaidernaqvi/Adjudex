/**
 * AI Module — Client-side interface
 *
 * Provides typed wrappers for the two AI features:
 *   - verifyDeliverableWithAI()  → calls /api/ai with task "verify"
 *   - refineRequirementsWithAI() → calls /api/ai with task "refine"
 *
 * All API keys, prompts, and Gemini calls live server-side in
 * src/app/api/ai/route.ts.  This file never touches the API key.
 */

import type { Requirement, Submission } from "@/types";

// ─── Types ───────────────────────────────────────────────────

export interface AIVerificationInput {
    requirements: Requirement[];
    submission: Submission;
    projectTitle: string;
    projectDescription: string;
}

export interface AIRequirementResult {
    requirementId: string;
    requirementText: string;
    status: "VERIFIED" | "UNCLEAR" | "MISSING";
    explanation: string;
    confidence: number;
}

export interface AIVerificationOutput {
    overallScore: number;
    summary: string;
    requirementResults: AIRequirementResult[];
}

export interface AIRefinementInput {
    projectTitle: string;
    projectDescription: string;
    roughRequirements: { title: string }[];
    /**
     * Criteria both parties have ALREADY locked. Pass these when refining a
     * change proposal or a revision so the model amends the set instead of
     * rewriting it and silently dropping agreed criteria. Omit on first
     * creation, when nothing has been agreed yet.
     */
    existingRequirements?: {
        title: string;
        description: string;
        isRequired: boolean;
    }[];
}

export interface RefinedRequirement {
    title: string;
    description: string;
    isRequired: boolean;
}

export interface AIRefinementOutput {
    refinedRequirements: RefinedRequirement[];
    /**
     * Ambiguities / missing information the AI identified in the rough input.
     * Surfaced to the initiator so the gaps can be settled BEFORE the request
     * is sent to the counterparty.
     */
    ambiguities: string[];
}

// ─── Internal helper ─────────────────────────────────────────

async function callAiApi(task: "verify" | "refine", input: unknown): Promise<unknown> {
    const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, input }),
    });

    // The route always answers with JSON; guard anyway so a proxy or
    // middleware redirect never surfaces as a confusing parse error.
    const text = await response.text();
    let data: { error?: unknown } = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = {};
    }

    if (!response.ok) {
        const message =
            typeof data?.error === "string"
                ? data.error
                : `AI request failed (${response.status}). Please try again.`;
        throw new Error(message);
    }

    return data;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Verify a deliverable against project requirements using AI.
 * Calls the server-side /api/ai route (task: "verify").
 */
export async function verifyDeliverableWithAI(
    input: AIVerificationInput,
): Promise<AIVerificationOutput> {
    const data = (await callAiApi("verify", input)) as AIVerificationOutput;
    return data;
}

/**
 * Refine rough requirements into testable acceptance criteria using AI.
 * Calls the server-side /api/ai route (task: "refine").
 *
 * Returns both the refined criteria and the ambiguities the model flagged.
 * Throws on any failure so the caller can preserve the user's input and offer
 * a retry — refinement is mandatory, so a failure must never be silently
 * treated as "no refinement needed".
 */
export async function refineRequirementsWithAI(
    input: AIRefinementInput,
): Promise<AIRefinementOutput> {
    const data = (await callAiApi("refine", input)) as Partial<AIRefinementOutput>;

    if (!Array.isArray(data?.refinedRequirements) || data.refinedRequirements.length === 0) {
        throw new Error("AI returned no usable requirements. Please try again.");
    }

    return {
        refinedRequirements: data.refinedRequirements,
        ambiguities: Array.isArray(data.ambiguities) ? data.ambiguities : [],
    };
}
