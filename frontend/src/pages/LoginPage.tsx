// ============================================================================
// LexNet Frontend — Login Page
// ============================================================================
//
// Username + password form for official authentication.
// Sends the login mutation → receives JWT → stores via AuthContext.
// Redirects to dashboard (or the originally intended page) on success.
// ============================================================================

import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { useAuth } from '../hooks/useAuth';
import { LOGIN } from '../graphql/mutations';
import { APP_NAME } from '../utils/constants';
import { Shield, Eye, EyeOff, Loader2, AlertTriangle } from 'lucide-react';

interface LoginData {
  login: {
    token: string;
    userId: string;
    role: string;
    expiresIn: string;
  };
}

interface LoginVars {
  username: string;
  password: string;
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get the intended destination from ProtectedRoute redirect
  const from = (location.state as { from?: string } | null)?.from || '/dashboard';

  const [loginMutation, { loading }] = useMutation<LoginData, LoginVars>(LOGIN, {
    onCompleted: (data) => {
      try {
        login(data.login.token);
        navigate(from, { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to process login token');
      }
    },
    onError: (err) => {
      const message =
        err.graphQLErrors?.[0]?.message || err.message || 'Login failed';
      setError(message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError('Username is required');
      return;
    }
    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    loginMutation({ variables: { username: username.trim(), password } });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-scale-in">
        {/* ---- Header ---- */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-lexnet shadow-glow mb-4">
            <Shield className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white" id="login-heading">
            Sign in to {APP_NAME}
          </h1>
          <p className="mt-2 text-sm text-surface-200/50">
            Enter your credentials to access the official dashboard
          </p>
        </div>

        {/* ---- Form Card ---- */}
        <div className="glass-card p-8">
          <form onSubmit={handleSubmit} className="space-y-5" id="login-form">
            {/* Error Alert */}
            {error && (
              <div
                className="flex items-start gap-2.5 p-3 rounded-lg bg-risk-high/10 border border-risk-high/20 animate-slide-down"
                role="alert"
                id="login-error"
              >
                <AlertTriangle
                  className="text-risk-high flex-shrink-0 mt-0.5"
                  size={16}
                />
                <p className="text-sm text-risk-high">{error}</p>
              </div>
            )}

            {/* Username */}
            <div>
              <label htmlFor="login-username" className="input-label">
                Username
              </label>
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(null);
                }}
                className="input-field"
                placeholder="Enter your username"
                disabled={loading}
                autoFocus
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="input-label">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  className="input-field pr-11"
                  placeholder="Enter your password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-200/40 hover:text-surface-200/70 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  id="login-toggle-password"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={loading}
              id="login-submit"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* ---- Demo credentials hint ---- */}
          <div className="mt-6 pt-5 border-t border-surface-700/30">
            <p className="text-xs text-surface-200/30 text-center mb-3 uppercase tracking-wider font-medium">
              Demo Accounts
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { user: 'admin', pass: 'admin123', role: 'Admin' },
                { user: 'registrar', pass: 'reg456', role: 'Registrar' },
                { user: 'clerk', pass: 'clerk789', role: 'Clerk' },
              ].map((demo) => (
                <button
                  key={demo.user}
                  type="button"
                  onClick={() => {
                    setUsername(demo.user);
                    setPassword(demo.pass);
                    setError(null);
                  }}
                  className="px-2 py-2 rounded-lg text-center
                             bg-surface-800/40 border border-surface-700/30
                             hover:border-lexnet-600/40 hover:bg-lexnet-900/30
                             transition-all duration-200 group"
                  id={`login-demo-${demo.user}`}
                >
                  <p className="text-xs font-medium text-surface-200/70 group-hover:text-lexnet-300 transition-colors">
                    {demo.role}
                  </p>
                  <p className="text-[10px] text-surface-200/30 mt-0.5">
                    {demo.user}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ---- Public verification link ---- */}
        <p className="mt-6 text-center text-sm text-surface-200/40">
          Need to verify a document?{' '}
          <Link
            to="/verify"
            className="text-lexnet-400 hover:text-lexnet-300 transition-colors font-medium"
          >
            Go to verification
          </Link>
        </p>
      </div>
    </div>
  );
}
