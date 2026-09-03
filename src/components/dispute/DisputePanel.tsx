/**
 * DisputePanel — Displays and manages project disputes
 */

import { Card } from "@/components/ui/Card";
import type { Dispute } from "@/types";

interface DisputePanelProps {
    dispute?: Dispute;
}

export function DisputePanel({ dispute }: DisputePanelProps) {
    return (
        <Card>
            <p className="text-sm font-medium">Dispute</p>
            {dispute ? (
                <p className="mt-1 text-sm text-zinc-500">
                    Status: {dispute.status} — {dispute.reason}
                </p>
            ) : (
                <p className="mt-1 text-sm text-zinc-500">No active disputes.</p>
            )}
        </Card>
    );
}
