/**
 * Freelancer-Client Trust Platform — Core Type Definitions
 *
 * These types represent the database entities and domain models
 * that will be fully implemented later.
 */

// ─── User Roles ───────────────────────────────────────────────

export type UserRole = "client" | "freelancer" | "admin";

// ─── Project States (State Machine) ──────────────────────────

export type ProjectStatus =
    | "CREATED"
    | "FREELANCER_ACCEPTED"
    | "PAYMENT_LOCKED"
    | "IN_PROGRESS"
    | "SUBMITTED"
    | "AI_VERIFICATION"
    | "CLIENT_REVIEW"
    | "REVISION_REQUIRED"
    | "DISPUTED"
    | "APPROVED"
    | "PAYMENT_RELEASED"
    | "FINAL_DELIVERY_RELEASED"
    | "COMPLETED";

// ─── Core Entities (placeholder shapes) ──────────────────────

export interface User {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    createdAt: Date;
}

export interface Project {
    id: string;
    title: string;
    description: string;
    status: ProjectStatus;
    budget: number;
    currency: string;
    deadline: Date;
    clientId: string;
    freelancerId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface Requirement {
    id: string;
    projectId: string;
    title: string;
    description: string;
    isRequired: boolean;
}

export interface Payment {
    id: string;
    projectId: string;
    amount: number;
    currency: string;
    status: "pending" | "locked" | "released" | "refunded";
    createdAt: Date;
    lockedAt: Date | null;
    releasedAt: Date | null;
}

export interface Submission {
    id: string;
    projectId: string;
    freelancerId: string;
    title: string;
    description: string;
    fileUrl: string | null;
    status: "submitted" | "under_review" | "approved" | "revision_requested";
    submittedAt: Date;
}

// ─── Requirement-level verification status ──────────────────

export type RequirementStatus = "VERIFIED" | "UNCLEAR" | "MISSING";

export interface RequirementResult {
    requirementId: string;
    requirementText: string;
    status: RequirementStatus;
    explanation: string;
    confidence: number;
}

// ─── AI Verification Result ─────────────────────────────────

export type VerificationStatus = "pending" | "completed" | "failed";

export interface AIVerificationResult {
    id: string;
    projectId: string;
    submissionId: string;
    overallScore: number;
    summary: string;
    requirementResults: RequirementResult[];
    status: VerificationStatus;
    createdAt: Date;
}

export interface Approval {
    id: string;
    projectId: string;
    approvedBy: string;
    approvedAt: Date;
    notes: string | null;
}

export type DisputeCategory =
    | "missing_requirement"
    | "incorrect_implementation"
    | "does_not_match_agreement"
    | "other";

export interface Dispute {
    id: string;
    projectId: string;
    submissionId: string;
    raisedBy: string;
    reason: string;
    category: DisputeCategory;
    status: "open" | "under_review" | "resolved";
    createdAt: Date;
}

export interface AuditLog {
    id: string;
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    details: string;
    createdAt: Date;
}
