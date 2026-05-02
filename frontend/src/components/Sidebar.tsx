// ============================================================================
// LexNet Frontend — Sidebar
// ============================================================================
//
// Side navigation for the authenticated official dashboard.
// Shows links to dashboard sub-pages: register, conflicts, documents, etc.
// ============================================================================

import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  LayoutDashboard,
  FilePlus,
  ShieldAlert,
  Search,
  Network,
  Clock,
  FileText,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';

interface SidebarLink {
  path: string;
  label: string;
  icon: React.ReactNode;
  id: string;
}

const sidebarLinks: SidebarLink[] = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard size={20} />,
    id: 'sidebar-dashboard',
  },
  {
    path: '/register',
    label: 'Register Doc',
    icon: <FilePlus size={20} />,
    id: 'sidebar-register',
  },
  {
    path: '/conflicts',
    label: 'Conflicts',
    icon: <ShieldAlert size={20} />,
    id: 'sidebar-conflicts',
  },
  {
    path: '/verify',
    label: 'Verify',
    icon: <Search size={20} />,
    id: 'sidebar-verify',
  },
  {
    path: '/graph',
    label: 'Graph Explorer',
    icon: <Network size={20} />,
    id: 'sidebar-graph',
  },
];

export default function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  return (
    <aside
      className={`hidden lg:flex flex-col h-[calc(100vh-4rem)] sticky top-16
                  bg-surface-900 border-r border-surface-700/50
                  transition-all duration-300 ease-out
                  ${collapsed ? 'w-[68px]' : 'w-60'}`}
    >
      {/* ---- Nav links ---- */}
      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
        {sidebarLinks.map((link) => (
          <Link
            key={link.path}
            to={link.path}
            id={link.id}
            title={collapsed ? link.label : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lexnet text-sm font-medium
                        transition-all duration-200 group
                        ${
                          isActive(link.path)
                            ? 'bg-lexnet-700/50 text-white shadow-sm border border-lexnet-600/30'
                            : 'text-surface-200/60 hover:text-white hover:bg-surface-700/40 border border-transparent'
                        }`}
          >
            <span
              className={`flex-shrink-0 transition-colors duration-200 ${
                isActive(link.path)
                  ? 'text-lexnet-400'
                  : 'text-surface-200/40 group-hover:text-surface-200/80'
              }`}
            >
              {link.icon}
            </span>
            {!collapsed && <span className="truncate">{link.label}</span>}
          </Link>
        ))}
      </nav>

      {/* ---- User info + collapse ---- */}
      <div className="border-t border-surface-700/50 p-3">
        {!collapsed && user && (
          <div className="flex items-center gap-2 px-2 py-2 mb-2 rounded-lg bg-surface-800/40">
            <div className="w-8 h-8 rounded-full bg-gradient-lexnet flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">
                {user.userId.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-surface-200/80 truncate">
                {user.userId}
              </p>
              <p className="text-[10px] text-surface-200/40 uppercase tracking-wider">
                {user.role}
              </p>
            </div>
          </div>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg
                     text-xs text-surface-200/40 hover:text-surface-200/70 hover:bg-surface-700/40
                     transition-all duration-200"
          id="sidebar-collapse"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
