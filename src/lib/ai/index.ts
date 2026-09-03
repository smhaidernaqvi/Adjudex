/**
 * AI Module — Deliverable Verification
 *
 * Provides a clean abstraction for AI-powered deliverable verification.
 * Uses an OpenAI-compatible API endpoint via environment variable.
 *
 * Environment variables (set in .env.local):
 *   AI_API_KEY  — API key for the AI provider
 *   AI_API_URL  — (optional) Override API endpoint (defaults to OpenAI)
 *   AI_MODEL    — (optional) Model name (defaults to gpt-4o-mini)
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

// ─── Environment helpers ─────────────────────────────────────

function getApiKey(): string | null {
    // In browser environment, use NEXT_PUBLIC_ prefix
    // For client-side calls, the key must be public (hackathon demo)
    return (
        typeof process !== "undefined"
            ? process.env.NEXT_PUBLIC_AI_API_KEY
            : null
    ) ?? null;
}

function getApiUrl(): string {
    return (
        (typeof process !== "undefined"
            ? process.env.NEXT_PUBLIC_AI_API_URL
            : null) ?? "https://api.openai.com/v1/chat/completions"
    );
}

function getModel(): string {
    return (
        (typeof process !== "undefined"
            ? process.env.NEXT_PUBLIC_AI_MODEL
            : null) ?? "gpt-4o-mini"
    );
}

/**
 * Returns true if the AI API key is configured.
 */
export function isAIConfigured(): boolean {
    return getApiKey() !== null && getApiKey() !== "";
}

// ─── Prompt construction ─────────────────────────────────────

function buildSystemPrompt(): string {
    return `You are a neutral, professional deliverable verifier for a freelancing platform.

Your job is to compare a freelancer's submitted deliverable against the project's requirements.

For EACH requirement, you must:
- Compare the requirement text against the submitted evidence
- Determine one of three statuses:
  - VERIFIED: The submission clearly addresses this requirement with sufficient evidence
  - UNCLEAR: The submission mentions something related but evidence is insufficient or ambiguous
  - MISSING: The submission does not address this requirement at all
- Provide a brief explanation (1-2 sentences) of your reasoning
- Provide a confidence score between 0.0 and 1.0

IMPORTANT RULES:
- Do NOT assume something is completed without clear evidence in the submission text
- Mark unsupported claims as UNCLEAR rather than VERIFIED
- Mark clearly absent requirements as MISSING
- Be fair and neutral — do not inflate or deflate scores
- Base your analysis ONLY on the submission text provided, not on assumptions

You MUST respond with valid JSON only. No markdown, no code blocks, no extra text.

Response format:
{
  "overallScore": <number 0-100>,
  "summary": "<1-3 sentence overall assessment>",
  "requirementResults": [
    {
      "requirementId": "<id>",
      "requirementText": "<requirement title>",
      "status": "VERIFIED" | "UNCLEAR" | "MISSING",
      "explanation": "<brief reasoning>",
      "confidence": <number 0.0-1.0>
    }
  ]
}`;
}

function buildUserPrompt(input: AIVerificationInput): string {
    const requirementsText = input.requirements
        .map(
            (r, i) =>
                `${i + 1}. [ID: ${r.id}] ${r.title}${r.description ? ` — ${r.description}` : ""}${r.isRequired ? " (REQUIRED)" : " (OPTIONAL)"}`,
        )
        .join("\n");

    return `PROJECT: "${input.projectTitle}"
PROJECT DESCRIPTION: ${input.projectDescription}

SUBMISSION TITLE: "${input.submission.title}"
SUBMISSION CONTENT:
${input.submission.description}
${input.submission.fileUrl ? `\nSUBMISSION URL: ${input.submission.fileUrl}` : ""}

REQUIREMENTS TO VERIFY:
${requirementsText}

Analyze each requirement against the submission and respond with structured JSON.`;
}

// ─── API call ────────────────────────────────────────────────

/**
 * Call the AI provider to verify a deliverable.
 *
 * Throws if:
 * - API key is not configured
 * - Network request fails
 * - Response is malformed
 */
export async function verifyDeliverableWithAI(
    input: AIVerificationInput,
): Promise<AIVerificationOutput> {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error(
            "AI verification is not configured. Add NEXT_PUBLIC_AI_API_KEY to your .env.local file.",
        );
    }

    const response = await fetch(getApiUrl(), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: getModel(),
            messages: [
                { role: "system", content: buildSystemPrompt() },
                { role: "user", content: buildUserPrompt(input) },
            ],
            temperature: 0.2,
            response_format: { type: "json_object" },
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => "Unknown error");
        throw new Error(
            `AI API request failed (${response.status}): ${errorBody.slice(0, 200)}`,
        );
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
        throw new Error("AI API returned an empty response.");
    }

    // Parse and validate the structured response
    return parseAIResponse(content);
}

// ─── Response parsing & validation ───────────────────────────

function parseAIResponse(raw: string): AIVerificationOutput {
    let parsed: unknown;

    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error("AI returned an invalid JSON response.");
    }

    const obj = parsed as Record<string, unknown>;

    // Validate top-level fields
    if (typeof obj.overallScore !== "number") {
        throw new Error("AI response missing overallScore.");
    }
    if (typeof obj.summary !== "string") {
        throw new Error("AI response missing summary.");
    }
    if (!Array.isArray(obj.requirementResults)) {
        throw new Error("AI response missing requirementResults array.");
    }

    // Validate each requirement result
    const validStatuses = new Set(["VERIFIED", "UNCLEAR", "MISSING"]);
    const results: AIRequirementResult[] = [];

    for (const item of obj.requirementResults as Record<string, unknown>[]) {
        if (
            typeof item.requirementId !== "string" ||
            typeof item.requirementText !== "string" ||
            typeof item.explanation !== "string"
        ) {
            throw new Error("AI response contains a malformed requirement result.");
        }

        const status = String(item.status);
        if (!validStatuses.has(status)) {
            throw new Error(
                `AI response contains invalid status "${status}" for requirement ${item.requirementId}.`,
            );
        }

        let confidence = Number(item.confidence);
        if (isNaN(confidence) || confidence < 0 || confidence > 1) {
            confidence = 0.5; // fallback for invalid confidence
        }

        results.push({
            requirementId: item.requirementId,
            requirementText: item.requirementText,
            status: status as "VERIFIED" | "UNCLEAR" | "MISSING",
            explanation: item.explanation,
            confidence,
        });
    }

    // Clamp overall score
    const overallScore = Math.max(0, Math.min(100, Math.round(obj.overallScore as number)));

    return {
        overallScore,
        summary: obj.summary as string,
        requirementResults: results,
    };
}
