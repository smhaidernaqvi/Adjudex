/**
 * Server-side AI API Route
 *
 * Handles two tasks via POST:
 *   task: "verify"   — AI deliverable verification
 *   task: "refine"   — AI requirement refinement
 *
 * Reads GEMINI_API_KEY from server environment only.
 * Calls Google Gemini's OpenAI-compatible endpoint.
 * Never exposes the API key to the client.
 */

import { NextResponse } from "next/server";
import type { Requirement, Submission } from "@/types";

// ─── Gemini configuration ─────────────────────────────────────

const GEMINI_API_URL =
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

/**
 * Model id, overridable with GEMINI_MODEL in the server environment.
 *
 * Google retires pinned model ids without notice — gemini-2.5-flash now answers
 * 404 with "This model is no longer available to new users". Because AI
 * refinement is a MANDATORY gate in the transaction flow, a dead model id does
 * not merely degrade one feature, it makes it impossible to create any
 * agreement at all. Keep this overridable so a retirement is a config change
 * rather than a code change.
 */
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";

/**
 * Gemini answers 429/503 with "currently experiencing high demand" — a
 * transient capacity error, not a bad request. Since a failed refinement blocks
 * the whole transaction flow, it is worth one automatic retry before surfacing
 * the failure to the user.
 */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1500;

function getGeminiApiKey(): string | null {
    return process.env.GEMINI_API_KEY ?? null;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Shared Gemini call ───────────────────────────────────────

async function callGemini(
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
): Promise<string> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        throw new AiError(
            "AI is not configured. Set GEMINI_API_KEY in your server environment.",
            503,
        );
    }

    let lastError: AiError | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const response = await fetch(GEMINI_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: GEMINI_MODEL,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                temperature,
                response_format: { type: "json_object" },
            }),
        });

        if (response.ok) {
            const data = await response.json();
            const content: string | undefined = data?.choices?.[0]?.message?.content;
            if (!content) {
                throw new AiError("Gemini API returned an empty response.", 502);
            }
            return content;
        }

        const body = await response.text().catch(() => "");

        // A 404 almost always means the model id was retired: a configuration
        // problem, not something a retry can fix.
        if (response.status === 404) {
            throw new AiError(
                `The configured Gemini model "${GEMINI_MODEL}" is not available. Set GEMINI_MODEL to a current model id. (${body.slice(0, 200)})`,
                502,
            );
        }

        lastError = new AiError(
            `Gemini API request failed (${response.status}): ${body.slice(0, 200)}`,
            502,
        );

        // Only transient capacity errors are worth another attempt.
        if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_ATTEMPTS) {
            throw lastError;
        }
        await delay(RETRY_DELAY_MS);
    }

    throw lastError ?? new AiError("Gemini API request failed.", 502);
}

class AiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

/**
 * Extract the JSON object from a model response.
 * Tolerates stray markdown code fences or leading/trailing prose.
 */
function extractJson(raw: string): unknown {
    const trimmed = raw.trim();

    try {
        return JSON.parse(trimmed);
    } catch {
        // fall through to recovery attempts
    }

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
        try {
            return JSON.parse(fenced[1].trim());
        } catch {
            // fall through
        }
    }

    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
        try {
            return JSON.parse(trimmed.slice(start, end + 1));
        } catch {
            // fall through
        }
    }

    throw new AiError("AI returned an invalid JSON response.", 502);
}

// ─── Verification prompts & parser ────────────────────────────

function buildVerifySystemPrompt(): string {
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

function buildVerifyUserPrompt(input: VerifyInput): string {
    const reqsText = input.requirements
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
${reqsText}

Analyze each requirement against the submission and respond with structured JSON.`;
}

interface VerifyInput {
    requirements: Requirement[];
    submission: Submission;
    projectTitle: string;
    projectDescription: string;
}

function parseVerifyResponse(raw: string) {
    const parsed = extractJson(raw);

    const obj = parsed as Record<string, unknown>;
    if (typeof obj.overallScore !== "number") throw new AiError("AI response missing overallScore.", 502);
    if (typeof obj.summary !== "string") throw new AiError("AI response missing summary.", 502);
    if (!Array.isArray(obj.requirementResults)) throw new AiError("AI response missing requirementResults array.", 502);

    const validStatuses = new Set(["VERIFIED", "UNCLEAR", "MISSING"]);
    const results = [];

    for (const item of obj.requirementResults as Record<string, unknown>[]) {
        if (
            typeof item.requirementId !== "string" ||
            typeof item.requirementText !== "string" ||
            typeof item.explanation !== "string"
        ) {
            throw new AiError("AI response contains a malformed requirement result.", 502);
        }
        const status = String(item.status);
        if (!validStatuses.has(status)) {
            throw new AiError(`AI response contains invalid status "${status}".`, 502);
        }
        let confidence = Number(item.confidence);
        if (isNaN(confidence) || confidence < 0 || confidence > 1) confidence = 0.5;

        results.push({
            requirementId: item.requirementId,
            requirementText: item.requirementText,
            status,
            explanation: item.explanation,
            confidence,
        });
    }

    return {
        overallScore: Math.max(0, Math.min(100, Math.round(obj.overallScore as number))),
        summary: obj.summary as string,
        requirementResults: results,
    };
}

// ─── Refinement prompts & parser ──────────────────────────────

function buildRefineSystemPrompt(): string {
    return `You are a professional agreement analyst for Adjudex, a private trust and escrow layer between two parties who already found each other.

Your job is to take one party's rough description of the work and their vague requirements, and refine them into clear, objective, testable acceptance criteria that the other party can deliver against and that can be objectively verified on delivery.

Rules for "refinedRequirements":
- Each criterion must be specific, measurable, and unambiguous
- Include acceptance conditions (what "done" looks like and how it will be checked)
- Keep each criterion concise (1-2 sentences for title, 1-3 sentences for description)
- Aim for 4-8 criteria unless the work clearly needs more or fewer
- Mark core deliverables as required; nice-to-haves as optional
- Do NOT add scope that neither party hinted at
- If the rough input is already clear, preserve its intent — just make it more precise

Rules for "ambiguities":
- List anything that is vague, missing, contradictory, or untestable in the rough input
- Include decisions the two parties must make between themselves before agreeing, for example: exact quantities, target platforms, revision limits, delivery format, deadlines, who supplies assets or credentials, what counts as acceptable quality
- Phrase each as a short question or gap the initiator should resolve
- Return an empty array ONLY if the rough input is genuinely complete and unambiguous
- Do not invent problems, but do not stay silent about real ones

AMENDMENT MODE — applies only when the user prompt contains an "ALREADY AGREED CRITERIA" section:
- Those criteria are already locked by both parties. You are AMENDING the set, not rewriting it.
- Carry every existing criterion forward VERBATIM (same title, description and required flag) unless the rough input explicitly changes or removes it
- Never drop an existing criterion merely because the rough input does not mention it
- Add new criteria only for what the rough input actually asks for
- Return the COMPLETE amended set, not just the additions, ordered: existing criteria first in their original order, then additions
- Do not restate or re-refine the existing wording — changing it would show up as a spurious diff for the other party to review

You MUST respond with valid JSON only. No markdown, no code blocks, no extra text.

Response format:
{
  "refinedRequirements": [
    {
      "title": "<concise criterion title>",
      "description": "<acceptance conditions and how they will be verified>",
      "isRequired": true | false
    }
  ],
  "ambiguities": [
    "<a specific gap, question or unstated assumption>"
  ]
}`;
}

interface RefineInput {
    projectTitle: string;
    projectDescription: string;
    roughRequirements: { title: string }[];
    /**
     * Criteria both parties have already locked. Present when refining a change
     * proposal or a revision, absent on first creation. Without it the model
     * rewrites the whole set from scratch and silently drops agreed criteria.
     */
    existingRequirements?: {
        title: string;
        description: string;
        isRequired: boolean;
    }[];
}

function buildRefineUserPrompt(input: RefineInput): string {
    const reqsText =
        input.roughRequirements.length > 0
            ? input.roughRequirements.map((r, i) => `${i + 1}. ${r.title}`).join("\n")
            : "(no rough requirements provided — generate from description only)";

    const existing = Array.isArray(input.existingRequirements)
        ? input.existingRequirements.filter((r) => typeof r?.title === "string" && r.title.trim())
        : [];

    // Amendment mode: the agreed set is carried forward and only the requested
    // change is layered on top, so the diff the counterparty reviews is real.
    if (existing.length > 0) {
        const agreedText = existing
            .map(
                (r, i) =>
                    `${i + 1}. ${r.title} [${r.isRequired ? "REQUIRED" : "OPTIONAL"}] — ${r.description || "(no description)"}`,
            )
            .join("\n");

        return `TRANSACTION TITLE: "${input.projectTitle}"
SCOPE / DESCRIPTION: ${input.projectDescription}

ALREADY AGREED CRITERIA (locked by both parties — preserve these):
${agreedText}

REQUESTED CHANGE (rough wording):
${reqsText}

Apply the requested change to the already agreed criteria. Return the COMPLETE amended criterion set: every agreed criterion carried forward verbatim unless the requested change explicitly alters or removes it, plus any new criteria the change needs. Then separately list the ambiguities or missing information the two parties still need to settle. Respond with structured JSON.`;
    }

    return `TRANSACTION TITLE: "${input.projectTitle}"
SCOPE / DESCRIPTION: ${input.projectDescription}

ROUGH REQUIREMENTS:
${reqsText}

Refine these into clear, testable acceptance criteria, and separately list the ambiguities or missing information the two parties still need to settle. Respond with structured JSON.`;
}

function parseRefineResponse(raw: string) {
    const parsed = extractJson(raw);

    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.refinedRequirements)) {
        throw new AiError("AI response missing refinedRequirements array.", 502);
    }

    const results = [];
    for (const item of obj.refinedRequirements as Record<string, unknown>[]) {
        if (typeof item.title !== "string" || !item.title.trim()) continue;
        results.push({
            title: item.title.trim(),
            description: typeof item.description === "string" ? item.description.trim() : "",
            isRequired: typeof item.isRequired === "boolean" ? item.isRequired : true,
        });
    }

    if (results.length === 0) {
        throw new AiError("AI returned no valid requirements.", 502);
    }

    // Ambiguities are advisory — a malformed or absent list must not fail the
    // whole refinement, or the initiator loses their work over a formatting slip.
    const ambiguities: string[] = [];
    if (Array.isArray(obj.ambiguities)) {
        for (const item of obj.ambiguities) {
            if (typeof item === "string" && item.trim()) {
                ambiguities.push(item.trim());
            }
        }
    }

    return { refinedRequirements: results, ambiguities };
}

// ─── Route handler ────────────────────────────────────────────

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { task, input } = body;

        if (!task || typeof task !== "string") {
            return NextResponse.json(
                { error: "Missing or invalid 'task' field. Use 'verify' or 'refine'." },
                { status: 400 },
            );
        }

        if (!input || typeof input !== "object") {
            return NextResponse.json(
                { error: "Missing or invalid 'input' field." },
                { status: 400 },
            );
        }

        if (task === "verify") {
            const verifyInput = input as VerifyInput;
            if (!verifyInput.submission || !verifyInput.requirements) {
                return NextResponse.json(
                    { error: "Verify task requires 'submission' and 'requirements' in input." },
                    { status: 400 },
                );
            }

            const raw = await callGemini(
                buildVerifySystemPrompt(),
                buildVerifyUserPrompt(verifyInput),
                0.2,
            );
            const result = parseVerifyResponse(raw);
            return NextResponse.json(result);
        }

        if (task === "refine") {
            const refineInput = input as RefineInput;
            const raw = await callGemini(
                buildRefineSystemPrompt(),
                buildRefineUserPrompt(refineInput),
                0.3,
            );
            const result = parseRefineResponse(raw);
            return NextResponse.json(result);
        }

        return NextResponse.json(
            { error: `Unknown task "${task}". Use 'verify' or 'refine'.` },
            { status: 400 },
        );
    } catch (err) {
        if (err instanceof AiError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
        }
        console.error("[/api/ai] Unexpected error:", err);
        return NextResponse.json(
            { error: "An unexpected error occurred while processing the AI request." },
            { status: 500 },
        );
    }
}
