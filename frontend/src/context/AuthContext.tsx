// ============================================================================
// LexNet Frontend — Auth Context
// ============================================================================
//
// Manages JWT authentication state. Stores token in localStorage,
// parses the JWT payload for userId/role, and validates expiry on mount.
// ============================================================================

import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  userId: string;
  role: 'admin' | 'registrar' | 'clerk' | 'official';
}

export interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
  getToken: () => string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'lexnet_auth_token';

/**
 * Decode a JWT payload without verifying the signature.
 * Runs entirely client-side — actual verification happens on the backend.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Extract AuthUser from a decoded JWT payload.
 */
function extractUser(payload: Record<string, unknown>): AuthUser | null {
  const userId = payload.userId as string | undefined;
  const role = payload.role as string | undefined;

  if (!userId || !role) return null;

  const validRoles = ['admin', 'registrar', 'clerk', 'official'] as const;
  if (!validRoles.includes(role as typeof validRoles[number])) return null;

  return { userId, role: role as AuthUser['role'] };
}

/**
 * Check whether a JWT is still valid (not expired).
 */
function isTokenValid(payload: Record<string, unknown>): boolean {
  const exp = payload.exp as number | undefined;
  if (typeof exp !== 'number') return false;

  // exp is in seconds; compare against current time with a 10-second buffer
  return exp * 1000 > Date.now() - 10_000;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  // ---- Restore session on mount ----
  useEffect(() => {
    const storedToken = localStorage.getItem(STORAGE_KEY);
    if (!storedToken) return;

    const payload = decodeJwtPayload(storedToken);
    if (!payload || !isTokenValid(payload)) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const parsedUser = extractUser(payload);
    if (!parsedUser) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    setToken(storedToken);
    setUser(parsedUser);
  }, []);

  // ---- Login ----
  const login = useCallback((newToken: string) => {
    const payload = decodeJwtPayload(newToken);
    if (!payload) {
      throw new Error('Invalid JWT token format');
    }

    const parsedUser = extractUser(payload);
    if (!parsedUser) {
      throw new Error('JWT payload missing userId or role');
    }

    localStorage.setItem(STORAGE_KEY, newToken);
    setToken(newToken);
    setUser(parsedUser);
  }, []);

  // ---- Logout ----
  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // ---- Get current token ----
  const getToken = useCallback((): string | null => {
    const storedToken = localStorage.getItem(STORAGE_KEY);
    if (!storedToken) return null;

    const payload = decodeJwtPayload(storedToken);
    if (!payload || !isTokenValid(payload)) {
      // Token expired — auto-clean
      localStorage.removeItem(STORAGE_KEY);
      setToken(null);
      setUser(null);
      return null;
    }

    return storedToken;
  }, []);

  // ---- Context value (memoised to prevent unnecessary re-renders) ----
  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isAuthenticated: token !== null && user !== null,
      login,
      logout,
      getToken,
    }),
    [token, user, login, logout, getToken],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
