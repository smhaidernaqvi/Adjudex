"use client";

/**
 * Create New Project
 *
 * Multi-field form with dynamic requirements management.
 * Validates all fields and saves to localStorage via the project service.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { createProject } from "@/services/projects";

interface RequirementDraft {
    id: string;
    title: string;
}

export default function NewProjectPage() {
    const router = useRouter();
    const { user } = useAuth();

    // ── Form state ──────────────────────────────────────────────
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [budget, setBudget] = useState("");
    const [currency, setCurrency] = useState("USD");
    const [deadline, setDeadline] = useState("");
    const [requirements, setRequirements] = useState<RequirementDraft[]>([]);
    const [newReq, setNewReq] = useState("");
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ── Requirement helpers ─────────────────────────────────────

    function addRequirement() {
        const trimmed = newReq.trim();
        if (!trimmed) return;
        setRequirements((prev) => [
            ...prev,
            { id: crypto.randomUUID(), title: trimmed },
        ]);
        setNewReq("");
    }

    function removeRequirement(id: string) {
        setRequirements((prev) => prev.filter((r) => r.id !== id));
    }

    function updateRequirement(id: string, value: string) {
        setRequirements((prev) =>
            prev.map((r) => (r.id === id ? { ...r, title: value } : r)),
        );
    }

    // ── Validation ──────────────────────────────────────────────

    function validate(): string | null {
        if (!title.trim()) return "Project title is required.";
        if (!description.trim()) return "Description is required.";

        const amount = parseFloat(budget);
        if (isNaN(amount) || amount <= 0)
            return "Payment amount must be greater than 0.";

        if (!deadline) return "Deadline is required.";
        if (requirements.length === 0) return "Add at least one requirement.";
        if (requirements.some((r) => !r.title.trim()))
            return "All requirements must have text.";

        return null;
    }

    // ── Submit ──────────────────────────────────────────────────

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");

        const validationError = validate();
        if (validationError) {
            setError(validationError);
            return;
        }

        if (!user) {
            setError("You must be logged in to create a project.");
            return;
        }

        setIsSubmitting(true);

        const project = createProject({
            title: title.trim(),
            description: description.trim(),
            budget: parseFloat(budget),
            currency,
            deadline: new Date(deadline),
            clientId: user.id,
            requirements: requirements.map((r) => ({
                title: r.title.trim(),
                isRequired: true,
            })),
        });

        setIsSubmitting(false);
        router.push(`/client/projects/${project.id}?created=1`);
    }

    // ── Render ──────────────────────────────────────────────────

    return (
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-8">
            <h1 className="text-2xl font-bold tracking-tight">Create New Project</h1>
            <p className="mt-1 text-sm text-zinc-500">
                Define the project scope, budget, and requirements for the freelancer.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
                {/* Title */}
                <Field label="Project Title">
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => {
                            setTitle(e.target.value);
                            setError("");
                        }}
                        className={inputClass}
                        placeholder="e.g. Build a Portfolio Website"
                    />
                </Field>

                {/* Description */}
                <Field label="Description">
                    <textarea
                        value={description}
                        onChange={(e) => {
                            setDescription(e.target.value);
                            setError("");
                        }}
                        rows={4}
                        className={inputClass}
                        placeholder="Describe the project in detail…"
                    />
                </Field>

                {/* Budget + Currency */}
                <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                    <Field label="Payment Amount">
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={budget}
                            onChange={(e) => {
                                setBudget(e.target.value);
                                setError("");
                            }}
                            className={inputClass}
                            placeholder="500"
                        />
                    </Field>

                    <Field label="Currency">
                        <select
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                            className={inputClass}
                        >
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                            <option value="GBP">GBP</option>
                        </select>
                    </Field>
                </div>

                {/* Deadline */}
                <Field label="Deadline">
                    <input
                        type="date"
                        value={deadline}
                        onChange={(e) => {
                            setDeadline(e.target.value);
                            setError("");
                        }}
                        className={inputClass}
                    />
                </Field>

                {/* Requirements */}
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Requirements</label>

                    {/* Add new requirement */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newReq}
                            onChange={(e) => setNewReq(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    addRequirement();
                                }
                            }}
                            className={inputClass + " flex-1"}
                            placeholder="e.g. 5 pages, Responsive design…"
                        />
                        <button
                            type="button"
                            onClick={addRequirement}
                            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                        >
                            Add
                        </button>
                    </div>

                    {/* Requirements list */}
                    {requirements.length > 0 && (
                        <ul className="flex flex-col gap-2 pt-1">
                            {requirements.map((req, idx) => (
                                <li
                                    key={req.id}
                                    className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2"
                                >
                                    <span className="w-6 shrink-0 text-center text-xs font-medium text-zinc-400">
                                        {idx + 1}
                                    </span>
                                    <input
                                        type="text"
                                        value={req.title}
                                        onChange={(e) =>
                                            updateRequirement(req.id, e.target.value)
                                        }
                                        className="flex-1 bg-transparent text-sm outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeRequirement(req.id)}
                                        className="text-zinc-400 transition-colors hover:text-red-500"
                                        aria-label="Remove requirement"
                                    >
                                        <svg
                                            className="h-4 w-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            strokeWidth={2}
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M6 18 18 6M6 6l12 12"
                                            />
                                        </svg>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {requirements.length === 0 && (
                        <p className="text-xs text-zinc-400">
                            Press Enter or click Add to include a requirement.
                        </p>
                    )}
                </div>

                {/* Error */}
                {error && (
                    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                        {error}
                    </p>
                )}

                {/* Submit */}
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                    {isSubmitting ? "Creating…" : "Create Project"}
                </button>
            </form>
        </main>
    );
}

// ── Shared pieces ─────────────────────────────────────────────

const inputClass =
    "rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{label}</label>
            {children}
        </div>
    );
}
