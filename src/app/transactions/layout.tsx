"use client";

/**
 * Transactions Area Layout — Auth guard for /transactions/* routes.
 *
 * Transaction routes are neutral (not role-scoped) because either party may
 * initiate a private transaction. Access to a SPECIFIC transaction is enforced
 * by the service layer against its two participant ids — this guard only
 * establishes that a user is signed in.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

export default function TransactionsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && !user) {
            router.replace("/login");
        }
    }, [user, isLoading, router]);

    if (isLoading) {
        return (
            <main className="flex flex-1 items-center justify-center">
                <p className="text-sm text-zinc-500">Loading…</p>
            </main>
        );
    }

    if (!user) return null;

    return <>{children}</>;
}
