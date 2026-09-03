/**
 * VerificationReport — Displays AI verification results
 *
 * Shows overall score, summary, and per-requirement status
 * with color-coded badges and confidence indicators.
 */

import { Card } from "@/components/ui/Card";
import type { AIVerificationResult } from "@/types";

interface VerificationReportProps {
  result: AIVerificationResult;
}

export function VerificationReport({ result }: VerificationReportProps) {
  const scoreColor =
    result.overallScore >= 80
      ? "text-green-600"
      : result.overallScore >= 50
        ? "text-amber-600"
        : "text-red-600";

  const scoreBg =
    result.overallScore >= 80
      ? "bg-green-50 border-green-200"
      : result.overallScore >= 50
        ? "bg-amber-50 border-amber-200"
        : "bg-red-50 border-red-200";

  return (
    <Card>
      <h2 className="text-sm font-medium text-zinc-500">
        AI Verification Report
      </h2>

      {/* Overall Score */}
      <div
        className={`mt-3 flex items-center gap-4 rounded-lg border px-4 py-3 ${scoreBg}`}
      >
        <div>
          <p className={`text-3xl font-bold ${scoreColor}`}>
            {result.overallScore}%
          </p>
          <p className="text-xs text-zinc-500">Overall Score</p>
        </div>
        <div className="flex-1 border-l border-zinc-200 pl-4">
          <p className="text-sm text-zinc-600">{result.summary}</p>
        </div>
      </div>

      {/* Requirement Results */}
      {result.requirementResults.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {result.requirementResults.map((req) => (
            <li
              key={req.requirementId}
              className="rounded-md border border-zinc-200 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {req.requirementText}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {req.explanation}
                  </p>
                </div>
                <RequirementBadge status={req.status} />
              </div>
              <p className="mt-1.5 text-xs text-zinc-400">
                Confidence: {Math.round(req.confidence * 100)}%
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* Timestamp */}
      <p className="mt-4 text-xs text-zinc-400">
        Verified {result.createdAt.toLocaleString()}
      </p>
    </Card>
  );
}

// ── Sub-components ────────────────────────────────────────────

function RequirementBadge({
  status,
}: {
  status: "VERIFIED" | "UNCLEAR" | "MISSING";
}) {
  const config = {
    VERIFIED: {
      icon: "\u2713",
      label: "Verified",
      className: "bg-green-50 text-green-700 border-green-200",
    },
    UNCLEAR: {
      icon: "\u26A0",
      label: "Unclear",
      className: "bg-amber-50 text-amber-700 border-amber-200",
    },
    MISSING: {
      icon: "\u2717",
      label: "Missing",
      className: "bg-red-50 text-red-700 border-red-200",
    },
  };

  const c = config[status];

  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${c.className}`}
    >
      <span>{c.icon}</span>
      {c.label}
    </span>
  );
}
