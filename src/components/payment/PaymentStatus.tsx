"use client";

/**
 * PaymentStatus — Displays payment/escrow status for a project.
 *
 * Shows the amount, currency, payment status badge, locked timestamp,
 * and a contextual explanation message.
 */

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { Payment } from "@/types";

interface PaymentStatusProps {
  payment: Payment | null;
  projectBudget: number;
  projectCurrency: string;
}

export function PaymentStatus({
  payment,
  projectBudget,
  projectCurrency,
}: PaymentStatusProps) {
  // No payment exists yet
  if (!payment) {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Escrow Payment</span>
          <Badge variant="default">No payment</Badge>
        </div>
        <p className="mt-2 text-lg font-semibold">
          {projectCurrency} {projectBudget.toLocaleString()}
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          Payment will be created when the client initiates the lock.
        </p>
      </Card>
    );
  }

  const isLocked = payment.status === "locked";
  const isReleased = payment.status === "released";

  const variant =
    isReleased
      ? "success"
      : isLocked
        ? "warning"
        : "default";

  const statusLabel =
    isLocked
      ? "Locked"
      : isReleased
        ? "Released"
        : payment.status === "refunded"
          ? "Refunded"
          : "Pending";

  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {isLocked ? "Escrow Payment" : "Escrow Payment"}
        </span>
        <Badge variant={variant}>{statusLabel}</Badge>
      </div>

      <p className="mt-2 text-lg font-semibold">
        {payment.currency} {payment.amount.toLocaleString()}
      </p>

      {/* Status-specific message */}
      {payment.status === "pending" && (
        <p className="mt-2 text-xs text-zinc-500">
          Your payment will be held securely until the work is completed and
          approved.
        </p>
      )}

      {isLocked && (
        <div className="mt-2">
          <p className="text-xs font-medium text-amber-700">
            &#128274; Payment secured
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Payment will be released after the deliverable is verified and
            approved.
          </p>
          {payment.lockedAt && (
            <p className="mt-1 text-xs text-zinc-400">
              Locked on {payment.lockedAt.toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {isReleased && payment.releasedAt && (
        <p className="mt-2 text-xs text-green-600">
          Released on {payment.releasedAt.toLocaleDateString()}
        </p>
      )}
    </Card>
  );
}
