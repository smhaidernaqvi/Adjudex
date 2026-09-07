"use client";

/**
 * RequirementRefiner — the mandatory AI refinement gate.
 *
 * Adjudex never stores vague requirements as agreed terms. This component is
 * the only way a requirement set reaches a transaction, a revision, or a
 * change proposal, and it enforces the sequence:
 *
 *   rough input
 *     → AI converts it into objective, testable acceptance criteria
 *     → AI separately reports ambiguities / missing information
 *     → user reviews, and may edit, remove or add criteria
 *     → user explicitly confirms
 *
 * `onConfirmed` can therefore only ever fire after a successful AI pass plus a
 * deliberate confirm click. If the AI call fails, the user's rough input and
 * any criteria already produced are preserved, the error is shown, and the only
 * way forward is to retry — there is no "skip refinement" affordance.
 *
 * Reused by: create transaction, revise-and-resend, change proposal.
 */

import { useState } from "react";
import type { AIRefinementRecord, TransactionRequirement } from "@/types";
import { refineRequirementsWithAI } from "@/lib/ai";

export interface ConfirmedRefinement {
    requirements: TransactionRequirement[];
    refinement: AIRefinementRecord;
}

type Stage = "rough" | "refining" | "review" | "confirmed";

interface RequirementRefinerProps {
    /** Context the AI receives alongside the rough requirements. */
    transactionTitle: string;
    transactionDescription: string;
    /** Rough lines to pre-fill (e.g. after a failed attempt or a re-open). */
    initialRough?: string[];
    /**
     * Criteria already in play — for a revision or change proposal these are the
     * currently agreed ones, shown as the starting point. They do NOT count as
     * refined: an AI pass is still required before confirming.
     *
     * They are also sent to the model as the locked baseline, so an amendment
     * amends the agreed set instead of rewriting it from scratch and silently
     * dropping criteria the other party already accepted.
     */
    initialRequirements?: TransactionRequirement[];
    confirmLabel?: string;
    refineLabel?: string;
    /** Fires only after a successful AI pass AND an explicit confirm click. */
    onConfirmed: (payload: ConfirmedRefinement) => void;
    /** Fires when a prior confirmation is voided by going back to editing. */
    onReset?: () => void;
}

const inputClass =
    "rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

/** Title key used to recognise a criterion the AI carried forward unchanged. */
function criterionKey(title: string): string {
    return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Give refined criteria back the ids of the agreed criteria they replace.
 *
 * The change-proposal diff matches requirements BY ID. The model is told to
 * carry agreed criteria forward verbatim, but it cannot know their ids, so
 * minting a fresh id for every returned criterion made an amendment look like
 * "all N removed, all N+1 added" and buried the one real change in noise.
 *
 * Reusing the id where the title is unchanged keeps the diff honest: only what
 * genuinely moved shows up as added, removed or updated. A criterion the model
 * renamed or invented gets a new id, which is the correct signal.
 *
 * Each agreed id is consumed at most once so two refined criteria can never
 * claim the same identity.
 */
function reconcileWithAgreedIds(
    refined: { title: string; description: string; isRequired: boolean }[],
    agreed: TransactionRequirement[],
): TransactionRequirement[] {
    const available = new Map<string, string>();
    for (const req of agreed) {
        const key = criterionKey(req.title);
        if (!available.has(key)) available.set(key, req.id);
    }

    return refined.map((r) => {
        const key = criterionKey(r.title);
        const reusedId = available.get(key);
        if (reusedId) available.delete(key);
        return {
            id: reusedId ?? crypto.randomUUID(),
            title: r.title,
            description: r.description,
            isRequired: r.isRequired,
        };
    });
}

export function RequirementRefiner({
    transactionTitle,
    transactionDescription,
    initialRough = [],
    initialRequirements = [],
    confirmLabel = "Confirm refined requirements",
    refineLabel = "✨ Refine with AI",
    onConfirmed,
    onReset,
}: RequirementRefinerProps) {
    const [stage, setStage] = useState<Stage>("rough");
    const [roughLines, setRoughLines] = useState<string[]>(initialRough);
    const [newRough, setNewRough] = useState("");
    const [requirements, setRequirements] = useState<TransactionRequirement[]>(
        initialRequirements,
    );
    const [ambiguities, setAmbiguities] = useState<string[]>([]);
    /** The rough input the AI actually saw — recorded on the refinement. */
    const [roughSnapshot, setRoughSnapshot] = useState<{ title: string }[]>([]);
    const [refinedAt, setRefinedAt] = useState<Date | null>(null);
    const [error, setError] = useState("");

    // ── Rough input ───────────────────────────────────────────

    function addRoughLine() {
        const trimmed = newRough.trim();
        if (!trimmed) return;
        setRoughLines((prev) => [...prev, trimmed]);
        setNewRough("");
        setError("");
    }

    function removeRoughLine(index: number) {
        setRoughLines((prev) => prev.filter((_, i) => i !== index));
    }

    // ── Refined criteria ──────────────────────────────────────

    function addCriterion() {
        setRequirements((prev) => [
            ...prev,
            {
                id: crypto.randomUUID(),
                title: "",
                description: "",
                isRequired: true,
            },
        ]);
    }

    function updateCriterion(
        id: string,
        patch: Partial<TransactionRequirement>,
    ) {
        setRequirements((prev) =>
            prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        );
        setError("");
    }

    function removeCriterion(id: string) {
        setRequirements((prev) => prev.filter((r) => r.id !== id));
    }

    // ── AI pass ───────────────────────────────────────────────

    async function handleRefine() {
        setError("");

        const hasContext =
            transactionTitle.trim() !== "" || transactionDescription.trim() !== "";
        if (!hasContext && roughLines.length === 0) {
            setError(
                "Add a title, a description of the work, or at least one rough requirement before refining.",
            );
            return;
        }

        setStage("refining");
        try {
            const { refinedRequirements, ambiguities: gaps } =
                await refineRequirementsWithAI({
                    projectTitle: transactionTitle.trim(),
                    projectDescription: transactionDescription.trim(),
                    roughRequirements: roughLines.map((title) => ({ title })),
                    // The agreed baseline, when there is one. Empty on first
                    // creation, which keeps that path in plain refinement mode.
                    existingRequirements: initialRequirements.map((r) => ({
                        title: r.title,
                        description: r.description,
                        isRequired: r.isRequired,
                    })),
                });

            // Nothing is discarded on success — the refined set replaces the
            // starting point, and the rough input is kept for the record.
            // Criteria carried forward keep their agreed id so the diff the
            // other party reviews shows only what actually changed.
            setRequirements(
                reconcileWithAgreedIds(refinedRequirements, initialRequirements),
            );
            setAmbiguities(gaps);
            setRoughSnapshot(roughLines.map((title) => ({ title })));
            setRefinedAt(new Date());
            setStage("review");
        } catch (err) {
            // Preserve the user's work, show why it failed, allow retry.
            setError(
                err instanceof Error
                    ? err.message
                    : "AI refinement failed. Your input has been kept — please try again.",
            );
            setStage(roughSnapshot.length > 0 ? "review" : "rough");
        }
    }

    // ── Confirmation gate ─────────────────────────────────────

    function handleConfirm() {
        const cleaned = requirements
            .map((r) => ({
                ...r,
                title: r.title.trim(),
                description: r.description.trim(),
            }))
            .filter((r) => r.title !== "");

        if (cleaned.length === 0) {
            setError("At least one acceptance criterion is required.");
            return;
        }
        if (!refinedAt) {
            setError("Requirements must be refined with AI before they can be confirmed.");
            return;
        }

        const now = new Date();
        const record: AIRefinementRecord = {
            id: crypto.randomUUID(),
            roughRequirements: roughSnapshot,
            refinedRequirements: cleaned,
            ambiguities,
            confirmedByInitiator: true,
            confirmedAt: now,
            createdAt: refinedAt,
        };

        setRequirements(cleaned);
        setStage("confirmed");
        setError("");
        onConfirmed({ requirements: cleaned, refinement: record });
    }

    function handleReopen() {
        setStage("review");
        onReset?.();
    }

    // ── Render ────────────────────────────────────────────────

    return (
        <div className="flex flex-col gap-3">
            {/* STAGE: rough input */}
            {stage !== "confirmed" && (
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">
                        Rough requirements
                    </label>
                    <p className="text-xs text-zinc-500">
                        Write them however you like — vague is fine. AI turns
                        these into objective, testable acceptance criteria that
                        both sides can be held to.
                    </p>

                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newRough}
                            onChange={(e) => setNewRough(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    addRoughLine();
                                }
                            }}
                            disabled={stage === "refining"}
                            className={inputClass + " flex-1"}
                            placeholder="e.g. needs to look good on mobile"
                        />
                        <button
                            type="button"
                            onClick={addRoughLine}
                            disabled={stage === "refining"}
                            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
                        >
                            Add
                        </button>
                    </div>

                    {roughLines.length > 0 && (
                        <ul className="flex flex-col gap-1.5 pt-1">
                            {roughLines.map((line, idx) => (
                                <li
                                    key={`${idx}-${line}`}
                                    className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm"
                                >
                                    <span className="w-5 shrink-0 text-center text-xs text-zinc-400">
                                        {idx + 1}
                                    </span>
                                    <span className="flex-1">{line}</span>
                                    <button
                                        type="button"
                                        onClick={() => removeRoughLine(idx)}
                                        disabled={stage === "refining"}
                                        className="shrink-0 text-zinc-400 transition-colors hover:text-red-500 disabled:opacity-50"
                                        aria-label="Remove rough requirement"
                                    >
                                        ✕
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* Refine action */}
            {stage !== "confirmed" && (
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={handleRefine}
                        disabled={stage === "refining"}
                        className="rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
                    >
                        {stage === "refining"
                            ? "AI is refining…"
                            : refinedAt
                                ? "Re-run AI refinement"
                                : refineLabel}
                    </button>

                    {stage === "refining" && (
                        <span className="flex items-center gap-2 text-xs text-zinc-500">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                            Converting your input into testable criteria…
                        </span>
                    )}

                    {refinedAt && stage === "review" && (
                        <span className="text-xs text-zinc-500">
                            Refined {refinedAt.toLocaleTimeString()}
                        </span>
                    )}
                </div>
            )}

            {/* Error — input above is preserved */}
            {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                    {error}
                </p>
            )}

            {/* Ambiguities the AI flagged */}
            {ambiguities.length > 0 && stage !== "confirmed" && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-sm font-medium text-amber-700">
                        Ambiguities &amp; missing information
                    </p>
                    <p className="mt-1 text-xs text-amber-600">
                        Settle these with the other party before you both rely on
                        this agreement. You can refine again after updating your
                        description.
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-700">
                        {ambiguities.map((a, i) => (
                            <li key={i}>{a}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* STAGE: review the refined criteria */}
            {stage === "review" && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">
                            Acceptance criteria ({requirements.length})
                        </label>
                        <button
                            type="button"
                            onClick={addCriterion}
                            className="text-xs font-medium text-blue-600 hover:underline"
                        >
                            + Add criterion
                        </button>
                    </div>
                    <p className="text-xs text-zinc-500">
                        Edit, remove or add freely. What you confirm here is what
                        the other party accepts and what AI verification will
                        check the delivery against.
                    </p>

                    <ul className="flex flex-col gap-2 pt-1">
                        {requirements.map((req, idx) => (
                            <li
                                key={req.id}
                                className="rounded-md border border-zinc-200 px-3 py-2"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="w-5 shrink-0 text-center text-xs text-zinc-400">
                                        {idx + 1}
                                    </span>
                                    <input
                                        type="text"
                                        value={req.title}
                                        onChange={(e) =>
                                            updateCriterion(req.id, {
                                                title: e.target.value,
                                            })
                                        }
                                        className="flex-1 bg-transparent text-sm outline-none"
                                        placeholder="Criterion title"
                                    />
                                    <button
                                        type="button"
                                        onClick={() =>
                                            updateCriterion(req.id, {
                                                isRequired: !req.isRequired,
                                            })
                                        }
                                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${req.isRequired
                                                ? "bg-red-50 text-red-600 hover:bg-red-100"
                                                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                                            }`}
                                    >
                                        {req.isRequired ? "Required" : "Optional"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => removeCriterion(req.id)}
                                        className="shrink-0 text-zinc-400 transition-colors hover:text-red-500"
                                        aria-label="Remove criterion"
                                    >
                                        ✕
                                    </button>
                                </div>
                                <textarea
                                    value={req.description}
                                    onChange={(e) =>
                                        updateCriterion(req.id, {
                                            description: e.target.value,
                                        })
                                    }
                                    rows={2}
                                    className="mt-1.5 ml-7 w-[calc(100%-1.75rem)] rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 focus:border-blue-400 focus:outline-none"
                                    placeholder="Acceptance conditions — what done looks like and how it will be checked…"
                                />
                            </li>
                        ))}
                    </ul>

                    <div>
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={requirements.length === 0}
                            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            )}

            {/* STAGE: confirmed */}
            {stage === "confirmed" && (
                <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-sm font-medium text-green-700">
                                ✓ Requirements refined and confirmed
                            </p>
                            <p className="mt-1 text-xs text-green-600">
                                {requirements.length === 1
                                    ? "1 acceptance criterion will be"
                                    : `${requirements.length} acceptance criteria will be`}{" "}
                                sent exactly as confirmed below.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleReopen}
                            className="shrink-0 text-xs font-medium text-green-700 hover:underline"
                        >
                            Edit
                        </button>
                    </div>

                    <ul className="mt-3 flex flex-col gap-1.5">
                        {requirements.map((req, idx) => (
                            <li
                                key={req.id}
                                className="rounded border border-green-200 bg-white/60 px-2.5 py-1.5 text-xs text-zinc-700"
                            >
                                <span className="font-medium">
                                    {idx + 1}. {req.title}
                                </span>
                                {req.description && (
                                    <span className="text-zinc-500">
                                        {" "}
                                        — {req.description}
                                    </span>
                                )}
                                <span
                                    className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${req.isRequired
                                            ? "bg-red-50 text-red-600"
                                            : "bg-zinc-100 text-zinc-500"
                                        }`}
                                >
                                    {req.isRequired ? "Required" : "Optional"}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
