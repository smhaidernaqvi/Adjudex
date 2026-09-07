"use client";

/**
 * Client Dashboard
 *
 * Adjudex is a private trust layer, so there is no "browse projects" screen.
 * A client sees only the transactions they initiated or were invited to, and
 * opens new ones against a specific freelancer they already found elsewhere.
 *
 * The layout is role-neutral: the same component serves the freelancer
 * dashboard, because either side may be the initiator.
 */

import { useAuth } from "@/components/auth/AuthProvider";
import { TransactionDashboard } from "@/components/transactions/TransactionDashboard";

export default function ClientDashboardPage() {
    const { user } = useAuth();

    if (!user) {
        return (
            <main className="flex flex-1 items-center justify-center">
                <p className="text-sm text-zinc-500">Loading…</p>
            </main>
        );
    }

    return <TransactionDashboard userId={user.id} userName={user.name} />;
}
