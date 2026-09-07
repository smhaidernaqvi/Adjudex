/**
 * Project Service
 *
 * A Project is the EXECUTION record for a locked agreement. It is created only
 * by the transaction service, only after both parties have accepted the same
 * terms — there is no public creation path and no marketplace listing.
 *
 * Privacy: a project is visible only to its clientId and freelancerId. Callers
 * must go through getProjectForUser() / getProjectsForUser(), which enforce
 * that. getProjectById() is the raw read used internally by services that have
 * already established authorization.
 *
 * Requirements are read from the CURRENT AGREEMENT VERSION, so AI verification
 * and both party views always evaluate the mutually agreed, locked terms —
 * never the original rough input and never a pending proposal.
 *
 * Persists to localStorage for the hackathon MVP (migrate to DB later).
 * State machine transitions are defined in ./state-machine.ts
 */

import type {
    AgreementVersion,
    Project,
    ProjectStatus,
    Requirement,
} from "@/types";
import { isProjectParticipant } from "@/lib/authz";
import { getCurrentAgreementVersion } from "@/services/agreements";
import { isValidTransition } from "./state-machine";

// ─── Storage keys ─────────────────────────────────────────────

const PROJECTS_KEY = "tf_projects";
const REQUIREMENTS_KEY = "tf_requirements";

// ─── Stored shapes (dates as ISO strings for JSON) ───────────

interface StoredProject {
    id: string;
    title: string;
    description: string;
    status: ProjectStatus;
    budget: number;
    currency: string;
    deadline: string;
    clientId: string;
    freelancerId: string | null;
    createdAt: string;
    updatedAt: string;
}

interface StoredRequirement {
    id: string;
    projectId: string;
    title: string;
    description: string;
    isRequired: boolean;
}

// ─── Conversion helpers ───────────────────────────────────────

function toProject(stored: StoredProject): Project {
    return {
        ...stored,
        deadline: new Date(stored.deadline),
        createdAt: new Date(stored.createdAt),
        updatedAt: new Date(stored.updatedAt),
    };
}

function toStored(project: Project): StoredProject {
    return {
        ...project,
        deadline: project.deadline.toISOString(),
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
    };
}

// ─── Raw storage helpers ──────────────────────────────────────

function getStoredProjects(): StoredProject[] {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function saveStoredProjects(projects: StoredProject[]): void {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

function getStoredRequirements(): StoredRequirement[] {
    const raw = localStorage.getItem(REQUIREMENTS_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function saveStoredRequirements(reqs: StoredRequirement[]): void {
    localStorage.setItem(REQUIREMENTS_KEY, JSON.stringify(reqs));
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Materialise the execution project for a locked agreement.
 *
 * Called only by the transaction service at the moment both parties have
 * accepted the same terms snapshot. The project starts at FREELANCER_ACCEPTED
 * because both sides are already committed — the next step is the client
 * locking escrow.
 *
 * The agreed requirements are mirrored into tf_requirements so existing
 * readers keep working, but reads always prefer the agreement version.
 */
export function createProjectFromAgreement(data: {
    transactionId: string;
    title: string;
    description: string;
    budget: number;
    currency: string;
    deadline: Date;
    clientId: string;
    freelancerId: string;
    requirements: { id: string; title: string; description: string; isRequired: boolean }[];
}): Project {
    const now = new Date();

    const project: Project = {
        id: crypto.randomUUID(),
        title: data.title,
        description: data.description,
        status: "FREELANCER_ACCEPTED",
        budget: data.budget,
        currency: data.currency,
        deadline: data.deadline,
        clientId: data.clientId,
        freelancerId: data.freelancerId,
        createdAt: now,
        updatedAt: now,
    };

    const projects = getStoredProjects();
    projects.push(toStored(project));
    saveStoredProjects(projects);

    replaceRequirementMirror(
        project.id,
        data.requirements.map((r) => ({
            id: r.id,
            title: r.title,
            description: r.description,
            isRequired: r.isRequired,
        })),
    );

    return project;
}

/**
 * Overwrite the tf_requirements mirror for a project from an agreement version.
 * The version record itself is the source of truth; this is a derived cache.
 */
function replaceRequirementMirror(
    projectId: string,
    requirements: { id: string; title: string; description: string; isRequired: boolean }[],
): void {
    const others = getStoredRequirements().filter(
        (r) => r.projectId !== projectId,
    );
    for (const req of requirements) {
        others.push({
            id: req.id,
            projectId,
            title: req.title,
            description: req.description,
            isRequired: req.isRequired,
        });
    }
    saveStoredRequirements(others);
}

/**
 * Sync a project's execution fields to a newly agreed version.
 *
 * Called after a change proposal is accepted. The project never holds terms
 * that were not mutually agreed: this only ever copies an AgreementVersion.
 */
export function applyAgreedTerms(
    projectId: string,
    version: AgreementVersion,
): Project {
    const projects = getStoredProjects();
    const idx = projects.findIndex((p) => p.id === projectId);
    if (idx === -1) throw new Error("Project not found");

    projects[idx] = {
        ...projects[idx],
        title: version.title,
        description: version.description,
        budget: version.amount,
        currency: version.currency,
        deadline: version.deadline.toISOString(),
        updatedAt: new Date().toISOString(),
    };
    saveStoredProjects(projects);

    replaceRequirementMirror(projectId, version.requirements);

    return toProject(projects[idx]);
}

/**
 * Projects the user is a party to, newest activity first.
 * Replaces the old public/freelancer listings — there are no listings.
 */
export function getProjectsForUser(userId: string): Project[] {
    return getStoredProjects()
        .filter((p) => isProjectParticipant(toProject(p), userId))
        .map(toProject)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * Get a single project by ID. Returns null if not found.
 *
 * RAW READ — performs no authorization. Page and service code that serves a
 * user must use getProjectForUser() instead.
 */
export function getProjectById(id: string): Project | null {
    const stored = getStoredProjects().find((p) => p.id === id);
    return stored ? toProject(stored) : null;
}

/**
 * Authorized read: the project, but only if the caller is one of its two
 * parties. Returns null for anyone else — the existence of the project is
 * itself private, so no distinction is made between "missing" and "forbidden".
 */
export function getProjectForUser(
    id: string,
    userId: string | null | undefined,
): Project | null {
    const project = getProjectById(id);
    if (!project) return null;
    return isProjectParticipant(project, userId) ? project : null;
}

/**
 * The requirements that currently govern this project.
 *
 * Source of truth is the latest mutually agreed version. Falls back to the
 * stored mirror only for projects created before agreement versioning existed.
 */
export function getRequirementsByProjectId(projectId: string): Requirement[] {
    const version = getCurrentAgreementVersion(projectId);
    if (version) {
        return version.requirements.map((r) => ({
            id: r.id,
            projectId,
            title: r.title,
            description: r.description,
            isRequired: r.isRequired,
        }));
    }
    return getStoredRequirements().filter((r) => r.projectId === projectId);
}

/**
 * Transition a project to a new status.
 * Throws if the transition is not valid according to the state machine.
 */
export function transitionProject(
    projectId: string,
    newStatus: ProjectStatus,
): Project {
    const projects = getStoredProjects();
    const idx = projects.findIndex((p) => p.id === projectId);
    if (idx === -1) throw new Error("Project not found");

    const current = projects[idx];
    if (!isValidTransition(current.status, newStatus)) {
        throw new Error(
            `Invalid transition from ${current.status} to ${newStatus}`,
        );
    }

    projects[idx] = {
        ...current,
        status: newStatus,
        updatedAt: new Date().toISOString(),
    };
    saveStoredProjects(projects);
    return toProject(projects[idx]);
}

// Re-export state machine utilities for convenience
export { PROJECT_TRANSITIONS, isValidTransition } from "./state-machine";

// ─── Requirement helpers ──────────────────────────────────────

/**
 * Get the number of currently agreed requirements for a project.
 */
export function getRequirementCount(projectId: string): number {
    return getRequirementsByProjectId(projectId).length;
}
