"use client";

/**
 * TransactionDashboard — the single dashboard both roles share.
 *
 * Adjudex has no marketplace, so there is nothing to browse. Every row here
 * comes from a participant-scoped query: a user only ever sees transactions
 * they initiated or were invited to. The wording is deliberately neutral
 * because either side may be the initiator.
 *
 *   Requests Received   → I am the invited counterparty, a decision is mine
 *   Requests Sent       → I initiated, waiting on them (or revising)
 *   Active Transactions → agreement locked, execution under way
 *   Completed           → execution finished
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getUserById } from "@/lib/auth";
import {
    getAgreedTransactions,
    getRequestsReceived,
    getRequestsSent,
    getTransactionsForUser,
} from "@/services/transactions";
import { getProjectForUser, getRequirementCount } from "@/services/projects";
import type { Project, Transaction, User } from "@/types";

/** Execution statuses that mean the transaction is finished. */
const FINISHED: Project["status"][] = [
    "COMPLETED",
    "PAYMENT_RELEASED",
    "FINAL_DELIVERY_RELEASED",
];

interface Row {
    transaction: Transaction;
    otherParty: User | null;
    project: Project | null;
}

interface TransactionDashboardProps {
    userId: string;
    userName?: string;
}

export function TransactionDashboard({
    userId,
    userName,
}: TransactionDashboardProps) {
    const [received, setReceived] = useState<Row[]>([]);
    const [sent, setSent] = useState<Row[]>([]);
    const [active, setActive] = useState<Row[]>([]);
    const [completed, setCompleted] = useState<Row[]>([]);
    const [declined, setDeclined] = useState<Row[]>([]);
    const [loaded, setLoaded] = useState(false);

    const load = useCallback(() => {
        const toRow = (t: Transaction): Row => {
            const otherId =
                t.initiatorUserId === userId ? t.counterpartyUserId : t.initiatorUserId;
            return {
                transaction: t,
                otherParty: getUserById(otherId),
                // Authorized read: returns null if this user is somehow not a
                // participant of the execution project.
                project: t.projectId ? getProjectForUser(t.projectId, userId) : null,
            };
        };

        // getRequestsReceived/Sent also carry REJECTED; those belong in the
        // dedicated Declined section below, not in the negotiation lists.
        setReceived(
            getRequestsReceived(userId)
                .filter((t) => t.status !== "REJECTED")
                .map(toRow),
        );
        setSent(
            getRequestsSent(userId)
                .filter((t) => t.status !== "REJECTED")
                .map(toRow),
        );

        const agreed = getAgreedTransactions(userId).map(toRow);
        setActive(agreed.filter((r) => !r.project || !FINISHED.includes(r.project.status)));
        setCompleted(agreed.filter((r) => r.project && FINISHED.includes(r.project.status)));

        // REJECTED is terminal, so it never appears in the received/sent lists
        // above (those only carry statuses still in negotiation).
        setDeclined(
            getTransactionsForUser(userId)
                .filter((t) => t.status === "REJECTED")
                .map(toRow),
        );
        setLoaded(true);
    }, [userId]);

    useEffect(() => {
        load();
    }, [load]);

    // Re-read when the user returns to this tab — the other party may have
    // acted in a different tab of the same browser (the localStorage demo
    // model). See the report for why this cannot work across devices.
    useEffect(() => {
        const onFocus = () => load();
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [load]);

    const pendingCount = received.filter(
        (r) => r.transaction.status === "REQUEST_SENT",
    ).length;

    return (
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-8">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        {userName ? `Welcome, ${userName}` : "Your transactions"}
                    </h1>
                    <p className="mt-1 max-w-md text-sm text-zinc-500">
                        Adjudex is a private trust layer, not a job board. You only
                        see transactions you started or were invited to.
                    </p>
                </div>

                <Link
                    href="/transactions/new"
                    className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                    Create Transaction
                </Link>
            </div>

            {!loaded && (
                <p className="mt-8 text-sm text-zinc-500">Loading…</p>
            )}

            {loaded && pendingCount > 0 && (
                <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {pendingCount} private request
                    {pendingCount !== 1 ? "s" : ""} awaiting your response.
                </p>
            )}

            {/* ── Requests Received ─────────────────────────── */}
            <Section
                title="Requests Received"
                hint="Private requests someone sent to you. Accept, request changes, or decline."
                count={received.length}
            >
                {received.map(({ transaction, otherParty }) => (
                    <NegotiationCard
                        key={transaction.id}
                        transaction={transaction}
                        otherParty={otherParty}
                        perspective="received"
                    />
                ))}
                {received.length === 0 && <Empty text="No requests received." />}
            </Section>

            {/* ── Requests Sent ─────────────────────────────── */}
            <Section
                title="Requests Sent"
                hint="Requests you initiated that are still being negotiated."
                count={sent.length}
            >
                {sent.map(({ transaction, otherParty }) => (
                    <NegotiationCard
                        key={transaction.id}
                        transaction={transaction}
                        otherParty={otherParty}
                        perspective="sent"
                    />
                ))}
                {sent.length === 0 && <Empty text="No requests sent yet." />}
            </Section>

            {/* ── Active Transactions ───────────────────────── */}
            <Section
                title="Active Transactions"
                hint="Agreements both parties have locked. Terms can only move by mutual change proposal."
                count={active.length}
            >
                {active.map(({ transaction, otherParty, project }) => (
                    <AgreementCard
                        key={transaction.id}
                        transaction={transaction}
                        otherParty={otherParty}
                        project={project}
                    />
                ))}
                {active.length === 0 && (
                    <Empty text="No locked agreements in progress." />
                )}
            </Section>

            {/* ── Completed Transactions ────────────────────── */}
            <Section
                title="Completed Transactions"
                hint="Finished agreements. Their version history stays private to the two of you."
                count={completed.length}
            >
                {completed.map(({ transaction, otherParty, project }) => (
                    <AgreementCard
                        key={transaction.id}
                        transaction={transaction}
                        otherParty={otherParty}
                        project={project}
                    />
                ))}
                {completed.length === 0 && <Empty text="Nothing completed yet." />}
            </Section>

            {/* ── Declined ──────────────────────────────────── */}
            {declined.length > 0 && (
                <Section
                    title="Declined"
                    hint="Transactions either party walked away from. They cannot be reopened."
                    count={declined.length}
                >
                    {declined.map(({ transaction, otherParty }) => (
                        <NegotiationCard
                            key={transaction.id}
                            transaction={transaction}
                            otherParty={otherParty}
                            perspective={
                                transaction.initiatorUserId === userId ? "sent" : "received"
                            }
                        />
                    ))}
                </Section>
            )}
        </main>
    );
}

// ── Section shell ─────────────────────────────────────────────

function Section({
    title,
    hint,
    count,
    children,
}: {
    title: string;
    hint: string;
    count: number;
    children: React.ReactNode;
}) {
    return (
        <section className="mt-10">
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold">{title}</h2>
                <span className="shrink-0 text-xs text-zinc-400">
                    {count} {count === 1 ? "item" : "items"}
                </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
        </section>
    );
}

function Empty({ text }: { text: string }) {
    return (
        <div className="rounded-lg border border-dashed border-zinc-200 px-4 py-8 text-center sm:col-span-2">
            <p className="text-sm text-zinc-400">{text}</p>
        </div>
    );
}

// ── Negotiation card (pre-agreement) ──────────────────────────

function NegotiationCard({
    transaction,
    otherParty,
    perspective,
}: {
    transaction: Transaction;
    otherParty: User | null;
    perspective: "received" | "sent";
}) {
    const terms = transaction.currentTerms;
    const needsAction =
        perspective === "received" && transaction.status === "REQUEST_SENT";
    const youMustRevise =
        perspective === "sent" && transaction.status === "CHANGE_REQUESTED";

    return (
        <Link href={`/transactions/${transaction.id}`} className="block">
            <Card
                className={`h-full transition-shadow hover:shadow-md ${needsAction || youMustRevise ? "border-amber-300" : ""
                    }`}
            >
                <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold leading-snug">{terms.title}</h3>
                    <StatusBadge status={transaction.status} />
                </div>

                <p className="mt-2 text-xs text-zinc-500">
                    {perspective === "received" ? "From" : "To"}{" "}
                    <span className="font-medium text-zinc-700">
                        {otherParty?.name ?? "unknown account"}
                    </span>{" "}
                    · {otherParty?.role ?? ""}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                    <span className="font-medium text-zinc-600">
                        {terms.currency} {terms.proposedAmount.toLocaleString()}
                    </span>
                    <span>Deadline {terms.deadline.toLocaleDateString()}</span>
                    <span>
                        {terms.requirements.length === 1
                            ? "1 criterion"
                            : `${terms.requirements.length} criteria`}
                    </span>
                </div>

                {transaction.changeRequestNote && (
                    <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        {perspective === "sent" ? "They asked: " : "You asked: "}
                        {transaction.changeRequestNote}
                    </p>
                )}

                {needsAction && (
                    <p className="mt-3 text-xs font-medium text-amber-700">
                        Needs your response →
                    </p>
                )}
                {youMustRevise && (
                    <p className="mt-3 text-xs font-medium text-amber-700">
                        Revise and re-send →
                    </p>
                )}
            </Card>
        </Link>
    );
}

// ── Agreement card (post-agreement) ───────────────────────────

function AgreementCard({
    transaction,
    otherParty,
    project,
}: {
    transaction: Transaction;
    otherParty: User | null;
    project: Project | null;
}) {
    // The project budget is kept in sync with the locked version, so it is the
    // figure both parties are currently bound by.
    const amount = project ? project.budget : transaction.currentTerms.proposedAmount;
    const currency = project ? project.currency : transaction.currentTerms.currency;
    const criteriaCount = project ? getRequirementCount(project.id) : 0;

    return (
        <Link href={`/transactions/${transaction.id}`} className="block">
            <Card className="h-full transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold leading-snug">
                        {project ? project.title : transaction.currentTerms.title}
                    </h3>
                    <StatusBadge status={project ? project.status : transaction.status} />
                </div>

                <p className="mt-2 text-xs text-zinc-500">
                    With{" "}
                    <span className="font-medium text-zinc-700">
                        {otherParty?.name ?? "unknown account"}
                    </span>{" "}
                    · {transaction.initiatorUserId === otherParty?.id ? "they initiated" : "you initiated"}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                    <span className="font-medium text-zinc-600">
                        {currency} {amount.toLocaleString()}
                    </span>
                    {project && (
                        <span>Deadline {project.deadline.toLocaleDateString()}</span>
                    )}
                    {project && (
                        <span>
                            {criteriaCount === 1
                                ? "1 agreed criterion"
                                : `${criteriaCount} agreed criteria`}
                        </span>
                    )}
                </div>

                {project && (
                    <p className="mt-3 text-xs text-zinc-500">
                        Open for delivery, escrow and verification →
                    </p>
                )}
            </Card>
        </Link>
    );
}
