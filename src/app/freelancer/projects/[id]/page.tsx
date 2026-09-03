"use client";

/**
 * Freelancer Project Details + Accept & Submission Flow
 *
 * Shows full project info, accept button, escrow status,
 * and deliverable submission form / submitted state.
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import {
    getProjectById,
    getRequirementsByProjectId,
    acceptProject,
} from "@/services/projects";
import { getPaymentByProjectId } from "@/services/payments";
import {
    getSubmissionByProjectId,
    createSubmission,
} from "@/services/submissions";
import { getVerificationByProjectId } from "@/services/verification";
import { VerificationReport } from "@/components/verification/VerificationReport";
import { getApprovalByProjectId } from "@/services/approval";
import { getAnyDisputeByProjectId } from "@/services/disputes";
import { getUserById } from "@/lib/auth";
import type {
    Project,
    Requirement,
    Payment,
    Submission,
    AIVerificationResult,
    Approval,
    Dispute,
    DisputeCategory,
    User,
} from "@/types";

const DISPUTE_LABELS: Record<DisputeCategory, string> = {
    missing_requirement: "Missing Requirement",
    incorrect_implementation: "Incorrect Implementation",
    does_not_match_agreement: "Does Not Match Agreement",
    other: "Other",
};

export default function FreelancerProjectPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const [resolvedParams, setResolvedParams] = useState<{ id: string } | null>(
        null,
    );

    useEffect(() => {
        params.then(setResolvedParams);
    }, [params]);

    if (!resolvedParams) {
        return (
            <main className="flex flex-1 items-center justify-center">
                <p className="text-sm text-zinc-500">Loading…</p>
            </main>
        );
    }

    return <ProjectDetails projectId={resolvedParams.id} />;
}

// ── Main component ────────────────────────────────────────────

function ProjectDetails({ projectId }: { projectId: string }) {
    const { user } = useAuth();

    const [project, setProject] = useState<Project | null>(null);
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [clientUser, setClientUser] = useState<User | null>(null);
    const [payment, setPayment] = useState<Payment | null>(null);
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [verification, setVerification] = useState<AIVerificationResult | null>(null);
    const [approval, setApproval] = useState<Approval | null>(null);
    const [dispute, setDispute] = useState<Dispute | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const [accepting, setAccepting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // ── Submission form state ────────────────────────────────
    const [subTitle, setSubTitle] = useState("");
    const [subDescription, setSubDescription] = useState("");
    const [subUrl, setSubUrl] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);

    // Load project data
    const loadData = useCallback(() => {
        const p = getProjectById(projectId);
        if (p) {
            setProject(p);
            setRequirements(getRequirementsByProjectId(p.id));
            setClientUser(getUserById(p.clientId));
            setPayment(getPaymentByProjectId(p.id));
            setSubmission(getSubmissionByProjectId(p.id));
            setVerification(getVerificationByProjectId(p.id));
            setApproval(getApprovalByProjectId(p.id));
            setDispute(getAnyDisputeByProjectId(p.id));
        }
    }, [projectId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Accept handler
    function handleAccept() {
        if (!user || !project) return;
        setAccepting(true);
        setError("");
        try {
            acceptProject(project.id, user.id);
            setSuccess("Project accepted! You are now assigned to this project.");
            setShowConfirm(false);
            loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to accept project.");
        } finally {
            setAccepting(false);
        }
    }

    // Submission handler
    function handleSubmitDeliverable(e: React.FormEvent) {
        e.preventDefault();
        if (!user || !project) return;
        setError("");

        // Validation
        if (!subTitle.trim()) {
            setError("Deliverable title is required.");
            return;
        }
        if (!subDescription.trim()) {
            setError("Deliverable description is required.");
            return;
        }
        if (subUrl.trim()) {
            try {
                new URL(subUrl.trim());
            } catch {
                setError("Please enter a valid URL (e.g. https://example.com).");
                return;
            }
        }

        setSubmitting(true);
        try {
            createSubmission({
                projectId: project.id,
                freelancerId: user.id,
                title: subTitle.trim(),
                description: subDescription.trim(),
                fileUrl: subUrl.trim() || undefined,
            });
            setSubmitSuccess(true);
            loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to submit deliverable.");
        } finally {
            setSubmitting(false);
        }
    }

    // ── Not found ──────────────────────────────────────────────

    if (!project) {
        return (
            <main className="flex flex-1 items-center justify-center">
                <div className="text-center">
                    <h2 className="text-lg font-semibold">Project not found</h2>
                    <Link
                        href="/freelancer/dashboard"
                        className="mt-2 text-sm text-blue-600 hover:underline"
                    >
                        Back to dashboard
                    </Link>
                </div>
            </main>
        );
    }

    // Derived state
    const canAccept =
        project.status === "CREATED" &&
        project.freelancerId === null &&
        user?.role === "freelancer";

    const paymentLocked = payment?.status === "locked";
    const paymentReleased = payment?.status === "released";
    const hasSubmitted = submission !== null;
    const canSubmit =
        project.freelancerId === user?.id &&
        paymentLocked &&
        !hasSubmitted;

    return (
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
            {/* Success banners */}
            {success && (
                <div className="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
                    {success}
                </div>
            )}
            {submitSuccess && (
                <div className="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
                    Deliverable submitted successfully! Awaiting AI verification.
                </div>
            )}

            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <Link
                        href="/freelancer/dashboard"
                        className="text-sm text-zinc-500 hover:text-zinc-700"
                    >
                        &larr; Dashboard
                    </Link>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight">
                        {project.title}
                    </h1>
                </div>
                <StatusBadge status={project.status} />
            </div>

            {/* Description */}
            <Card className="mt-6">
                <h2 className="text-sm font-medium text-zinc-500">Description</h2>
                <p className="mt-2 text-sm whitespace-pre-line">
                    {project.description}
                </p>
            </Card>

            {/* Details grid */}
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Card>
                    <h2 className="text-sm font-medium text-zinc-500">Payment</h2>
                    <p className="mt-1 text-lg font-semibold">
                        {project.currency} {project.budget.toLocaleString()}
                    </p>
                </Card>

                <Card>
                    <h2 className="text-sm font-medium text-zinc-500">Deadline</h2>
                    <p className="mt-1 text-lg font-semibold">
                        {project.deadline.toLocaleDateString()}
                    </p>
                </Card>

                <Card>
                    <h2 className="text-sm font-medium text-zinc-500">Client</h2>
                    <p className="mt-1 text-lg font-semibold">
                        {clientUser?.name ?? "Unknown"}
                    </p>
                </Card>
            </div>

            {/* Requirements */}
            <Card className="mt-4">
                <h2 className="text-sm font-medium text-zinc-500">
                    Requirements ({requirements.length})
                </h2>

                {requirements.length > 0 ? (
                    <ul className="mt-3 flex flex-col gap-2">
                        {requirements.map((req, idx) => (
                            <li
                                key={req.id}
                                className="flex items-start gap-3 rounded-md border border-zinc-200 px-3 py-2.5"
                            >
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-500">
                                    {idx + 1}
                                </span>
                                <div className="flex-1">
                                    <p className="text-sm">{req.title}</p>
                                    {req.description && (
                                        <p className="mt-0.5 text-xs text-zinc-500">
                                            {req.description}
                                        </p>
                                    )}
                                </div>
                                {req.isRequired && (
                                    <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-500">
                                        Required
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="mt-2 text-sm text-zinc-400">
                        No requirements listed.
                    </p>
                )}
            </Card>

            {/* ── Escrow Payment Section ────────────────────── */}
            {project.freelancerId && (
                <Card className="mt-4">
                    <h2 className="text-sm font-medium text-zinc-500">Escrow Payment</h2>

                    {paymentLocked ? (
                        <div className="mt-3">
                            <p className="text-sm font-medium text-amber-700">
                                &#128274; Payment Locked
                            </p>
                            <p className="mt-1 text-lg font-semibold">
                                {payment!.currency} {payment!.amount.toLocaleString()} secured for this project.
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                                You can now proceed with the deliverable.
                            </p>
                        </div>
                    ) : paymentReleased ? (
                        <div className="mt-3">
                            <p className="text-sm font-medium text-green-700">
                                &#127881; Payment Released
                            </p>
                            <p className="mt-1 text-lg font-semibold">
                                {payment!.currency} {payment!.amount.toLocaleString()}
                            </p>
                            {payment!.releasedAt && (
                                <p className="mt-1 text-xs text-zinc-400">
                                    Released {payment!.releasedAt.toLocaleString()}
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="mt-3">
                            <p className="text-sm text-zinc-400">
                                Waiting for client to lock payment.
                            </p>
                            <p className="mt-1 text-lg font-semibold">
                                {project.currency} {project.budget.toLocaleString()}
                            </p>
                        </div>
                    )}
                </Card>
            )}

            {/* ── Deliverable Submission Section ─────────────── */}
            {project.freelancerId === user?.id && (
                <>
                    {/* CASE: Already submitted */}
                    {hasSubmitted && (
                        <Card className="mt-4">
                            <h2 className="text-sm font-medium text-zinc-500">
                                Deliverable Submitted
                            </h2>
                            <div className="mt-3">
                                <p className="text-sm font-semibold">{submission!.title}</p>
                                <p className="mt-1 text-sm whitespace-pre-line text-zinc-600">
                                    {submission!.description}
                                </p>
                                {submission!.fileUrl && (
                                    <p className="mt-2 text-sm">
                                        URL:{" "}
                                        <a
                                            href={submission!.fileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline"
                                        >
                                            {submission!.fileUrl}
                                        </a>
                                    </p>
                                )}
                                <div className="mt-3 flex items-center gap-3 text-xs text-zinc-400">
                                    <span>
                                        Submitted{" "}
                                        {submission!.submittedAt.toLocaleString()}
                                    </span>
                                    {verification ? (
                                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-600">
                                            Verification Complete
                                        </span>
                                    ) : (
                                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                                            Awaiting AI Verification
                                        </span>
                                    )}
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* CASE: Verification report available */}
                    {verification && verification.status === "completed" && (
                        <div className="mt-4">
                            <VerificationReport result={verification} />
                        </div>
                    )}

                    {/* CASE: Can submit */}
                    {canSubmit && (
                        <Card className="mt-4">
                            <h2 className="text-sm font-medium text-zinc-500">
                                Submit Deliverable
                            </h2>

                            <form
                                onSubmit={handleSubmitDeliverable}
                                className="mt-3 flex flex-col gap-4"
                            >
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-sm font-medium">
                                        Deliverable Title
                                    </label>
                                    <input
                                        type="text"
                                        value={subTitle}
                                        onChange={(e) => {
                                            setSubTitle(e.target.value);
                                            setError("");
                                        }}
                                        className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        placeholder="e.g. Portfolio Website v1.0"
                                    />
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-sm font-medium">
                                        Description / Content
                                    </label>
                                    <textarea
                                        value={subDescription}
                                        onChange={(e) => {
                                            setSubDescription(e.target.value);
                                            setError("");
                                        }}
                                        rows={6}
                                        className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        placeholder="Describe what was delivered, how it meets the requirements, and any relevant details…"
                                    />
                                    <p className="text-xs text-zinc-400">
                                        This text will be used as evidence for AI verification
                                        against the project requirements.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-sm font-medium">
                                        URL{" "}
                                        <span className="font-normal text-zinc-400">
                                            (optional)
                                        </span>
                                    </label>
                                    <input
                                        type="url"
                                        value={subUrl}
                                        onChange={(e) => {
                                            setSubUrl(e.target.value);
                                            setError("");
                                        }}
                                        className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        placeholder="https://example.com/demo"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {submitting ? "Submitting…" : "Submit Deliverable"}
                                </button>
                            </form>
                        </Card>
                    )}

                    {/* CASE: Payment not yet locked */}
                    {project.freelancerId && !paymentLocked && !hasSubmitted && (
                        <Card className="mt-4">
                            <h2 className="text-sm font-medium text-zinc-500">
                                Deliverable Submission
                            </h2>
                            <p className="mt-2 text-sm text-zinc-400">
                                Deliverable submission will be available after the
                                client locks the payment.
                            </p>
                        </Card>
                    )}
                </>
            )}

            {/* ── Approved state (freelancer view) ─────────── */}
            {project.status === "APPROVED" && (
                <Card className="mt-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">&#10003;</span>
                        <h2 className="text-sm font-medium text-green-700">
                            Deliverable Approved
                        </h2>
                    </div>
                    <p className="mt-2 text-sm text-zinc-600">
                        Your deliverable has been approved. Payment is ready
                        for release.
                    </p>
                    {approval && (
                        <p className="mt-2 text-xs text-zinc-400">
                            Approved {approval.approvedAt.toLocaleString()}
                        </p>
                    )}
                </Card>
            )}

            {/* ── Disputed state (freelancer view) ─────────── */}
            {project.status === "DISPUTED" && dispute && (
                <Card className="mt-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">&#9888;</span>
                        <h2 className="text-sm font-medium text-amber-700">
                            Deliverable Disputed
                        </h2>
                    </div>
                    <div className="mt-3">
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                            <p className="text-xs font-medium text-amber-600">
                                {DISPUTE_LABELS[dispute.category]}
                            </p>
                            <p className="mt-1 text-sm text-zinc-700">
                                {dispute.reason}
                            </p>
                        </div>
                        <p className="mt-3 text-sm text-zinc-500">
                            Payment remains locked while this dispute is under
                            review.
                        </p>
                        <p className="mt-1 text-xs text-zinc-400">
                            Submitted {dispute.createdAt.toLocaleString()}
                        </p>
                    </div>
                </Card>
            )}

            {/* ── Completed state (freelancer view) ─────────── */}
            {project.status === "COMPLETED" && (
                <Card className="mt-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">&#127881;</span>
                        <h2 className="text-sm font-medium text-green-700">
                            Payment Released
                        </h2>
                    </div>
                    <div className="mt-3">
                        <p className="text-sm text-zinc-600">
                            Your payment has been released by the client.
                        </p>
                        {payment && payment.status === "released" && (
                            <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-4 py-3">
                                <p className="text-lg font-semibold text-green-700">
                                    {payment.currency}{" "}
                                    {payment.amount.toLocaleString()}
                                </p>
                                <p className="mt-1 text-xs text-green-600">
                                    Status: RELEASED
                                </p>
                                {payment.releasedAt && (
                                    <p className="mt-1 text-xs text-zinc-500">
                                        Released{" "}
                                        {payment.releasedAt.toLocaleString()}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </Card>
            )}

            {/* Meta */}
            <div className="mt-4 flex gap-6 text-xs text-zinc-400">
                <span>Created {project.createdAt.toLocaleDateString()}</span>
                {project.freelancerId && <span>Assigned to you</span>}
            </div>

            {/* Accept button */}
            {canAccept && (
                <div className="mt-8">
                    <button
                        onClick={() => setShowConfirm(true)}
                        className="rounded-md bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                    >
                        Accept Project
                    </button>
                </div>
            )}

            {/* Error */}
            {error && (
                <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                    {error}
                </p>
            )}

            {/* Confirmation modal */}
            <Modal
                open={showConfirm}
                onClose={() => setShowConfirm(false)}
                title="Accept this project?"
            >
                <p className="text-sm text-zinc-600">
                    By accepting, you commit to working on{" "}
                    <strong>{project.title}</strong> for{" "}
                    <strong>
                        {project.currency} {project.budget.toLocaleString()}
                    </strong>{" "}
                    with a deadline of{" "}
                    <strong>{project.deadline.toLocaleDateString()}</strong>.
                </p>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        onClick={() => setShowConfirm(false)}
                        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleAccept}
                        disabled={accepting}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                        {accepting ? "Accepting…" : "Confirm & Accept"}
                    </button>
                </div>
            </Modal>
        </main>
    );
}
