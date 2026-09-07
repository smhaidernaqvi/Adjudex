"use client";

/**
 * Navbar — Top navigation bar with auth-aware links.
 *
 * - Logged-out visitors see "Login" and "Sign Up".
 * - Logged-in users see their name, role badge, and a Logout button.
 *
 * The signed-in links are deliberately neutral. Adjudex has no marketplace, so
 * there is no "Browse Jobs" or "Available Projects" entry — either party can
 * initiate a private transaction, and both land on the same dashboard.
 */

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

export function Navbar() {
    const { user, logout } = useAuth();

    // Both roles share the same transaction dashboard; only the URL prefix
    // differs, because the /client and /freelancer trees are already guarded.
    const dashboardHref =
        user?.role === "freelancer" ? "/freelancer/dashboard" : "/client/dashboard";

    return (
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 px-6">
            <div className="flex items-center gap-6">
                <Link href="/" className="text-lg font-semibold tracking-tight">
                    Adjudex
                </Link>

                {user && (
                    <nav className="hidden items-center gap-4 text-sm sm:flex">
                        <Link
                            href={dashboardHref}
                            className="text-zinc-500 transition-colors hover:text-zinc-700"
                        >
                            Transactions
                        </Link>
                        <Link
                            href="/transactions/new"
                            className="text-zinc-500 transition-colors hover:text-zinc-700"
                        >
                            Create Transaction
                        </Link>
                    </nav>
                )}
            </div>

            <nav className="flex items-center gap-3 text-sm">
                {user ? (
                    <>
                        <span className="hidden text-zinc-500 sm:inline">
                            {user.name}
                        </span>
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium capitalize text-zinc-500">
                            {user.role}
                        </span>
                        <Link
                            href="/transactions/new"
                            className="rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white transition-colors hover:bg-blue-700 sm:hidden"
                        >
                            New
                        </Link>
                        <button
                            onClick={logout}
                            className="rounded-md px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                        >
                            Logout
                        </button>
                    </>
                ) : (
                    <>
                        <Link
                            href="/login"
                            className="text-zinc-500 transition-colors hover:text-zinc-700"
                        >
                            Login
                        </Link>
                        <Link
                            href="/signup"
                            className="rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white transition-colors hover:bg-blue-700"
                        >
                            Sign Up
                        </Link>
                    </>
                )}
            </nav>
        </header>
    );
}
