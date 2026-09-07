"use client";

/**
 * Create Transaction
 *
 * Either party can open a PRIVATE transaction with one specific account they
 * already know from elsewhere. There is no public posting and no marketplace:
 * the request is addressed to exactly one counterparty and is visible only to
 * the two of them.
 *
 * The flow is gated. Nothing is written to storage until:
 *   1. a counterparty with the opposite role is selected,
 *   2. the terms (title, scope, amount, currency, deadline) are complete,
 *   3. the requirements have been refined by AI and explicitly confirmed.
 *
 * If the AI call fails the form keeps every value the user typed and only offers
 * a retry — there is no path that sends unrefined requirements.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card } from "@/components/ui/Card";
import {
    RequirementRefiner,
    type ConfirmedRefinement,
} from "@/components/transactions/RequirementRefiner";
import { findUserByEmail, listUsers } from "@/lib/auth";
import { requiredCounterpartyRole } from "@/lib/authz";
import {
    buildTermsSnapshot,
    sendTransactionRequest,
} from "@/services/transactions";
import type { User } from "@/types";

const inputClass =
    "rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export default function NewTransactionPage() {
    const router = useRouter();
    const { user } = useAuth();

    // ── Counterparty ──────────────────────────────────────────
    const [counterparty, setCounterparty] = useState<User | null>(null);
    const [lookupEmail, setLookupEmail] = useState("");
    const [lookupError, setLookupError] = useState("");

    // ── Terms ─────────────────────────────────────────────────
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [amount, setAmount] = useState("");
    const [currency, setCurrency] = useState("USD");
    const [deadline, setDeadline] = useState("");

    // ── Mandatory AI refinement ───────────────────────────────
    const [confirmed, setConfirmed] = useState<ConfirmedRefinement | null>(null);

    // ── Submission ────────────────────────────────────────────
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const counterpartyRole = user ? requiredCounterpartyRole(user.role) : null;

    // Registered accounts the initiator may address. Filtered to the opposite
    // role and to the initiator's own exclusion — a simple picker, not a search
    // or ranking system.
    const candidates = useMemo(() => {
        if (!user || !counterpartyRole) return [];
        return listUsers({ role: counterpartyRole, excludeUserId: user.id });
    }, [user, counterpartyRole]);

    // Refinement context changes invalidate a prior confirmation: the criteria
    // must describe the transaction that is actually being sent.
    useEffect(() => {
        setConfirmed(null);
    }, [title, description]);

    function handleLookup() {
        setLookupError("");
        const found = findUserByEmail(lookupEmail);

        if (!found) {
            setLookupError(
                "No Adjudex account uses that email. They need to sign up before you can open a private transaction with them.",
            );
            return;
        }
        if (user && found.id === user.id) {
            setLookupError("That is your own account.");
            return;
        }
        if (counterpartyRole && found.role !== counterpartyRole) {
            setLookupError(
                `A transaction needs one client and one freelancer. As a ${user?.role}, select a ${counterpartyRole} account.`,
            );
            return;
        }

        setCounterparty(found);
        setLookupEmail("");
    }

    function handleSelectCandidate(id: string) {
        setLookupError("");
        if (!id) {
            setCounterparty(null);
            return;
        }
        const found = candidates.find((c) => c.id === id) ?? null;
        setCounterparty(found);
    }

    // ── Validation ────────────────────────────────────────────

    function validate(): string | null {
        if (!counterparty) {
            return "Select the person this private transaction is with.";
        }
        if (!title.trim()) return "A transaction title is required.";
        if (!description.trim()) {
            return "Describe the work so the other party knows what they are agreeing to.";
        }

        const value = parseFloat(amount);
        if (isNaN(value) || value <= 0) {
            return "The proposed amount must be greater than 0.";
        }
        if (!deadline) return "A deadline is required.";
        if (isNaN(new Date(deadline).getTime())) return "Enter a valid deadline.";

        if (!confirmed) {
            return "Requirements must be refined with AI and confirmed before the request can be sent.";
        }
        if (confirmed.requirements.length === 0) {
            return "At least one acceptance criterion is required.";
        }

        return null;
    }

    // ── Send ──────────────────────────────────────────────────

    function handleSend(e: React.FormEvent) {
        e.preventDefault();
        setError("");

        if (!user) {
            setError("You must be signed in.");
            return;
        }

        const validationError = validate();
        if (validationError || !counterparty || !confirmed) {
            setError(validationError ?? "The request is not ready to send.");
            return;
        }

        setIsSending(true);
        try {
            const transaction = sendTransactionRequest({
                initiator: user,
                counterpartyUserId: counterparty.id,
                terms: buildTermsSnapshot({
                    title,
                    description,
                    proposedAmount: parseFloat(amount),
                    currency,
                    deadline: new Date(deadline),
                    requirements: confirmed.requirements,
                }),
                refinement: confirmed.refinement,
            });
            router.push(`/transactions/${transaction.id}?sent=1`);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to send the request.",
            );
            setIsSending(false);
        }
    }

    // ── Not a usable account ──────────────────────────────────

    if (user && (user.role !== "client" && user.role !== "freelancer")) {
        return (
            <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-8">
                <Card>
                    <h1 className="text-lg font-semibold">
                        Transactions need two sides
                    </h1>
                    <p className="mt-2 text-sm text-zinc-600">
                        Your account role is &quot;{user.role}&quot;. A private
                        transaction requires one client account and one
                        freelancer account.
                    </p>
                </Card>
            </main>
        );
    }

    return (
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-8">
            <Link
                href={user?.role === "freelancer" ? "/freelancer/dashboard" : "/client/dashboard"}
                className="text-sm text-zinc-500 hover:text-zinc-700"
            >
                &larr; Dashboard
            </Link>

            <h1 className="mt-2 text-2xl font-bold tracking-tight">
                Create Transaction
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
                Open a private agreement with someone you already found. Only the
                two of you will ever see it.
            </p>

            <form onSubmit={handleSend} className="mt-8 flex flex-col gap-6">
                {/* ── 1. Counterparty ─────────────────────────── */}
                <Card>
                    <h2 className="text-sm font-medium text-zinc-500">
                        1. Who is this with?
                    </h2>

                    {counterparty ? (
                        <div className="mt-3 flex items-start justify-between gap-3 rounded-md border border-green-200 bg-green-50 px-4 py-3">
                            <div>
                                <p className="text-sm font-semibold text-green-700">
                                    {counterparty.name}
                                </p>
                                <p className="text-xs text-green-600">
                                    {counterparty.email} · {counterparty.role}
                                </p>
                                <p className="mt-1 text-xs text-zinc-500">
                                    The request goes to this account only.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setCounterparty(null)}
                                className="shrink-0 text-xs font-medium text-green-700 hover:underline"
                            >
                                Change
                            </button>
                        </div>
                    ) : (
                        <div className="mt-3 flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-medium">
                                    Their Adjudex email
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="email"
                                        value={lookupEmail}
                                        onChange={(e) => {
                                            setLookupEmail(e.target.value);
                                            setLookupError("");
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                handleLookup();
                                            }
                                        }}
                                        className={inputClass + " flex-1"}
                                        placeholder="name@example.com"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleLookup}
                                        className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                                    >
                                        Find
                                    </button>
                                </div>
                                {lookupError && (
                                    <p className="text-xs text-red-500">{lookupError}</p>
                                )}
                            </div>

                            {candidates.length > 0 && (
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-sm font-medium">
                                        Or choose a registered {counterpartyRole}
                                    </label>
                                    <select
                                        value=""
                                        onChange={(e) =>
                                            handleSelectCandidate(e.target.value)
                                        }
                                        className={inputClass}
                                    >
                                        <option value="">Select an account…</option>
                                        {candidates.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name} — {c.email}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {candidates.length === 0 && !lookupError && (
                                <p className="text-xs text-zinc-500">
                                    No other {counterpartyRole} accounts are
                                    registered in this browser yet. Sign up a
                                    second account, or enter their email above.
                                </p>
                            )}
                        </div>
                    )}
                </Card>

                {/* ── 2. Terms ──────────────────────────────────── */}
                <Card>
                    <h2 className="text-sm font-medium text-zinc-500">
                        2. What are the terms?
                    </h2>

                    <div className="mt-3 flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium">Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => {
                                    setTitle(e.target.value);
                                    setError("");
                                }}
                                className={inputClass}
                                placeholder="e.g. Brand site rebuild + CMS handover"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium">
                                Scope / description
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => {
                                    setDescription(e.target.value);
                                    setError("");
                                }}
                                rows={4}
                                className={inputClass}
                                placeholder="What is being delivered, for whom, and any context the other party needs. Rough is fine — AI will turn it into testable criteria."
                            />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-medium">
                                    Proposed amount
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={amount}
                                    onChange={(e) => {
                                        setAmount(e.target.value);
                                        setError("");
                                    }}
                                    className={inputClass}
                                    placeholder="e.g. 500"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-medium">Currency</label>
                                <select
                                    value={currency}
                                    onChange={(e) => setCurrency(e.target.value)}
                                    className={inputClass}
                                >
                                    <option value="USD">USD</option>
                                    <option value="EUR">EUR</option>
                                    <option value="GBP">GBP</option>
                                    <option value="PKR">PKR</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium">Deadline</label>
                            <input
                                type="date"
                                value={deadline}
                                onChange={(e) => {
                                    setDeadline(e.target.value);
                                    setError("");
                                }}
                                className={inputClass}
                            />
                        </div>
                    </div>
                </Card>

                {/* ── 3. Requirements (AI refinement is mandatory) ── */}
                <Card>
                    <h2 className="text-sm font-medium text-zinc-500">
                        3. Requirements
                    </h2>
                    <p className="mt-1 text-xs text-zinc-500">
                        Required step. AI converts your rough input into
                        objective acceptance criteria and flags anything
                        ambiguous. You confirm the final set before it is sent —
                        the request cannot be sent with unrefined requirements.
                    </p>

                    <div className="mt-4">
                        <RequirementRefiner
                            transactionTitle={title}
                            transactionDescription={description}
                            confirmLabel="Confirm these requirements"
                            onConfirmed={setConfirmed}
                            onReset={() => setConfirmed(null)}
                        />
                    </div>
                </Card>

                {/* ── 4. Send ─────────────────────────────────────── */}
                {error && (
                    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                        {error}
                    </p>
                )}

                <div className="flex flex-col gap-2">
                    <button
                        type="submit"
                        disabled={isSending || !confirmed || !counterparty}
                        className="rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                        {isSending ? "Sending…" : "Send private request"}
                    </button>

                    {!confirmed && (
                        <p className="text-xs text-zinc-500">
                            Refine and confirm the requirements above to enable
                            sending.
                        </p>
                    )}
                    {confirmed && counterparty && (
                        <p className="text-xs text-zinc-500">
                            Sends to {counterparty.name} only. Nothing is locked
                            until they accept the exact same terms.
                        </p>
                    )}
                </div>
            </form>
        </main>
    );
}
