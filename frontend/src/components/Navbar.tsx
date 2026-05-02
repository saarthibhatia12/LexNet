// ============================================================================
// LexNet Frontend — Navbar
// ============================================================================
//
// Top navigation bar with logo, public links, auth status, and logout.
// Visible on all pages. Shows different links based on auth state.
// ============================================================================

import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { APP_NAME } from '../utils/constants';
import {
  Shield,
  LogOut,
  Search,
  LayoutDashboard,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';

export default function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const navLinkClass = (path: string) =>
    `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
      isActive(path)
        ? 'bg-lexnet-700/60 text-white shadow-sm'
        : 'text-surface-200/70 hover:text-white hover:bg-surface-700/40'
    }`;

  return (
    <nav className="sticky top-0 z-50 bg-surface-900/80 backdrop-blur-xl border-b border-surface-700/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* ---- Logo ---- */}
          <Link
            to={isAuthenticated ? '/dashboard' : '/verify'}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-lexnet flex items-center justify-center shadow-glow group-hover:shadow-lg transition-shadow duration-300">
              <Shield className="w-4.5 h-4.5 text-white" size={18} />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">
              {APP_NAME}
            </span>
          </Link>

          {/* ---- Desktop nav links ---- */}
          <div className="hidden md:flex items-center gap-1">
            {/* Public links */}
            <Link to="/verify" className={navLinkClass('/verify')} id="nav-verify">
              <Search size={16} />
              Verify
            </Link>
            <Link to="/graph" className={navLinkClass('/graph')} id="nav-graph">
              <svg
                className="w-4 h-4"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <circle cx="4" cy="4" r="2" />
                <circle cx="12" cy="4" r="2" />
                <circle cx="8" cy="13" r="2" />
                <line x1="5.5" y1="5.5" x2="7" y2="11.5" />
                <line x1="10.5" y1="5.5" x2="9" y2="11.5" />
              </svg>
              Graph
            </Link>

            {/* Auth-only links */}
            {isAuthenticated && (
              <Link
                to="/dashboard"
                className={navLinkClass('/dashboard')}
                id="nav-dashboard"
              >
                <LayoutDashboard size={16} />
                Dashboard
              </Link>
            )}
          </div>

          {/* ---- Auth status / actions ---- */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-800/60 border border-surface-700/40">
                  <div className="w-2 h-2 rounded-full bg-accent-500 animate-pulse" />
                  <span className="text-xs text-surface-200/70">
                    {user.userId}
                  </span>
                  <span className="badge-info text-[10px] px-1.5 py-0">
                    {user.role}
                  </span>
                </div>
                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium
                             text-surface-200/60 hover:text-risk-high hover:bg-risk-high/10
                             transition-all duration-200"
                  id="nav-logout"
                >
                  <LogOut size={16} />
                  Logout
                </button>
              </div>
            ) : (
              <Link to="/login" className="btn-primary text-sm" id="nav-login">
                Sign In
              </Link>
            )}
          </div>

          {/* ---- Mobile menu toggle ---- */}
          <button
            className="md:hidden p-2 rounded-lg text-surface-200/70 hover:text-white hover:bg-surface-700/40 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            id="nav-mobile-toggle"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* ---- Mobile menu ---- */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-surface-700/50 bg-surface-900/95 backdrop-blur-xl animate-slide-down">
          <div className="px-4 py-3 space-y-1">
            <Link
              to="/verify"
              className={navLinkClass('/verify')}
              onClick={() => setMobileMenuOpen(false)}
            >
              <Search size={16} />
              Verify
            </Link>
            <Link
              to="/graph"
              className={navLinkClass('/graph')}
              onClick={() => setMobileMenuOpen(false)}
            >
              Graph Explorer
            </Link>

            {isAuthenticated && (
              <Link
                to="/dashboard"
                className={navLinkClass('/dashboard')}
                onClick={() => setMobileMenuOpen(false)}
              >
                <LayoutDashboard size={16} />
                Dashboard
              </Link>
            )}

            <div className="pt-2 border-t border-surface-700/30">
              {isAuthenticated && user ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <div className="w-2 h-2 rounded-full bg-accent-500" />
                    <span className="text-sm text-surface-200/70">{user.userId}</span>
                    <span className="badge-info text-[10px]">{user.role}</span>
                  </div>
                  <button
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-risk-high hover:bg-risk-high/10 transition-colors"
                  >
                    <LogOut size={16} />
                    Logout
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="btn-primary w-full text-sm"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
