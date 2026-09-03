/**
 * Project Service
 *
 * Business logic for project CRUD operations.
 * Persists data to localStorage for the hackathon MVP (migrate to DB later).
 *
 * State machine transitions are defined in ./state-machine.ts
 */

import type { Project, ProjectStatus, Requirement } from "@/types";
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
 * Create a new project with its requirements.
 * Returns the created project.
 */
export function createProject(data: {
    title: string;
    description: string;
    budget: number;
    currency: string;
    deadline: Date;
    clientId: string;
    requirements: { title: string; description?: string; isRequired: boolean }[];
}): Project {
    const now = new Date();

    const project: Project = {
        id: crypto.randomUUID(),
        title: data.title,
        description: data.description,
        status: "CREATED",
        budget: data.budget,
        currency: data.currency,
        deadline: data.deadline,
        clientId: data.clientId,
        freelancerId: null,
        createdAt: now,
        updatedAt: now,
    };

    // Persist project
    const projects = getStoredProjects();
    projects.push(toStored(project));
    saveStoredProjects(projects);

    // Persist requirements
    const allReqs = getStoredRequirements();
    for (const req of data.requirements) {
        allReqs.push({
            id: crypto.randomUUID(),
            projectId: project.id,
            title: req.title,
            description: req.description ?? "",
            isRequired: req.isRequired,
        });
    }
    saveStoredRequirements(allReqs);

    return project;
}

/**
 * Get all projects created by a specific client.
 */
export function getProjectsByClientId(clientId: string): Project[] {
    return getStoredProjects()
        .filter((p) => p.clientId === clientId)
        .map(toProject)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Get a single project by ID. Returns null if not found.
 */
export function getProjectById(id: string): Project | null {
    const stored = getStoredProjects().find((p) => p.id === id);
    return stored ? toProject(stored) : null;
}

/**
 * Get all requirements for a project.
 */
export function getRequirementsByProjectId(projectId: string): Requirement[] {
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

// ─── Freelancer helpers ───────────────────────────────────────

/**
 * Get all projects available for freelancers to accept.
 * (status = CREATED, no freelancer assigned yet)
 */
export function getAvailableProjects(): Project[] {
    return getStoredProjects()
        .filter((p) => p.status === "CREATED" && p.freelancerId === null)
        .map(toProject)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Get all projects accepted by a specific freelancer.
 */
export function getProjectsByFreelancerId(freelancerId: string): Project[] {
    return getStoredProjects()
        .filter((p) => p.freelancerId === freelancerId)
        .map(toProject)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * Get the number of requirements for a project.
 */
export function getRequirementCount(projectId: string): number {
    return getStoredRequirements().filter((r) => r.projectId === projectId).length;
}

/**
 * Freelancer accepts a project.
 * Validates state + assignment, then transitions CREATED → FREELANCER_ACCEPTED.
 */
export function acceptProject(
    projectId: string,
    freelancerId: string,
): Project {
    const projects = getStoredProjects();
    const idx = projects.findIndex((p) => p.id === projectId);
    if (idx === -1) throw new Error("Project not found");

    const current = projects[idx];
    if (current.freelancerId !== null) {
        throw new Error("This project has already been assigned to a freelancer.");
    }
    if (!isValidTransition(current.status, "FREELANCER_ACCEPTED")) {
        throw new Error(
            `Cannot accept project in status ${current.status}.`,
        );
    }

    projects[idx] = {
        ...current,
        status: "FREELANCER_ACCEPTED",
        freelancerId,
        updatedAt: new Date().toISOString(),
    };
    saveStoredProjects(projects);
    return toProject(projects[idx]);
}
