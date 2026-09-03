/**
 * ProjectCard — Displays a project summary card
 */

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Project } from "@/types";

interface ProjectCardProps {
    project: Project;
    href?: string;
}

export function ProjectCard({ project, href }: ProjectCardProps) {
    const inner = (
        <Card className="transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold leading-snug">{project.title}</h3>
                <StatusBadge status={project.status} />
            </div>

            <p className="mt-2 text-sm text-zinc-500">
                {project.currency} {project.budget.toLocaleString()}
            </p>

            <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
                <span>
                    {project.freelancerId ? "Freelancer assigned" : "Not assigned"}
                </span>
                <span>{project.createdAt.toLocaleDateString()}</span>
            </div>
        </Card>
    );

    if (href) {
        return (
            <Link href={href} className="block">
                {inner}
            </Link>
        );
    }

    return inner;
}
