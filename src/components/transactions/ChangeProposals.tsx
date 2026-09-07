"use client";

/**
 * ChangeProposals — the only legal way to amend a locked agreement.
 *
 * After AGREED, neither party can edit requirements, scope, amount or currency
 * directly. Either party may PROPOSE a change; the agreement moves only when the
 * other party ACCEPTS it, which appends a new immutable version.
 *
 * Requirement changes must pass through the same mandatory AI refinement gate
 * used at creation, so vague wording cannot enter the agreement by the back
 * door. Money/schedule-only changes do not need a refinement pass.
 */

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import {
    RequirementRefiner,
    type ConfirmedRefinement,
} from "./RequirementRefiner";
import {
    buildTermsSnapshot,
    proposeAgreementChange,
    respondToChangeProposal,
} from "@/services/transactions";
import type {
    AgreementChangeProposal,
    AgreementVersion,
    TransactionRequirement,
} from "@/types";

const inputClass =
    "rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function toDateInputValue(date: Date): string {
    const iso = date.toISOString();
    return iso.slice(0, 10);
}

interface ChangeProposalsProps {
    projectId: string;
    currentUserId: string;
    currentVersion: AgreementVersion;
    proposals: AgreementChangeProposal[];
    nameOf: (userId: string) => string;
    /** Called after any successful mutation so the parent reloads. */
    onChanged: () => void;
}

export function ChangeProposals({
    projectId,
    currentUserId,
    currentVersion,
    proposals,
    nameOf,
    onChanged,
}: ChangeProposalsProps) {
    const [showForm, setShowForm] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const pending = proposals.find((p) => p.status === "PENDING") ?? null;
    const resolved = proposals.filter((p) => p.status !== "PENDING");

    async function handleRespond(
        proposalId: string,
        decision: "accept" | "reject",
    ) {
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const { version } = await respondToChangeProposal(
                proposalId,
                currentUserId,
                decision,
            );
            setNotice(
                decision === "accept" && version
                    ? `Change accepted. Agreement v${version.version} is now in force.`
                    : "Change rejected. The agreement is unchanged.",
            );
            onChanged();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <Card className="mt-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-medium text-zinc-500">
                            Agreement changes
                        </h2>
                        <p className="mt-1 text-xs text-zinc-500">
                            Locked terms can only move by mutual agreement. Propose
                            a change; it takes effect only if the other party
                            accepts it.
                        </p>
                    </div>
                    {!pending && (
                        <button
                            type="button"
                            onClick={() => {
                                setShowForm(true);
                                setError("");
                            }}
                            className="shrink-0 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                        >
                            Propose a change
                        </button>
                    )}
                </div>

                {notice && (
                    <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                        {notice}
                    </p>
                )}
                {error && (
                    <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                        {error}
                    </p>
                )}

                {/* Pending proposal */}
                {pending && (
                    <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                        <p className="text-sm font-medium text-amber-700">
                            {pending.proposerUserId === currentUserId
                                ? "Your change proposal is awaiting a response"
                                : `${nameOf(pending.proposerUserId)} proposed a change`}
                        </p>
                        <p className="mt-1 text-xs text-zinc-600">
                            Based on agreement v{currentVersion.version} ·{" "}
                            {pending.createdAt.toLocaleString()}
                        </p>
                        <p className="mt-2 text-sm text-zinc-700">{pending.reason}</p>

                        <ul className="mt-3 flex flex-col gap-1.5">
                            {pending.changes.map((c, i) => (
                                <li
                                    key={i}
                                    className="rounded border border-amber-200 bg-white/60 px-2.5 py-1.5 text-xs"
                                >
                                    <span className="font-medium text-zinc-700">
                                        {c.label}:
                                    </span>{" "}
                                    {c.before !== null && (
                                        <span className="text-zinc-500 line-through">
                                            {c.before}
                                        </span>
                                    )}
                                    {c.before !== null && c.after !== null && (
                                        <span className="text-zinc-400"> → </span>
                                    )}
                                    {c.after !== null && (
                                        <span className="font-medium text-zinc-800">
                                            {c.after}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>

                        {pending.proposerUserId !== currentUserId && (
                            <div className="mt-4 flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    onClick={() => handleRespond(pending.id, "accept")}
                                    disabled={busy}
                                    className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                                >
                                    Accept change
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleRespond(pending.id, "reject")}
                                    disabled={busy}
                                    className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
                                >
                                    Reject
                                </button>
                            </div>
                        )}

                        <p className="mt-3 text-[11px] text-zinc-500">
                            Until it is accepted, the agreement in force stays at v
                            {currentVersion.version} ({currentVersion.currency}{" "}
                            {currentVersion.amount.toLocaleString()}). AI verification
                            checks the delivery against the version in force.
                        </p>
                    </div>
                )}

                {/* Resolved proposals */}
                {resolved.length > 0 && (
                    <ul className="mt-4 flex flex-col gap-2">
                        {resolved.map((p) => (
                            <li
                                key={p.id}
                                className="rounded-md border border-zinc-200 px-3 py-2 text-xs"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium text-zinc-700">
                                        {nameOf(p.proposerUserId)}
                                        {p.proposerUserId === currentUserId
                                            ? " (you)"
                                            : ""}{" "}
                                        proposed a change
                                    </span>
                                    <span
                                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${p.status === "ACCEPTED"
                                                ? "bg-green-50 text-green-700"
                                                : "bg-zinc-100 text-zinc-500"
                                            }`}
                                    >
                                        {p.status === "ACCEPTED"
                                            ? "Accepted"
                                            : "Rejected"}
                                    </span>
                                </div>
                                <p className="mt-1 text-zinc-600">{p.reason}</p>
                                <p className="mt-1 text-zinc-400">
                                    {p.changes.map((c) => c.label).join(", ")} ·{" "}
                                    {p.respondedAt?.toLocaleString() ?? ""}
                                </p>
                            </li>
                        ))}
                    </ul>
                )}

                {proposals.length === 0 && !pending && (
                    <p className="mt-3 text-xs text-zinc-400">
                        No changes have been proposed. Agreement v
                        {currentVersion.version} is the only version.
                    </p>
                )}
            </Card>

            <ProposeChangeModal
                open={showForm}
                onClose={() => setShowForm(false)}
                projectId={projectId}
                currentUserId={currentUserId}
                currentVersion={currentVersion}
                onProposed={(message) => {
                    setShowForm(false);
                    setNotice(message);
                    onChanged();
                }}
            />
        </>
    );
}

// ── Propose form ──────────────────────────────────────────────

function ProposeChangeModal({
    open,
    onClose,
    projectId,
    currentUserId,
    currentVersion,
    onProposed,
}: {
    open: boolean;
    onClose: () => void;
    projectId: string;
    currentUserId: string;
    currentVersion: AgreementVersion;
    onProposed: (message: string) => void;
}) {
    const [reason, setReason] = useState("");
    const [title, setTitle] = useState(currentVersion.title);
    const [description, setDescription] = useState(currentVersion.description);
    const [amount, setAmount] = useState(String(currentVersion.amount));
    const [currency, setCurrency] = useState(currentVersion.currency);
    const [deadline, setDeadline] = useState(
        toDateInputValue(currentVersion.deadline),
    );
    const [confirmed, setConfirmed] = useState<ConfirmedRefinement | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    // Requirements stay exactly as agreed unless a fresh AI refinement replaces
    // them — that is what keeps a proposal from smuggling in vague wording.
    const requirements: TransactionRequirement[] = confirmed
        ? confirmed.requirements
        : currentVersion.requirements;

    function reset() {
        setReason("");
        setTitle(currentVersion.title);
        setDescription(currentVersion.description);
        setAmount(String(currentVersion.amount));
        setCurrency(currentVersion.currency);
        setDeadline(toDateInputValue(currentVersion.deadline));
        setConfirmed(null);
        setError("");
    }

    function handleSubmit() {
        setError("");

        if (!reason.trim()) {
            setError("Explain why this change is needed.");
            return;
        }
        const value = parseFloat(amount);
        if (isNaN(value) || value <= 0) {
            setError("The proposed amount must be greater than 0.");
            return;
        }
        if (!title.trim()) {
            setError("A title is required.");
            return;
        }

        setSubmitting(true);
        try {
            proposeAgreementChange({
                projectId,
                proposerUserId: currentUserId,
                reason,
                terms: buildTermsSnapshot({
                    title,
                    description,
                    proposedAmount: value,
                    currency,
                    deadline: new Date(deadline),
                    requirements,
                }),
                refinement: confirmed?.refinement ?? null,
            });
            reset();
            onProposed(
                "Change proposed. The agreement is unchanged until the other party accepts it.",
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to propose the change.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Modal
            open={open}
            onClose={() => {
                reset();
                onClose();
            }}
            title="Propose a change to the agreement"
        >
            <p className="text-xs text-zinc-500">
                This does not change anything yet. The other party must accept
                before a new agreement version is created.
            </p>

            <div className="mt-4 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">
                        Reason for the change
                    </label>
                    <textarea
                        value={reason}
                        onChange={(e) => {
                            setReason(e.target.value);
                            setError("");
                        }}
                        rows={3}
                        className={inputClass}
                        placeholder="e.g. The client asked for an admin dashboard in addition to the public site."
                    />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium">Amount</label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className={inputClass}
                        />
                        <span className="text-[11px] text-zinc-400">
                            Currently {currentVersion.currency}{" "}
                            {currentVersion.amount.toLocaleString()}
                        </span>
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
                        onChange={(e) => setDeadline(e.target.value)}
                        className={inputClass}
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Title</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className={inputClass}
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Scope / description</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        className={inputClass}
                    />
                </div>

                <div className="rounded-md border border-zinc-200 px-3 py-3">
                    <p className="text-sm font-medium">Requirements</p>
                    <p className="mt-1 text-xs text-zinc-500">
                        Currently{" "}
                        {currentVersion.requirements.length === 1
                            ? "1 agreed criterion"
                            : `${currentVersion.requirements.length} agreed criteria`}
                        . To change them, describe the change below and refine
                        with AI — requirement edits always go through
                        refinement.
                    </p>

                    {confirmed ? (
                        <div className="mt-3">
                            <RequirementRefiner
                                transactionTitle={title}
                                transactionDescription={description}
                                initialRequirements={currentVersion.requirements}
                                confirmLabel="Confirm the new requirement set"
                                onConfirmed={setConfirmed}
                                onReset={() => setConfirmed(null)}
                            />
                        </div>
                    ) : (
                        <div className="mt-3">
                            <RequirementRefiner
                                transactionTitle={title}
                                transactionDescription={description}
                                initialRequirements={currentVersion.requirements}
                                confirmLabel="Confirm the new requirement set"
                                onConfirmed={setConfirmed}
                            />
                        </div>
                    )}
                </div>

                {error && (
                    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                        {error}
                    </p>
                )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
                <button
                    type="button"
                    onClick={() => {
                        reset();
                        onClose();
                    }}
                    className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                    {submitting ? "Proposing…" : "Send proposal"}
                </button>
            </div>
        </Modal>
    );
}
