/**
 * Next.js Middleware — Route protection
 *
 * Verifies the auth_token cookie for protected routes and redirects
 * unauthenticated users to /login.
 *
 * /transactions/* is protected too: those pages hold private negotiations that
 * only their two participants may reach. (Cookie verification here is the first
 * line of defence; the per-record participant check in lib/authz is the real
 * one, because the cookie only proves WHO is signed in, not whether they belong
 * to a given transaction.)
 *
 * Runs on the Edge Runtime, so it uses only Web Crypto APIs (no Node deps).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_SECRET = "trust-freelance-hackathon-2026-secret";
const TOKEN_COOKIE = "auth_token";

// ─── Edge-compatible crypto helpers ───────────────────────────

async function getSigningKey(): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(AUTH_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
    );
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
    const binary = atob(base64);
    return Uint8Array.from(Array.from({ length: binary.length }), (_, i) =>
        binary.charCodeAt(i),
    );
}

async function verifyToken(token: string): Promise<boolean> {
    try {
        const dot = token.indexOf(".");
        if (dot === -1) return false;

        const payloadStr = token.slice(0, dot);
        const sigStr = token.slice(dot + 1);

        const key = await getSigningKey();
        const valid = await crypto.subtle.verify(
            "HMAC",
            key,
            base64ToBytes(sigStr),
            new TextEncoder().encode(payloadStr),
        );
        if (!valid) return false;

        const payload = JSON.parse(atob(payloadStr));
        return Date.now() <= payload.exp;
    } catch {
        return false;
    }
}

// ─── Middleware handler ───────────────────────────────────────

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Only protect client, freelancer, transaction and AI API routes
    const isClientRoute = pathname.startsWith("/client");
    const isFreelancerRoute = pathname.startsWith("/freelancer");
    const isTransactionRoute = pathname.startsWith("/transactions");
    const isAiApiRoute = pathname.startsWith("/api/ai");

    if (
        !isClientRoute &&
        !isFreelancerRoute &&
        !isTransactionRoute &&
        !isAiApiRoute
    ) {
        return NextResponse.next();
    }

    const token = request.cookies.get(TOKEN_COOKIE)?.value;

    // API routes reject with JSON (a redirect would break fetch callers)
    if (isAiApiRoute) {
        const apiTokenValid = token ? await verifyToken(token) : false;
        if (!apiTokenValid) {
            return NextResponse.json(
                { error: "You must be signed in to use AI features." },
                { status: 401 },
            );
        }
        return NextResponse.next();
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);

    // No token → redirect to login
    if (!token) {
        return NextResponse.redirect(loginUrl);
    }

    // Invalid / expired token → clear cookie and redirect
    const isValid = await verifyToken(token);
    if (!isValid) {
        const response = NextResponse.redirect(loginUrl);
        response.cookies.set(TOKEN_COOKIE, "", { maxAge: 0, path: "/" });
        return response;
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/client/:path*",
        "/freelancer/:path*",
        "/transactions/:path*",
        "/api/ai/:path*",
    ],
};
