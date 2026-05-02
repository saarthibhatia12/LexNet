// ============================================================================
// LexNet Frontend — Apollo Client
// ============================================================================
//
// Configures Apollo Client with:
//   1. httpLink   — points to VITE_API_URL (default: /graphql via proxy)
//   2. authLink   — injects Bearer token from localStorage
//   3. errorLink  — auto-logout on 401 / UNAUTHENTICATED errors
// ============================================================================

import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  from,
} from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'lexnet_auth_token';

const httpLink = createHttpLink({
  uri: import.meta.env.VITE_API_URL || '/graphql',
});

/**
 * Auth link — attaches the JWT as a Bearer token on every request.
 */
const authLink = setContext((_, { headers }) => {
  const token = localStorage.getItem(STORAGE_KEY);

  return {
    headers: {
      ...(headers as Record<string, string>),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
});

/**
 * Error link — intercepts GraphQL and network errors.
 * On 401 or UNAUTHENTICATED, clears stored token and redirects to /login.
 */
const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    for (const err of graphQLErrors) {
      const code = err.extensions?.code as string | undefined;

      if (code === 'UNAUTHENTICATED' || code === 'FORBIDDEN') {
        localStorage.removeItem(STORAGE_KEY);
        window.location.href = '/login';
        return;
      }
    }
  }

  if (networkError && 'statusCode' in networkError) {
    const status = (networkError as { statusCode: number }).statusCode;
    if (status === 401) {
      localStorage.removeItem(STORAGE_KEY);
      window.location.href = '/login';
    }
  }
});

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export const apolloClient = new ApolloClient({
  link: from([errorLink, authLink, httpLink]),
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          // Merge paginated conflict results
          getConflicts: {
            keyArgs: false,
            merge(existing = [], incoming: unknown[]) {
              return [...existing, ...incoming];
            },
          },
        },
      },
    },
  }),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'all',
    },
    query: {
      fetchPolicy: 'network-only',
      errorPolicy: 'all',
    },
    mutate: {
      errorPolicy: 'all',
    },
  },
});
