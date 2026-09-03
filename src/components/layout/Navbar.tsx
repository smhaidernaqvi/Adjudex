"use client";

/**
 * Navbar — Top navigation bar with auth-aware links.
 *
 * - Logged-out visitors see "Login" and "Sign Up".
 * - Logged-in users see their name, role badge, and a Logout button.
 */

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

export function Navbar() {
    const { user, logout } = useAuth();

    return (
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 px-6 dark:border-zinc-800">
            <Link href="/" className="text-lg font-semibold tracking-tight">
                TrustFreelance
            </Link>

            <nav className="flex items-center gap-3 text-sm">
                {user ? (
                    <>
                        <span className="hidden text-zinc-500 sm:inline">
                            {user.name}
                        </span>
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium capitalize text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                            {user.role}
                        </span>
                        <button
                            onClick={logout}
                            className="rounded-md px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                        >
                            Logout
                        </button>
                    </>
                ) : (
                    <>
                        <Link
                            href="/login"
                            className="text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
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
