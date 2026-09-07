"use client";

/**
 * Freelancer Dashboard
 *
 * The old "Available Projects" board is gone: Adjudex is not a marketplace, so
 * there is nothing public for a freelancer to browse and no project they can
 * claim. A freelancer sees only the private transactions they initiated or were
 * invited to, and can open one against a specific client they already found
 * elsewhere.
 *
 * Identical component to the client dashboard — either side may initiate.
 */

import { useAuth } from "@/components/auth/AuthProvider";
import { TransactionDashboard } from "@/components/transactions/TransactionDashboard";

export default function FreelancerDashboardPage() {
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
