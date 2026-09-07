"use client";

/**
 * Transaction Detail — the private negotiation view.
 *
 * Visibility: this page resolves the record through getTransactionForUser(),
 * which returns null for anyone who is not one of the two participants. An
 * unrelated account therefore sees the same "not found" screen as a bogus id —
 * the transaction's existence is not even disclosed.
 *
 * What each party can do here:
 *   counterparty + REQUEST_SENT   → Accept / Request changes / Decline
 *   initiator   + REQUEST_SENT    → wait, or revise and re-send
 *   initiator   + CHANGE_REQUESTED→ revise and re-send (fresh AI pass if the
 *                                   requirement set moved)
 *   either      + AGREED          → agreement history, propose a change,
 *                                   respond to a pending change, open the
 *                                   execution view
 *
 * Accepting never edits terms: it records acceptance of the snapshot currently
 * on the table, and the agreement locks only when both acceptances point at the
 * SAME snapshot id.
 */

import { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
    RequirementRefiner,
    type ConfirmedRefinement,
} from "@/components/transactions/RequirementRefiner";
import { AgreementHistory } from "@/components/transactions/AgreementHistory";
import { ChangeProposals } from "@/components/transactions/ChangeProposals";
import { getUserById } from "@/lib/auth";
import {
    isTransactionCounterparty,
    isTransactionInitiator,
} from "@/lib/authz";
import {
    acceptTransaction,
    buildTermsSnapshot,
    getTransactionForUser,
    rejectTransaction,
    requestChanges,
    reviseAndResendTerms,
} from "@/services/transactions";
import {
    getAgreementVersionsByProjectId,
    getChangeProposalsByProjectId,
    getCurrentAgreementVersion,
} from "@/services/agreements";
import { getProjectForUser } from "@/services/projects";
import type {
    AgreementChangeProposal,
    AgreementVersion,
    Project,
    Transaction,
    TransactionRequirement,
    User,
} from "@/types";

const inputClass =
    "rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function toDateInputValue(date: Date): string {
    return date.toISOString().slice(0, 10);
}

// ── Page body ─────────────────────────────────────────────────

function TransactionDetails({ params }: { params: { id: string } }) {
    const { user } = useAuth();

    const [transaction, setTransaction] = useState<Transaction | null>(null);
    const [loaded, setLoaded] = useState(false);

    const [otherParty, setOtherParty] = useState<User | null>(null);
    const [project, setProject] = useState<Project | null>(null);
    const [currentVersion, setCurrentVersion] = useState<AgreementVersion | null>(null);
    const [versions, setVersions] = useState<AgreementVersion[]>([]);
    const [proposals, setProposals] = useState<AgreementChangeProposal[]>([]);

    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);

    // Inline panels — kept out of modals so the AI refiner has room to breathe.
    const [showChangesForm, setShowChangesForm] = useState(false);
    const [showRejectForm, setShowRejectForm] = useState(false);
    const [showReviseForm, setShowReviseForm] = useState(false);
    const [note, setNote] = useState("");

    /**
     * Every read here is participant-scoped. getTransactionForUser() is the
     * gate; the project/version/proposal reads that follow are only reached
     * once that gate has passed.
     */
    const loadData = useCallback(() => {
        if (!user) return;

        const tx = getTransactionForUser(params.id, user.id);
        setTransaction(tx);
        setLoaded(true);

        if (!tx) {
            setOtherParty(null);
            setProject(null);
            setCurrentVersion(null);
            setVersions([]);
            setProposals([]);
            return;
        }

        const otherId =
            tx.initiatorUserId === user.id
                ? tx.counterpartyUserId
                : tx.initiatorUserId;
        setOtherParty(getUserById(otherId));

        if (tx.projectId) {
            // Authorized again at the project layer, independently of the
            // transaction gate — defence in depth.
            const p = getProjectForUser(tx.projectId, user.id);
            setProject(p);
            setCurrentVersion(getCurrentAgreementVersion(tx.projectId));
            setVersions(getAgreementVersionsByProjectId(tx.projectId));
            setProposals(getChangeProposalsByProjectId(tx.projectId));
        } else {
            setProject(null);
            setCurrentVersion(null);
            setVersions([]);
            setProposals([]);
        }
    }, [params.id, user]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (new URLSearchParams(window.location.search).get("sent") === "1") {
            setNotice(
                "Private request sent. Only you and the invited counterparty can see it.",
            );
        }
    }, []);

    // ── Derived facts ─────────────────────────────────────────

    const isInitiator = transaction ? isTransactionInitiator(transaction, user?.id) : false;
    const isCounterparty = transaction
        ? isTransactionCounterparty(transaction, user?.id)
        : false;
    const isAgreed = transaction?.status === "AGREED";
    const executionHref =
        project && user
            ? user.role === "freelancer"
                ? `/freelancer/projects/${project.id}`
                : `/client/projects/${project.id}`
            : null;

    /**
     * Resolves a participant id to a real display name.
     *
     * Deliberately does NOT return "You" for the current user: AgreementHistory
     * and ChangeProposals append their own " (you)" marker, so returning "You"
     * here produced "You (you)".
     */
    const nameOf = (id: string): string => {
        if (id === user?.id) return user?.name ?? "You";
        return otherParty?.name ?? "the other party";
    };

    function run(action: () => void, successMessage?: string) {
        setBusy(true);
        setError("");
        setNotice("");
        try {
            action();
            if (successMessage) setNotice(successMessage);
            setShowChangesForm(false);
            setShowRejectForm(false);
            setShowReviseForm(false);
            setNote("");
            loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
        } finally {
            setBusy(false);
        }
    }

    // ── Not a participant / missing ───────────────────────────

    if (loaded && !transaction) {
        return (
            <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-8">
                <Card>
                    <h1 className="text-lg font-semibold">Transaction not found</h1>
                    <p className="mt-2 text-sm text-zinc-600">
                        Adjudex transactions are private. Either this id does not
                        exist, or you are not one of its two participants.
                    </p>
                    <Link
                        href={
                            user?.role === "freelancer"
                                ? "/freelancer/dashboard"
                                : "/client/dashboard"
                        }
                        className="mt-4 inline-block text-sm text-blue-600 hover:underline"
                    >
                        &larr; Back to your dashboard
                    </Link>
                </Card>
            </main>
        );
    }

    if (!transaction) {
        return (
            <main className="flex flex-1 items-center justify-center">
                <p className="text-sm text-zinc-500">Loading…</p>
            </main>
        );
    }

    const terms = transaction.currentTerms;

    /**
     * What this page presents as the current deal.
     *
     * Before locking, that is the negotiation snapshot on the table. AFTER
     * locking it is the agreed version, which may have moved on through
     * accepted change proposals. Rendering the stale negotiation snapshot
     * alongside a "v2" panel would show two different amounts and two different
     * criterion counts on the same page.
     */
    const inForce =
        isAgreed && currentVersion
            ? {
                title: currentVersion.title,
                description: currentVersion.description,
                amount: currentVersion.amount,
                currency: currentVersion.currency,
                deadline: currentVersion.deadline,
                requirements: currentVersion.requirements,
                heading: `Terms in force · agreement v${currentVersion.version}`,
                amountLabel: "Agreed amount",
            }
            : {
                title: terms.title,
                description: terms.description,
                amount: terms.proposedAmount,
                currency: terms.currency,
                deadline: terms.deadline,
                requirements: terms.requirements,
                heading: "Terms on the table",
                amountLabel: "Proposed amount",
            };

    // ── Render ────────────────────────────────────────────────

    return (
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-8">
            <Link
                href={
                    user?.role === "freelancer"
                        ? "/freelancer/dashboard"
                        : "/client/dashboard"
                }
                className="text-sm text-zinc-500 hover:text-zinc-700"
            >
                &larr; Dashboard
            </Link>

            {/* Header */}
            <div className="mt-3 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{inForce.title}</h1>
                    <p className="mt-1 text-sm text-zinc-500">
                        Initiated by{" "}
                        <span className="font-medium text-zinc-700">
                            {isInitiator ? "you" : otherParty?.name ?? "the other party"}
                        </span>{" "}
                        · {transaction.createdAt.toLocaleString()}
                    </p>
                </div>
                <StatusBadge status={transaction.status} />
            </div>

            <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                Private transaction — visible only to you and{" "}
                {otherParty?.name ?? "the other party"} ({otherParty?.email}). No
                other Adjudex user can see, accept or modify it.
            </p>

            {notice && (
                <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                    {notice}
                </p>
            )}
            {error && (
                <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                    {error}
                </p>
            )}

            {/* ── Terms ─────────────────────────────────────── */}
            <Card className="mt-4">
                <h2 className="text-sm font-medium text-zinc-500">{inForce.heading}</h2>

                <p className="mt-3 text-sm text-zinc-700">{inForce.description}</p>

                <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div>
                        <dt className="text-xs text-zinc-400">{inForce.amountLabel}</dt>
                        <dd className="text-sm font-semibold">
                            {inForce.currency} {inForce.amount.toLocaleString()}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs text-zinc-400">Deadline</dt>
                        <dd className="text-sm font-semibold">
                            {inForce.deadline.toLocaleDateString()}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs text-zinc-400">Roles</dt>
                        <dd className="text-sm font-semibold capitalize">
                            {transaction.initiatorRole} ↔ {transaction.counterpartyRole}
                        </dd>
                    </div>
                </dl>
            </Card>

            {/* ── Refined requirements ──────────────────────── */}
            <Card className="mt-4">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-medium text-zinc-500">
                        Acceptance criteria ({inForce.requirements.length})
                    </h2>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                        AI-refined &amp; confirmed
                    </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                    These are the objective, testable criteria the delivery will be
                    verified against.
                </p>

                <ol className="mt-3 flex flex-col gap-3">
                    {inForce.requirements.map((r, i) => (
                        <RequirementRow key={r.id} requirement={r} index={i} />
                    ))}
                </ol>
            </Card>

            {/* ── AI ambiguity report ───────────────────────── */}
            {transaction.refinement && transaction.refinement.ambiguities.length > 0 && (
                <Card className="mt-4">
                    <h2 className="text-sm font-medium text-zinc-500">
                        Flagged by AI before agreeing
                    </h2>
                    <p className="mt-1 text-xs text-zinc-500">
                        Points the AI found vague or missing in the rough input.
                        Settle these between you — they are not yet part of the
                        agreed criteria.
                    </p>
                    <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5">
                        {transaction.refinement.ambiguities.map((a, i) => (
                            <li key={i} className="text-sm text-zinc-700">
                                {a}
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            {/* ── Change request note ───────────────────────── */}
            {transaction.changeRequestNote && (
                <Card className="mt-4">
                    <h2 className="text-sm font-medium text-amber-700">
                        Changes requested
                    </h2>
                    <p className="mt-2 text-sm text-zinc-700">
                        {transaction.changeRequestNote}
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                        {isInitiator
                            ? "Revise the terms and re-send. The counterparty must accept the new version from scratch."
                            : "Waiting for the initiator to revise and re-send."}
                    </p>
                </Card>
            )}

            {transaction.rejectReason && (
                <Card className="mt-4">
                    <h2 className="text-sm font-medium text-red-600">
                        Declined
                    </h2>
                    <p className="mt-2 text-sm text-zinc-700">
                        {transaction.rejectReason}
                    </p>
                </Card>
            )}

            {/* ── Actions ───────────────────────────────────── */}
            {!isAgreed && transaction.status !== "REJECTED" && (
                <Card className="mt-4">
                    <h2 className="text-sm font-medium text-zinc-500">Your move</h2>

                    {isCounterparty && transaction.status === "REQUEST_SENT" && (
                        <>
                            <p className="mt-2 text-xs text-zinc-500">
                                Accepting locks an agreement on exactly these terms.
                                You cannot silently edit them — if something is wrong,
                                request changes instead.
                            </p>
                            <div className="mt-4 flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                        run(
                                            () => acceptTransaction(transaction.id, user!.id),
                                            "Accepted. The agreement is locked at version 1.",
                                        )
                                    }
                                    className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                                >
                                    Accept &amp; lock agreement
                                </button>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setShowChangesForm((v) => !v)}
                                    className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
                                >
                                    Request changes
                                </button>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setShowRejectForm((v) => !v)}
                                    className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
                                >
                                    Decline
                                </button>
                            </div>
                        </>
                    )}

                    {isCounterparty && transaction.status === "CHANGE_REQUESTED" && (
                        <p className="mt-2 text-sm text-zinc-600">
                            You asked for changes. Waiting for the initiator to revise
                            and re-send.
                        </p>
                    )}

                    {isInitiator && transaction.status === "REQUEST_SENT" && (
                        <>
                            <p className="mt-2 text-sm text-zinc-600">
                                Waiting for {otherParty?.name ?? "the counterparty"} to
                                accept, request changes, or decline.
                            </p>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => setShowReviseForm((v) => !v)}
                                className="mt-4 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
                            >
                                Revise &amp; re-send
                            </button>
                        </>
                    )}

                    {isInitiator && transaction.status === "CHANGE_REQUESTED" && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => setShowReviseForm((v) => !v)}
                            className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                        >
                            Revise &amp; re-send
                        </button>
                    )}

                    {/* Request changes form */}
                    {showChangesForm && (
                        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                            <label className="text-sm font-medium text-amber-800">
                                What should change?
                            </label>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                rows={3}
                                className={inputClass + " mt-2 w-full"}
                                placeholder="e.g. The amount should be 650, not 500, and the criteria need to state how many revisions are included."
                            />
                            <p className="mt-2 text-xs text-zinc-500">
                                This does not modify the terms. It sends the request
                                back to the initiator.
                            </p>
                            <div className="mt-3 flex gap-3">
                                <button
                                    type="button"
                                    disabled={busy || !note.trim()}
                                    onClick={() =>
                                        run(
                                            () =>
                                                requestChanges(transaction.id, user!.id, note),
                                            "Change request sent back to the initiator.",
                                        )
                                    }
                                    className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                                >
                                    Send change request
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowChangesForm(false);
                                        setNote("");
                                    }}
                                    className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Decline form */}
                    {showRejectForm && (
                        <div className="mt-4 rounded-md border border-zinc-200 px-4 py-3">
                            <label className="text-sm font-medium">
                                Reason (optional)
                            </label>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                rows={2}
                                className={inputClass + " mt-2 w-full"}
                                placeholder="Why are you declining?"
                            />
                            <div className="mt-3 flex gap-3">
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                        run(
                                            () =>
                                                rejectTransaction(
                                                    transaction.id,
                                                    user!.id,
                                                    note.trim() || undefined,
                                                ),
                                            "Transaction declined.",
                                        )
                                    }
                                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                                >
                                    Decline transaction
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowRejectForm(false);
                                        setNote("");
                                    }}
                                    className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Revise & re-send */}
                    {showReviseForm && (
                        <RevisePanel
                            transaction={transaction}
                            onClose={() => {
                                setShowReviseForm(false);
                                setNote("");
                            }}
                            onRevised={(termsSnapshot, refinement) =>
                                run(
                                    () =>
                                        reviseAndResendTerms(transaction.id, user!.id, {
                                            terms: termsSnapshot,
                                            refinement,
                                        }),
                                    "Revised terms re-sent. The counterparty must accept them again.",
                                )
                            }
                        />
                    )}
                </Card>
            )}

            {transaction.status === "REJECTED" && (
                <Card className="mt-4">
                    <p className="text-sm text-zinc-600">
                        This transaction was declined and can no longer be changed.
                        Start a new one if you still want to work together.
                    </p>
                    <Link
                        href="/transactions/new"
                        className="mt-3 inline-block text-sm text-blue-600 hover:underline"
                    >
                        Create a new transaction
                    </Link>
                </Card>
            )}

            {/* ── Locked agreement ──────────────────────────── */}
            {isAgreed && currentVersion && project && (
                <>
                    <Card className="mt-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-medium text-green-700">
                                    Agreement locked · v{currentVersion.version}
                                </h2>
                                <p className="mt-1 text-xs text-zinc-500">
                                    Both parties accepted the same terms snapshot on{" "}
                                    {currentVersion.agreedAt.toLocaleString()}. Escrow,
                                    delivery and AI verification all run against this
                                    version.
                                </p>
                            </div>
                            <span className="shrink-0 text-sm font-semibold text-zinc-700">
                                {currentVersion.currency}{" "}
                                {currentVersion.amount.toLocaleString()}
                            </span>
                        </div>

                        {executionHref && (
                            <Link
                                href={executionHref}
                                className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                            >
                                Open execution view →
                            </Link>
                        )}
                    </Card>

                    <ChangeProposals
                        projectId={project.id}
                        currentUserId={user!.id}
                        currentVersion={currentVersion}
                        proposals={proposals}
                        nameOf={nameOf}
                        onChanged={loadData}
                    />

                    <AgreementHistory
                        versions={versions}
                        currentUserId={user!.id}
                        nameOf={nameOf}
                    />
                </>
            )}

            {isAgreed && !currentVersion && (
                <Card className="mt-4">
                    <p className="text-sm text-amber-700">
                        This agreement is marked as locked but no agreement version
                        record was found, so there is nothing objective to verify a
                        delivery against. This can only happen with data written by an
                        older version of the app.
                    </p>
                </Card>
            )}
        </main>
    );
}

// ── Requirement row ───────────────────────────────────────────

function RequirementRow({
    requirement,
    index,
}: {
    requirement: TransactionRequirement;
    index: number;
}) {
    return (
        <li className="rounded-md border border-zinc-200 px-3 py-2">
            <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">
                    <span className="text-zinc-400">{index + 1}.</span>{" "}
                    {requirement.title}
                </p>
                <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${requirement.isRequired
                            ? "bg-red-50 text-red-600"
                            : "bg-zinc-100 text-zinc-500"
                        }`}
                >
                    {requirement.isRequired ? "Required" : "Optional"}
                </span>
            </div>
            {requirement.description && (
                <p className="mt-1 text-xs text-zinc-600">{requirement.description}</p>
            )}
        </li>
    );
}

// ── Revise & re-send panel ────────────────────────────────────

/**
 * The initiator's only way to move terms before the agreement locks.
 *
 * A new snapshot id is minted on submit, which voids any acceptance the
 * counterparty gave to the previous terms — they must accept again. If the
 * requirement set changed, a fresh confirmed AI refinement is mandatory; a
 * money/schedule-only revision reuses the existing refinement record.
 */
function RevisePanel({
    transaction,
    onClose,
    onRevised,
}: {
    transaction: Transaction;
    onClose: () => void;
    onRevised: (
        terms: ReturnType<typeof buildTermsSnapshot>,
        refinement: ConfirmedRefinement["refinement"] | null,
    ) => void;
}) {
    const terms = transaction.currentTerms;

    const [title, setTitle] = useState(terms.title);
    const [description, setDescription] = useState(terms.description);
    const [amount, setAmount] = useState(String(terms.proposedAmount));
    const [currency, setCurrency] = useState(terms.currency);
    const [deadline, setDeadline] = useState(toDateInputValue(terms.deadline));
    const [confirmed, setConfirmed] = useState<ConfirmedRefinement | null>(null);
    const [error, setError] = useState("");

    const requirements: TransactionRequirement[] = confirmed
        ? confirmed.requirements
        : terms.requirements;

    function handleSubmit() {
        setError("");

        if (!title.trim()) {
            setError("A title is required.");
            return;
        }
        const value = parseFloat(amount);
        if (isNaN(value) || value <= 0) {
            setError("The proposed amount must be greater than 0.");
            return;
        }
        if (!deadline || isNaN(new Date(deadline).getTime())) {
            setError("Enter a valid deadline.");
            return;
        }

        try {
            onRevised(
                buildTermsSnapshot({
                    title,
                    description,
                    proposedAmount: value,
                    currency,
                    deadline: new Date(deadline),
                    requirements,
                }),
                confirmed?.refinement ?? null,
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to re-send.");
        }
    }

    return (
        <div className="mt-4 rounded-md border border-zinc-200 px-4 py-4">
            <h3 className="text-sm font-medium">Revise the terms</h3>
            <p className="mt-1 text-xs text-zinc-500">
                Re-sending voids any acceptance of the previous terms — the
                counterparty has to accept the new version from scratch.
            </p>

            <div className="mt-4 flex flex-col gap-4">
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
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Scope / description</label>
                    <textarea
                        value={description}
                        onChange={(e) => {
                            setDescription(e.target.value);
                            setError("");
                        }}
                        rows={3}
                        className={inputClass}
                    />
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_120px_1fr]">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium">Amount</label>
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

                {/* Requirement changes must go through the same AI gate. */}
                <div className="rounded-md border border-zinc-200 p-3">
                    <p className="text-sm font-medium">Acceptance criteria</p>
                    <p className="mt-1 text-xs text-zinc-500">
                        Leave untouched to keep the agreed criteria. To change them,
                        refine with AI and confirm — vague wording cannot be re-sent
                        as terms.
                    </p>

                    <ul className="mt-3 flex flex-col gap-1">
                        {(confirmed ? confirmed.requirements : terms.requirements).map(
                            (r, i) => (
                                <li key={r.id} className="text-xs text-zinc-700">
                                    <span className="text-zinc-400">{i + 1}.</span>{" "}
                                    {r.title}
                                    <span className="ml-2 text-zinc-400">
                                        {r.isRequired ? "Required" : "Optional"}
                                    </span>
                                </li>
                            ),
                        )}
                    </ul>

                    <div className="mt-3">
                        <RequirementRefiner
                            transactionTitle={title}
                            transactionDescription={description}
                            initialRequirements={terms.requirements}
                            confirmLabel="Confirm revised criteria"
                            refineLabel="✨ Refine the criteria with AI"
                            onConfirmed={setConfirmed}
                            onReset={() => setConfirmed(null)}
                        />
                    </div>
                </div>

                {error && (
                    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                        {error}
                    </p>
                )}

                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={handleSubmit}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                    >
                        Re-send request
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Wrapper (params is a Promise in the App Router) ───────────

function TransactionDetailsWrapper({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const [resolvedParams, setResolvedParams] = useState<{ id: string } | null>(null);

    useEffect(() => {
        let active = true;
        params.then((p) => {
            if (active) setResolvedParams(p);
        });
        return () => {
            active = false;
        };
    }, [params]);

    if (!resolvedParams) {
        return (
            <main className="flex flex-1 items-center justify-center">
                <p className="text-sm text-zinc-500">Loading…</p>
            </main>
        );
    }

    return (
        <Suspense
            fallback={
                <main className="flex flex-1 items-center justify-center">
                    <p className="text-sm text-zinc-500">Loading…</p>
                </main>
            }
        >
            <TransactionDetails params={resolvedParams} />
        </Suspense>
    );
}

export default function TransactionPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    return <TransactionDetailsWrapper params={params} />;
}
