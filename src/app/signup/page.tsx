"use client";

/**
 * Signup Page
 *
 * Registration form with validation for name, email, password,
 * password confirmation, and role selection (Client / Freelancer).
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/types";
import { signup } from "@/lib/auth";

export default function SignupPage() {
    const router = useRouter();
    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
        role: "client" as UserRole,
    });
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    function update(field: string, value: string) {
        setForm((prev) => ({ ...prev, [field]: value }));
        setError("");
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");

        // ── Validation ──────────────────────────────────────────
        if (!form.name.trim()) {
            setError("Full name is required.");
            return;
        }
        if (!form.email.trim()) {
            setError("Email is required.");
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
            setError("Please enter a valid email address.");
            return;
        }
        if (form.password.length < 6) {
            setError("Password must be at least 6 characters.");
            return;
        }
        if (form.password !== form.confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        // ── Submit ──────────────────────────────────────────────
        setIsSubmitting(true);

        const result = await signup({
            name: form.name.trim(),
            email: form.email.trim(),
            password: form.password,
            role: form.role,
        });

        setIsSubmitting(false);

        if ("error" in result) {
            setError(result.error);
            return;
        }

        router.push("/login?registered=1");
    }

    return (
        <main className="flex flex-1 items-center justify-center px-4 py-12">
            <div className="w-full max-w-md">
                <h1 className="text-center text-2xl font-bold tracking-tight">
                    Create your account
                </h1>
                <p className="mt-2 text-center text-sm text-zinc-500">
                    Join the trust-based freelancing platform
                </p>

                <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
                    {/* Full Name */}
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="name" className="text-sm font-medium">
                            Full Name
                        </label>
                        <input
                            id="name"
                            type="text"
                            value={form.name}
                            onChange={(e) => update("name", e.target.value)}
                            className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Jane Doe"
                        />
                    </div>

                    {/* Email */}
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="email" className="text-sm font-medium">
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={form.email}
                            onChange={(e) => update("email", e.target.value)}
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
                            value={form.password}
                            onChange={(e) => update("password", e.target.value)}
                            className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="At least 6 characters"
                        />
                    </div>

                    {/* Confirm Password */}
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="confirmPassword" className="text-sm font-medium">
                            Confirm Password
                        </label>
                        <input
                            id="confirmPassword"
                            type="password"
                            value={form.confirmPassword}
                            onChange={(e) => update("confirmPassword", e.target.value)}
                            className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Re-enter password"
                        />
                    </div>

                    {/* Role Selection */}
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="role" className="text-sm font-medium">
                            I am a
                        </label>
                        <select
                            id="role"
                            value={form.role}
                            onChange={(e) => update("role", e.target.value)}
                            className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                            <option value="client">Client — I hire freelancers</option>
                            <option value="freelancer">Freelancer — I do the work</option>
                        </select>
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
                        {isSubmitting ? "Creating account…" : "Create Account"}
                    </button>
                </form>

                <p className="mt-6 text-center text-sm text-zinc-500">
                    Already have an account?{" "}
                    <Link
                        href="/login"
                        className="font-medium text-blue-600 hover:underline"
                    >
                        Log in
                    </Link>
                </p>
            </div>
        </main>
    );
}
