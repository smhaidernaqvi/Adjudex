"use client";

/**
 * AgreementHistory — the immutable version timeline of a locked agreement.
 *
 * Both parties see the identical history; nobody else can reach it. Every
 * version records the amount, currency, deadline, the exact requirement set,
 * who proposed it, who accepted it, and when.
 */

import { Card } from "@/components/ui/Card";
import type { AgreementVersion } from "@/types";

interface AgreementHistoryProps {
    versions: AgreementVersion[];
    /** Resolves a user id to a display name. */
    nameOf: (userId: string) => string;
    currentUserId: string;
}

export function AgreementHistory({
    versions,
    nameOf,
    currentUserId,
}: AgreementHistoryProps) {
    if (versions.length === 0) return null;

    // Newest first — the version in force is at the top.
    const ordered = [...versions].sort((a, b) => b.version - a.version);

    return (
        <Card className="mt-4">
            <h2 className="text-sm font-medium text-zinc-500">
                Agreement history ({versions.length} version
                {versions.length !== 1 ? "s" : ""})
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
                Versions are immutable. Terms only move when one party proposes a
                change and the other accepts it.
            </p>

            <ol className="mt-4 flex flex-col gap-3">
                {ordered.map((v) => {
                    const isCurrent = v.version === ordered[0].version;
                    return (
                        <li
                            key={v.id}
                            className={`rounded-md border px-4 py-3 ${isCurrent
                                    ? "border-green-200 bg-green-50"
                                    : "border-zinc-200"
                                }`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <p className="text-sm font-semibold">
                                    Agreement v{v.version}
                                    {isCurrent && (
                                        <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                                            In force
                                        </span>
                                    )}
                                </p>
                                <p className="shrink-0 text-sm font-semibold text-zinc-700">
                                    {v.currency} {v.amount.toLocaleString()}
                                </p>
                            </div>

                            <p className="mt-1 text-xs text-zinc-500">
                                {v.title} · deadline {v.deadline.toLocaleDateString()}
                            </p>

                            {v.changeSummary && (
                                <p className="mt-2 rounded border border-zinc-200 bg-white/60 px-2 py-1 text-xs text-zinc-600">
                                    Change: {v.changeSummary}
                                </p>
                            )}

                            <ul className="mt-2 flex flex-col gap-1">
                                {v.requirements.map((r, i) => (
                                    <li key={r.id} className="text-xs text-zinc-700">
                                        <span className="text-zinc-400">{i + 1}.</span>{" "}
                                        {r.title}
                                        <span
                                            className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${r.isRequired
                                                    ? "bg-red-50 text-red-600"
                                                    : "bg-zinc-100 text-zinc-500"
                                                }`}
                                        >
                                            {r.isRequired ? "Required" : "Optional"}
                                        </span>
                                    </li>
                                ))}
                            </ul>

                            <p className="mt-2 text-[11px] text-zinc-500">
                                Proposed by {nameOf(v.proposedBy)}
                                {v.proposedBy === currentUserId ? " (you)" : ""} ·
                                accepted by{" "}
                                {v.agreedBy
                                    .map(
                                        (id) =>
                                            `${nameOf(id)}${id === currentUserId ? " (you)" : ""
                                            }`,
                                    )
                                    .join(" and ")}{" "}
                                · {v.agreedAt.toLocaleString()}
                            </p>
                        </li>
                    );
                })}
            </ol>
        </Card>
    );
}
