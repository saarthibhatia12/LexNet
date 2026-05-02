// ============================================================================
// LexNet Frontend — useAuth Hook
// ============================================================================
//
// Convenience hook that consumes the AuthContext.
// Throws a clear error if used outside the AuthProvider tree.
// ============================================================================

import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import type { AuthContextValue } from '../context/AuthContext';

/**
 * Access the auth state and actions (login, logout, getToken).
 *
 * @throws {Error} If called outside of an `<AuthProvider>`.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error(
      'useAuth() must be used within an <AuthProvider>. ' +
      'Wrap your component tree with <AuthProvider> in main.tsx.',
    );
  }

  return context;
}
