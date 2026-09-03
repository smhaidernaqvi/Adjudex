/**
 * Auth Module
 *
 * Handles user registration, login, session management, and token
 * creation/verification using the Web Crypto API (zero dependencies).
 *
 * - Passwords are hashed with PBKDF2-SHA-256 (100 000 iterations + per-user salt)
 * - Session tokens are HMAC-SHA-256-signed payloads stored in a cookie
 * - User data lives in localStorage (no database yet)
 */

import type { User, UserRole } from "@/types";

// ─── Constants ────────────────────────────────────────────────

const AUTH_SECRET = "trust-freelance-hackathon-2026-secret";
const USERS_KEY = "tf_users";
const SESSION_KEY = "tf_session";
const TOKEN_COOKIE = "auth_token";
const TOKEN_MAX_AGE = 60 * 60 * 24 * 7; // 7 days (seconds)
const PBKDF2_ITERATIONS = 100_000;

// ─── Stored User (includes hashed password) ──────────────────

interface StoredUser extends User {
    passwordHash: string;
    salt: string;
}

// ─── Session (what we persist client-side) ────────────────────

export interface AuthSession {
    user: User;
    token: string;
    expiresAt: number;
}

// ─── Crypto helpers ───────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
    const binary = atob(base64);
    return Uint8Array.from(Array.from({ length: binary.length }), (_, i) =>
        binary.charCodeAt(i),
    );
}

async function getSigningKey(): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(AUTH_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
    );
}

// ─── Password hashing (PBKDF2-SHA-256) ───────────────────────

async function hashPassword(
    password: string,
    salt: string,
): Promise<string> {
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"],
    );

    const bits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: new TextEncoder().encode(salt),
            iterations: PBKDF2_ITERATIONS,
            hash: "SHA-256",
        },
        keyMaterial,
        256,
    );

    return bytesToBase64(new Uint8Array(bits));
}

// ─── Token helpers ────────────────────────────────────────────

interface TokenPayload {
    userId: string;
    role: UserRole;
    exp: number;
}

export async function createAuthToken(
    userId: string,
    role: UserRole,
): Promise<string> {
    const payload: TokenPayload = {
        userId,
        role,
        exp: Date.now() + TOKEN_MAX_AGE * 1000,
    };
    const payloadStr = btoa(JSON.stringify(payload));
    const key = await getSigningKey();
    const sig = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(payloadStr),
    );
    return `${payloadStr}.${bytesToBase64(new Uint8Array(sig))}`;
}

export async function verifyAuthToken(
    token: string,
): Promise<TokenPayload | null> {
    try {
        const dot = token.indexOf(".");
        if (dot === -1) return null;

        const payloadStr = token.slice(0, dot);
        const sigStr = token.slice(dot + 1);

        const key = await getSigningKey();
        const valid = await crypto.subtle.verify(
            "HMAC",
            key,
            base64ToBytes(sigStr),
            new TextEncoder().encode(payloadStr),
        );
        if (!valid) return null;

        const payload: TokenPayload = JSON.parse(atob(payloadStr));
        if (Date.now() > payload.exp) return null;
        return payload;
    } catch {
        return null;
    }
}

// ─── Cookie helper ────────────────────────────────────────────

function setAuthCookie(token: string): void {
    document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${TOKEN_MAX_AGE}; SameSite=Lax`;
}

function clearAuthCookie(): void {
    document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Register a new user. Returns the created user or an error string.
 */
export async function signup(data: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
}): Promise<{ user: User } | { error: string }> {
    const users = getStoredUsers();
    if (users.some((u) => u.email === data.email)) {
        return { error: "An account with this email already exists." };
    }

    const salt = crypto.randomUUID();
    const passwordHash = await hashPassword(data.password, salt);
    const now = new Date();

    const user: User = {
        id: crypto.randomUUID(),
        name: data.name,
        email: data.email,
        role: data.role,
        createdAt: now,
    };

    users.push({ ...user, passwordHash, salt });
    localStorage.setItem(USERS_KEY, JSON.stringify(users));

    return { user };
}

/**
 * Authenticate an existing user. Sets cookie + localStorage session on success.
 */
export async function login(
    email: string,
    password: string,
): Promise<{ session: AuthSession } | { error: string }> {
    const users = getStoredUsers();
    const stored = users.find((u) => u.email === email);
    if (!stored) return { error: "No account found with this email." };

    const hash = await hashPassword(password, stored.salt);
    if (hash !== stored.passwordHash) return { error: "Incorrect password." };

    const token = await createAuthToken(stored.id, stored.role);
    const user: User = {
        id: stored.id,
        name: stored.name,
        email: stored.email,
        role: stored.role,
        createdAt: stored.createdAt,
    };

    const session: AuthSession = {
        user,
        token,
        expiresAt: Date.now() + TOKEN_MAX_AGE * 1000,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setAuthCookie(token);

    return { session };
}

/**
 * Clear the current session (localStorage + cookie).
 */
export function logout(): void {
    localStorage.removeItem(SESSION_KEY);
    clearAuthCookie();
}

/**
 * Read the current session from localStorage and verify the token.
 * Returns null when no valid session exists.
 */
export async function getCurrentSession(): Promise<AuthSession | null> {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    try {
        const session: AuthSession = JSON.parse(raw);
        if (Date.now() > session.expiresAt) {
            logout();
            return null;
        }
        const payload = await verifyAuthToken(session.token);
        if (!payload) {
            logout();
            return null;
        }
        return session;
    } catch {
        logout();
        return null;
    }
}

// ─── Internal helpers ─────────────────────────────────────────

function getStoredUsers(): StoredUser[] {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

// ─── Public user lookup ──────────────────────────────────────

/**
 * Look up a user by ID (without sensitive fields like password hash).
 */
export function getUserById(id: string): User | null {
    const stored = getStoredUsers().find((u) => u.id === id);
    if (!stored) return null;
    const { passwordHash: _, salt: __, ...user } = stored;
    return user;
}
