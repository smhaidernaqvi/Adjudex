"use client";

/**
 * Login Page
 *
 * Email / password login form with validation.
 * Shows a success banner after signup redirect.
 * Redirects to role-based dashboard on success.
 */

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { login } = useAuth();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const justRegistered = searchParams.get("registered") === "1";

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");

        if (!email.trim()) {
            setError("Email is required.");
            return;
        }
        if (!password) {
            setError("Password is required.");
            return;
        }

        setIsSubmitting(true);

        const result = await login(email.trim(), password);

        setIsSubmitting(false);

        if ("error" in result && result.error) {
            setError(result.error);
            return;
        }

        // Role-based redirect
        if (result.user) {
            router.push(
                result.user.role === "freelancer"
                    ? "/freelancer/dashboard"
                    : "/client/dashboard",
            );
        }
    }

    return (
        <main className="flex flex-1 items-center justify-center px-4 py-12">
            <div className="w-full max-w-md">
                <h1 className="text-center text-2xl font-bold tracking-tight">
                    Welcome back
                </h1>
                <p className="mt-2 text-center text-sm text-zinc-500">
                    Log in to your account
                </p>

                {justRegistered && (
                    <div className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                        Account created successfully! Please log in.
                    </div>
                )}

                <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
                    {/* Email */}
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="email" className="text-sm font-medium">
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                setError("");
                            }}
                            className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="you@example.com"
                        />
                    </div>

                    {/* Password */}
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="password" className="text-sm font-medium">
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setError("");
                            }}
                            className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Your password"
                        />
                    </div>

                    {/* Error */}
                    {error && (
                        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                            {error}
                        </p>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                        {isSubmitting ? "Logging in…" : "Log In"}
                    </button>
                </form>

                <p className="mt-6 text-center text-sm text-zinc-500">
                    Don&apos;t have an account?{" "}
                    <Link
                        href="/signup"
                        className="font-medium text-blue-600 hover:underline"
                    >
                        Sign up
                    </Link>
                </p>
            </div>
        </main>
    );
}

/**
 * Suspense wrapper — required because useSearchParams() needs a boundary.
 */
export default function LoginPage() {
    return (
        <Suspense
            fallback={
                <main className="flex flex-1 items-center justify-center">
                    <p className="text-sm text-zinc-500">Loading…</p>
                </main>
            }
        >
            <LoginForm />
        </Suspense>
    );
}
