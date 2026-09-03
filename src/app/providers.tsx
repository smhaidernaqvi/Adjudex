"use client";

import { AuthProvider } from "@/components/auth/AuthProvider";

/**
 * Client-side Providers wrapper.
 *
 * Wraps the app in the AuthProvider so every component can call useAuth().
 * This file exists because the root layout is a server component.
 */
export function Providers({ children }: { children: React.ReactNode }) {
    return <AuthProvider>{children}</AuthProvider>;
}
