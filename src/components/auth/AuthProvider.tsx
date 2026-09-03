"use client";

/**
 * AuthProvider — React context that shares auth state across client components.
 *
 * On mount it reads the stored session from localStorage, verifies the token,
 * and exposes the current user plus login / logout / signup methods.
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import type { User, UserRole } from "@/types";
import * as auth from "@/lib/auth";

// ─── Context shape ────────────────────────────────────────────

interface AuthContextValue {
    user: User | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<{ user?: User; error?: string }>;
    signup: (data: {
        name: string;
        email: string;
        password: string;
        role: UserRole;
    }) => Promise<{ error?: string }>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Hydrate session from localStorage on first render
    useEffect(() => {
        auth.getCurrentSession().then((session) => {
            if (session) setUser(session.user);
            setIsLoading(false);
        });
    }, []);

    const handleSignup = useCallback(
        async (data: {
            name: string;
            email: string;
            password: string;
            role: UserRole;
        }) => {
            const result = await auth.signup(data);
            return "error" in result ? result : {};
        },
        [],
    );

    const handleLogin = useCallback(
        async (email: string, password: string) => {
            const result = await auth.login(email, password);
            if ("session" in result) {
                setUser(result.session.user);
                return { user: result.session.user };
            }
            return result;
        },
        [],
    );

    const handleLogout = useCallback(() => {
        auth.logout();
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider
            value={{ user, isLoading, login: handleLogin, signup: handleSignup, logout: handleLogout }}
        >
            {children}
        </AuthContext.Provider>
    );
}

// ─── Hook ─────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth must be used within an <AuthProvider>");
    }
    return ctx;
}
