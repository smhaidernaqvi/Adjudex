"use client";

/**
 * Freelancer Dashboard
 *
 * Shows two sections:
 * 1. Available Projects — status CREATED, no freelancer assigned
 * 2. My Projects — already accepted by this freelancer
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
    getAvailableProjects,
    getProjectsByFreelancerId,
    getRequirementCount,
} from "@/services/projects";
import type { Project } from "@/types";

export default function FreelancerDashboardPage() {
    const { user } = useAuth();
    const [available, setAvailable] = useState<Project[]>([]);
    const [myProjects, setMyProjects] = useState<Project[]>([]);

    useEffect(() => {
        if (user) {
            setAvailable(getAvailableProjects());
            setMyProjects(getProjectsByFreelancerId(user.id));
        }
    }, [user]);

    return (
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Welcome, {user?.name}
                </h1>
                <p className="mt-1 text-sm text-zinc-500">
                    Browse available projects or manage your accepted work.
                </p>
            </div>

            {/* Available Projects */}
            <section className="mt-8">
                <h2 className="text-lg font-semibold">Available Projects</h2>

                {available.length > 0 ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {available.map((p) => (
                            <AvailableCard key={p.id} project={p} />
                        ))}
                    </div>
                ) : (
                    <EmptyAvailable />
                )}
            </section>

            {/* My Projects */}
            <section className="mt-10">
                <h2 className="text-lg font-semibold">My Projects</h2>

                {myProjects.length > 0 ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {myProjects.map((p) => (
                            <Link
                                key={p.id}
                                href={`/freelancer/projects/${p.id}`}
                                className="block"
                            >
                                <Card className="transition-shadow hover:shadow-md">
                                    <div className="flex items-start justify-between gap-3">
                                        <h3 className="font-semibold leading-snug">{p.title}</h3>
                                        <StatusBadge status={p.status} />
                                    </div>
                                    <p className="mt-2 text-sm text-zinc-500">
                                        {p.currency} {p.budget.toLocaleString()}
                                    </p>
                                    <p className="mt-2 text-xs text-zinc-400">
                                        Deadline: {p.deadline.toLocaleDateString()}
                                    </p>
                                </Card>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <p className="mt-4 text-sm text-zinc-400">
                        You haven&apos;t accepted any projects yet.
                    </p>
                )}
            </section>
        </main>
    );
}

// ── Available project card ────────────────────────────────────

function AvailableCard({ project }: { project: Project }) {
    const reqCount = getRequirementCount(project.id);
    const shortDesc =
        project.description.length > 100
            ? project.description.slice(0, 100) + "…"
            : project.description;

    return (
        <Link href={`/freelancer/projects/${project.id}`} className="block">
            <Card className="transition-shadow hover:shadow-md">
                <h3 className="font-semibold leading-snug">{project.title}</h3>
                <p className="mt-1 text-sm text-zinc-500">{shortDesc}</p>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                    <span className="font-medium text-zinc-600">
                        {project.currency} {project.budget.toLocaleString()}
                    </span>
                    <span>Deadline: {project.deadline.toLocaleDateString()}</span>
                    <span>
                        {reqCount} requirement{reqCount !== 1 ? "s" : ""}
                    </span>
                </div>
            </Card>
        </Link>
    );
}

// ── Empty state ───────────────────────────────────────────────

function EmptyAvailable() {
    return (
        <div className="mt-6 flex flex-col items-center rounded-lg border border-dashed border-zinc-200 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                <svg
                    className="h-7 w-7 text-zinc-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                    />
                </svg>
            </div>
            <h3 className="mt-3 text-sm font-semibold">No projects available</h3>
            <p className="mt-1 max-w-xs text-sm text-zinc-400">
                There are no open projects right now. Check back later when clients
                post new work.
            </p>
        </div>
    );
}
