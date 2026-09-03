/**
 * SubmissionCard — Displays a submission summary
 */

import { Card } from "@/components/ui/Card";
import type { Submission } from "@/types";

interface SubmissionCardProps {
  submission: Submission;
}

export function SubmissionCard({ submission }: SubmissionCardProps) {
  return (
    <Card>
      <p className="text-sm font-medium">Submission</p>
      <p className="mt-1 text-sm text-zinc-500">{submission.description}</p>
      <p className="mt-1 text-xs text-zinc-400">
        Submitted: {submission.submittedAt.toLocaleDateString()}
      </p>
    </Card>
  );
}
