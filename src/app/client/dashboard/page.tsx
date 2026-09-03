"use client";

/**
 * Client Dashboard
 *
 * Shows the logged-in client's projects, with a button to create new ones.
 * Displays an empty state when no projects exist yet.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProjectCard } from "@/components/project/ProjectCard";
import { getProjectsByClientId } from "@/services/projects";
import type { Project } from "@/types";

export default function ClientDashboardPage() {
    const { user } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);

    useEffect(() => {
        if (user) {
            setProjects(getProjectsByClientId(user.id));
        }
    }, [user]);

    return (
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Welcome, {user?.name}
                    </h1>
                    <p className="mt-1 text-sm text-zinc-500">
                        Manage your projects and track their progress.
                    </p>
                </div>

                <Link
                    href="/client/projects/new"
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                    Create New Project
                </Link>
            </div>

            {/* Project list */}
            {projects.length > 0 ? (
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                    {projects.map((p) => (
                        <ProjectCard
                            key={p.id}
                            project={p}
                            href={`/client/projects/${p.id}`}
                        />
                    ))}
                </div>
            ) : (
                <EmptyState />
            )}
        </main>
    );
}

function EmptyState() {
    return (
        <div className="mt-16 flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                <svg
                    className="h-8 w-8 text-zinc-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
                    />
                </svg>
            </div>

            <h2 className="mt-4 text-lg font-semibold">No projects yet</h2>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
                Create your first project to get started. Define the scope, set a
                budget, and add requirements for the freelancer.
            </p>

            <Link
                href="/client/projects/new"
                className="mt-6 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
                Create Your First Project
            </Link>
        </div>
    );
}
