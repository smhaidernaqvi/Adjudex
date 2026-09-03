"use client";

/**
 * Client Project Details
 *
 * Displays full project information: title, description, budget,
 * deadline, requirements checklist, status, and escrow payment section.
 */

import { useEffect, useState, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { PaymentStatus } from "@/components/payment/PaymentStatus";
import {
    getProjectById,
    getRequirementsByProjectId,
} from "@/services/projects";
import {
    getPaymentByProjectId,
    createPayment,
    lockPayment,
    releasePayment,
} from "@/services/payments";
import { getUserById } from "@/lib/auth";
import { getSubmissionByProjectId } from "@/services/submissions";
import {
    getVerificationByProjectId,
    runVerification,
    isVerificationAvailable,
    clearFailedVerification,
} from "@/services/verification";
import { VerificationReport } from "@/components/verification/VerificationReport";
import { approveDeliverable, getApprovalByProjectId } from "@/services/approval";
import {
    createDispute,
    getAnyDisputeByProjectId,
} from "@/services/disputes";
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

const DISPUTE_CATEGORY_LABELS: Record<DisputeCategory, string> = {
    missing_requirement: "Missing Requirement",
    incorrect_implementation: "Incorrect Implementation",
    does_not_match_agreement: "Does Not Match Agreement",
    other: "Other",
};

function disputeCategoryLabel(cat: DisputeCategory): string {
    return DISPUTE_CATEGORY_LABELS[cat] ?? cat;
}

function ProjectDetails({ params }: { params: { id: string } }) {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const justCreated = searchParams.get("created") === "1";

    const [project, setProject] = useState<Project | null>(null);
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [freelancerUser, setFreelancerUser] = useState<User | null>(null);
    const [payment, setPayment] = useState<Payment | null>(null);
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [verification, setVerification] = useState<AIVerificationResult | null>(null);
    const [approval, setApproval] = useState<Approval | null>(null);
    const [dispute, setDispute] = useState<Dispute | null>(null);
    const [showLockModal, setShowLockModal] = useState(false);
    const [locking, setLocking] = useState(false);
    const [lockError, setLockError] = useState("");
    const [lockSuccess, setLockSuccess] = useState(false);

    // ── Verification state ────────────────────────────────────
    const [verifying, setVerifying] = useState(false);
    const [verifyError, setVerifyError] = useState("");
    const aiConfigured = isVerificationAvailable();

    // ── Review state ──────────────────────────────────────────
    const [showApproveModal, setShowApproveModal] = useState(false);
    const [showDisputeModal, setShowDisputeModal] = useState(false);
    const [approving, setApproving] = useState(false);
    const [disputing, setDisputing] = useState(false);
    const [reviewError, setReviewError] = useState("");
    const [approveSuccess, setApproveSuccess] = useState(false);
    const [disputeSuccess, setDisputeSuccess] = useState(false);
    const [disputeReason, setDisputeReason] = useState("");
    const [disputeCategory, setDisputeCategory] = useState<DisputeCategory>("other");

    // ── Release payment state ─────────────────────────────────
    const [showReleaseModal, setShowReleaseModal] = useState(false);
    const [releasing, setReleasing] = useState(false);
    const [releaseError, setReleaseError] = useState("");
    const [releaseSuccess, setReleaseSuccess] = useState(false);

    // Load data
    const loadData = useCallback(() => {
        const p = getProjectById(params.id);
        if (p) {
            setProject(p);
            setRequirements(getRequirementsByProjectId(p.id));
            if (p.freelancerId) {
                setFreelancerUser(getUserById(p.freelancerId));
            }
            setPayment(getPaymentByProjectId(p.id));
            setSubmission(getSubmissionByProjectId(p.id));
            setVerification(getVerificationByProjectId(p.id));
            setApproval(getApprovalByProjectId(p.id));
            setDispute(getAnyDisputeByProjectId(p.id));
        }
    }, [params.id]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Lock payment handler
    function handleLockPayment() {
        if (!user || !project) return;
        setLocking(true);
        setLockError("");

        try {
            // Create payment if it doesn't exist yet
            if (!payment) {
                createPayment(project.id, user.id);
            }
            // Lock it
            lockPayment(project.id, user.id);
            setLockSuccess(true);
            setShowLockModal(false);
            loadData();
        } catch (err) {
            setLockError(err instanceof Error ? err.message : "Failed to lock payment.");
        } finally {
            setLocking(false);
        }
    }

    // ── Derived state ─────────────────────────────────────────

    const freelancerAccepted = project?.status === "FREELANCER_ACCEPTED";
    const canLockPayment =
        freelancerAccepted &&
        (!payment || payment.status === "pending") &&
        user?.role === "client";
    const isPaymentLocked = payment?.status === "locked";

    // Verification readiness: project is SUBMITTED, submission exists, no verification yet
    const canVerify =
        project?.status === "SUBMITTED" &&
        submission !== null &&
        verification === null &&
        user?.role === "client";

    // Review readiness: project is CLIENT_REVIEW, client is logged in
    const isClientReview = project?.status === "CLIENT_REVIEW";
    const isApproved = project?.status === "APPROVED";
    const isDisputed = project?.status === "DISPUTED";
    const isCompleted = project?.status === "COMPLETED";

    // Can release: project approved + payment locked + user is client
    const canReleasePayment =
        isApproved &&
        payment?.status === "locked" &&
        user?.role === "client";

    // Handle AI verification
    async function handleVerify() {
        if (!project) return;
        setVerifying(true);
        setVerifyError("");

        try {
            clearFailedVerification(project.id);
            const result = await runVerification(project.id);
            setVerification(result);
            loadData();
        } catch (err) {
            setVerifyError(
                err instanceof Error ? err.message : "Verification failed.",
            );
        } finally {
            setVerifying(false);
        }
    }

    // Handle approve
    function handleApprove() {
        if (!user || !project) return;
        setApproving(true);
        setReviewError("");

        try {
            approveDeliverable(project.id, user.id);
            setApproveSuccess(true);
            setShowApproveModal(false);
            loadData();
        } catch (err) {
            setReviewError(
                err instanceof Error ? err.message : "Failed to approve.",
            );
        } finally {
            setApproving(false);
        }
    }

    // Handle dispute
    function handleDispute() {
        if (!user || !project) return;
        setReviewError("");

        if (!disputeReason.trim()) {
            setReviewError("Please provide a reason for the dispute.");
            return;
        }

        setDisputing(true);

        try {
            createDispute({
                projectId: project.id,
                clientId: user.id,
                reason: disputeReason,
                category: disputeCategory,
            });
            setDisputeSuccess(true);
            setShowDisputeModal(false);
            loadData();
        } catch (err) {
            setReviewError(
                err instanceof Error ? err.message : "Failed to submit dispute.",
            );
        } finally {
            setDisputing(false);
        }
    }

    // Handle release payment
    function handleReleasePayment() {
        if (!user || !project) return;
        setReleasing(true);
        setReleaseError("");

        try {
            releasePayment(project.id, user.id);
            setReleaseSuccess(true);
            setShowReleaseModal(false);
            loadData();
        } catch (err) {
            setReleaseError(
                err instanceof Error ? err.message : "Failed to release payment.",
            );
        } finally {
            setReleasing(false);
        }
    }

    // ── Not found ─────────────────────────────────────────────

    if (!project) {
        return (
            <main className="flex flex-1 items-center justify-center">
                <div className="text-center">
                    <h2 className="text-lg font-semibold">Project not found</h2>
                    <Link
                        href="/client/dashboard"
                        className="mt-2 text-sm text-blue-600 hover:underline"
                    >
                        Back to dashboard
                    </Link>
                </div>
            </main>
        );
    }
    return (
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
            {/* Success banners */}
            {justCreated && (
                <div className="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
                    Project created successfully!
                </div>
            )}
            {lockSuccess && (
                <div className="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
                    &#128274; Payment locked successfully! The funds are now held in escrow.
                </div>
            )}
            {approveSuccess && (
                <div className="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
                    Deliverable approved successfully. Payment is ready for release.
                </div>
            )}
            {disputeSuccess && (
                <div className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    Dispute submitted. Payment remains locked while under review.
                </div>
            )}
            {releaseSuccess && (
                <div className="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
                    &#127881; Payment released successfully! The transaction is
                    now complete.
                </div>
            )}

            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <Link
                        href="/client/dashboard"
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
                <p className="mt-2 text-sm whitespace-pre-line">{project.description}</p>
            </Card>

            {/* Details grid */}
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Card>
                    <h2 className="text-sm font-medium text-zinc-500">Budget</h2>
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
                    <h2 className="text-sm font-medium text-zinc-500">Freelancer</h2>
                    {project.freelancerId ? (
                        <div className="mt-1">
                            <p className="text-lg font-semibold">
                                {freelancerUser?.name ?? "Assigned"}
                            </p>
                            <p className="text-xs capitalize text-zinc-400">
                                {freelancerUser?.role ?? "freelancer"}
                            </p>
                        </div>
                    ) : (
                        <p className="mt-1 text-sm text-zinc-400">
                            Waiting for freelancer
                        </p>
                    )}
                </Card>
            </div>

            {/* ── Escrow Payment Section ──────────────────────── */}
            <Card className="mt-4">
                <h2 className="text-sm font-medium text-zinc-500">Escrow Payment</h2>

                {/* CASE 1: Waiting for freelancer */}
                {project.status === "CREATED" && (
                    <div className="mt-3">
                        <p className="text-sm text-zinc-400">
                            Waiting for freelancer to accept this project.
                        </p>
                    </div>
                )}

                {/* CASE 2: Freelancer accepted, payment pending */}
                {freelancerAccepted && !isPaymentLocked && (
                    <div className="mt-3">
                        <PaymentStatus
                            payment={payment}
                            projectBudget={project.budget}
                            projectCurrency={project.currency}
                        />

                        {canLockPayment && (
                            <div className="mt-4">
                                <button
                                    onClick={() => setShowLockModal(true)}
                                    className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                                >
                                    Lock Payment
                                </button>
                                <p className="mt-2 text-xs text-zinc-400">
                                    This is a simulated escrow payment for the hackathon
                                    demo. No real money is transferred.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* CASE 3: Payment locked */}
                {isPaymentLocked && (
                    <div className="mt-3">
                        <PaymentStatus
                            payment={payment}
                            projectBudget={project.budget}
                            projectCurrency={project.currency}
                        />
                    </div>
                )}

                {/* Fallback for other statuses that don't need payment UI */}
                {!project.status.startsWith("CREATED") &&
                    !freelancerAccepted &&
                    !isPaymentLocked &&
                    payment && (
                        <div className="mt-3">
                            <PaymentStatus
                                payment={payment}
                                projectBudget={project.budget}
                                projectCurrency={project.currency}
                            />
                        </div>
                    )}
            </Card>

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
                    <p className="mt-2 text-sm text-zinc-400">No requirements listed.</p>
                )}
            </Card>

            {/* ── Deliverable Submission Section ─────────────── */}
            {submission && (
                <Card className="mt-4">
                    <h2 className="text-sm font-medium text-zinc-500">
                        Deliverable Submitted
                    </h2>
                    <div className="mt-3">
                        <p className="text-sm font-semibold">{submission.title}</p>
                        <p className="mt-1 text-sm whitespace-pre-line text-zinc-600">
                            {submission.description}
                        </p>
                        {submission.fileUrl && (
                            <p className="mt-2 text-sm">
                                URL:{" "}
                                <a
                                    href={submission.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline"
                                >
                                    {submission.fileUrl}
                                </a>
                            </p>
                        )}
                        <div className="mt-3 flex items-center gap-3 text-xs text-zinc-400">
                            <span>
                                Submitted {submission.submittedAt.toLocaleString()}
                            </span>
                        </div>
                    </div>
                </Card>
            )}

            {/* ── AI Verification Section ─────────────────────── */}
            {submission && (
                <Card className="mt-4">
                    <h2 className="text-sm font-medium text-zinc-500">
                        AI Verification
                    </h2>

                    {/* CASE: Verification completed */}
                    {verification && verification.status === "completed" && (
                        <div className="mt-3">
                            <VerificationReport result={verification} />
                        </div>
                    )}

                    {/* CASE: Verification running */}
                    {verifying && (
                        <div className="mt-3">
                            <div className="flex items-center gap-3">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                                <p className="text-sm text-zinc-600">
                                    AI is analyzing the deliverable against project
                                    requirements…
                                </p>
                            </div>
                        </div>
                    )}

                    {/* CASE: Ready to verify (button) */}
                    {canVerify && !verifying && (
                        <div className="mt-3">
                            <p className="text-sm text-zinc-600">
                                Deliverable submitted. Ready for AI verification.
                            </p>
                            {aiConfigured ? (
                                <button
                                    onClick={handleVerify}
                                    className="mt-3 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                                >
                                    Run AI Verification
                                </button>
                            ) : (
                                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                                    <p className="text-sm text-amber-700">
                                        AI verification is not configured yet.
                                    </p>
                                    <p className="mt-1 text-xs text-amber-600">
                                        Add <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_AI_API_KEY</code>{" "}
                                        to your <code className="rounded bg-amber-100 px-1">.env.local</code> file to enable
                                        AI-powered deliverable verification.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* CASE: Project past SUBMITTED but no verification (edge case) */}
                    {(project.status === "AI_VERIFICATION" ||
                        project.status === "CLIENT_REVIEW") &&
                        !verification && (
                            <div className="mt-3">
                                <p className="text-sm text-zinc-400">
                                    Verification data not found. The project has already
                                    moved past the SUBMITTED state.
                                </p>
                            </div>
                        )}
                </Card>
            )}

            {/* ── Client Review Section ───────────────────────── */}
            {isClientReview && user?.role === "client" && (
                <Card className="mt-4">
                    <h2 className="text-sm font-medium text-zinc-500">
                        Review Deliverable
                    </h2>
                    <p className="mt-2 text-sm text-zinc-600">
                        Review the requirements, submitted deliverable, and AI
                        verification report above. Then approve or dispute the
                        deliverable.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                        <button
                            onClick={() => setShowApproveModal(true)}
                            className="rounded-md bg-green-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
                        >
                            &#10003; Approve Deliverable
                        </button>
                        <button
                            onClick={() => setShowDisputeModal(true)}
                            className="rounded-md border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
                        >
                            &#9888; Dispute / Request Review
                        </button>
                    </div>
                </Card>
            )}

            {/* ── Approved state ────────────────────────────────── */}
            {isApproved && (
                <Card className="mt-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">&#10003;</span>
                        <h2 className="text-sm font-medium text-green-700">
                            Deliverable Approved
                        </h2>
                    </div>
                    <p className="mt-2 text-sm text-zinc-600">
                        Payment is secured and ready to be released to the
                        freelancer.
                    </p>
                    {approval && (
                        <p className="mt-2 text-xs text-zinc-400">
                            Approved {approval.approvedAt.toLocaleString()}
                        </p>
                    )}
                    {canReleasePayment && (
                        <button
                            onClick={() => setShowReleaseModal(true)}
                            className="mt-4 rounded-md bg-green-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
                        >
                            Release Payment
                        </button>
                    )}
                </Card>
            )}

            {/* ── Completed state ───────────────────────────────── */}
            {isCompleted && (
                <Card className="mt-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">&#127881;</span>
                        <h2 className="text-sm font-medium text-green-700">
                            Transaction Completed
                        </h2>
                    </div>
                    <div className="mt-3">
                        <p className="text-sm text-zinc-600">
                            Payment has been released to the freelancer.
                        </p>
                        {payment && (
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

            {/* ── Disputed state ────────────────────────────────── */}
            {isDisputed && dispute && (
                <Card className="mt-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">&#9888;</span>
                        <h2 className="text-sm font-medium text-amber-700">
                            Dispute Submitted
                        </h2>
                    </div>
                    <div className="mt-3">
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                            <p className="text-xs font-medium text-amber-600">
                                {disputeCategoryLabel(dispute.category)}
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

            {/* Meta info */}
            <div className="mt-4 flex gap-6 text-xs text-zinc-400">
                <span>Created {project.createdAt.toLocaleDateString()}</span>
                <span>Client: {user?.name}</span>
            </div>

            {/* Lock error */}
            {lockError && (
                <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                    {lockError}
                </p>
            )}

            {/* Verify error */}
            {verifyError && (
                <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                    {verifyError}
                </div>
            )}

            {/* Review error */}
            {reviewError && (
                <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                    {reviewError}
                </div>
            )}

            {/* Release error */}
            {releaseError && (
                <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                    {releaseError}
                </div>
            )}

            {/* Lock confirmation modal */}
            <Modal
                open={showLockModal}
                onClose={() => setShowLockModal(false)}
                title="Lock Payment?"
            >
                <p className="text-sm text-zinc-600">
                    Lock{" "}
                    <strong>
                        {project.currency} {project.budget.toLocaleString()}
                    </strong>{" "}
                    for <strong>{project.title}</strong>?
                </p>
                <p className="mt-2 text-sm text-zinc-500">
                    This is a simulated escrow payment for the hackathon demo. The
                    payment will remain locked until the work is approved. No real
                    money is transferred.
                </p>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        onClick={() => setShowLockModal(false)}
                        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleLockPayment}
                        disabled={locking}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                        {locking ? "Locking…" : "Confirm & Lock Payment"}
                    </button>
                </div>
            </Modal>

            {/* Approve confirmation modal */}
            <Modal
                open={showApproveModal}
                onClose={() => setShowApproveModal(false)}
                title="Approve Deliverable?"
            >
                <p className="text-sm text-zinc-600">
                    By approving this deliverable, you confirm that the work
                    satisfies the agreed requirements. The payment will be released
                    in the next step.
                </p>
                <p className="mt-2 text-sm text-zinc-500">
                    Project: <strong>{project.title}</strong>
                </p>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        onClick={() => setShowApproveModal(false)}
                        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleApprove}
                        disabled={approving}
                        className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                    >
                        {approving ? "Approving…" : "Approve Deliverable"}
                    </button>
                </div>
            </Modal>

            {/* Dispute modal */}
            <Modal
                open={showDisputeModal}
                onClose={() => setShowDisputeModal(false)}
                title="Dispute Deliverable"
            >
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium">Category</label>
                        <select
                            value={disputeCategory}
                            onChange={(e) =>
                                setDisputeCategory(
                                    e.target.value as DisputeCategory,
                                )
                            }
                            className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        >
                            <option value="missing_requirement">
                                Missing requirement
                            </option>
                            <option value="incorrect_implementation">
                                Incorrect implementation
                            </option>
                            <option value="does_not_match_agreement">
                                Does not match agreement
                            </option>
                            <option value="other">Other</option>
                        </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium">Reason</label>
                        <textarea
                            value={disputeReason}
                            onChange={(e) => {
                                setDisputeReason(e.target.value);
                                setReviewError("");
                            }}
                            rows={4}
                            placeholder="Explain why you believe the deliverable does not satisfy the agreed requirements…"
                            className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        onClick={() => setShowDisputeModal(false)}
                        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleDispute}
                        disabled={disputing}
                        className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                    >
                        {disputing ? "Submitting…" : "Submit Dispute"}
                    </button>
                </div>
            </Modal>

            {/* Release payment confirmation modal */}
            <Modal
                open={showReleaseModal}
                onClose={() => setShowReleaseModal(false)}
                title="Release Payment?"
            >
                <p className="text-sm text-zinc-600">
                    You are about to release{" "}
                    <strong>
                        {project.currency}{" "}
                        {project.budget.toLocaleString()}
                    </strong>{" "}
                    to the freelancer. This action completes the transaction.
                </p>
                <p className="mt-2 text-sm text-zinc-500">
                    This is a simulated hackathon payment. No real money moves.
                </p>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        onClick={() => setShowReleaseModal(false)}
                        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleReleasePayment}
                        disabled={releasing}
                        className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                    >
                        {releasing ? "Releasing…" : "Release Payment"}
                    </button>
                </div>
            </Modal>
        </main>
    );
}

/**
 * Suspense wrapper — required because useSearchParams() needs a boundary.
 */
function ProjectDetailsWrapper({
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

    return (
        <Suspense
            fallback={
                <main className="flex flex-1 items-center justify-center">
                    <p className="text-sm text-zinc-500">Loading…</p>
                </main>
            }
        >
            <ProjectDetails params={resolvedParams} />
        </Suspense>
    );
}

export default function ClientProjectPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    return <ProjectDetailsWrapper params={params} />;
}
