// ============================================================================
// LexNet Frontend — App (Route Definitions)
// ============================================================================
//
// Defines all application routes and the global layout:
//   - Public: /login, /verify, /graph, /timeline/:id
//   - Protected: /dashboard, /register, /conflicts, /document/:hash
//   - Default redirect to /verify (public landing)
// ============================================================================

import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';

import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import RegisterPage from './pages/RegisterPage';
import VerifyPage from './pages/VerifyPage';
import GraphExplorerPage from './pages/GraphExplorerPage';
import ConflictPage from './pages/ConflictPage';
import TimelinePage from './pages/TimelinePage';
import DocumentDetailPage from './pages/DocumentDetailPage';

// ---------------------------------------------------------------------------
// Layout Wrappers
// ---------------------------------------------------------------------------

/**
 * Layout with sidebar for authenticated pages.
 */
function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * Simple full-width layout for public pages.
 */
function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-[calc(100vh-4rem)]">
      {children}
    </main>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-surface-900">
      <Navbar />

      <Routes>
        {/* ---- Public routes ---- */}
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <PublicLayout>
                <LoginPage />
              </PublicLayout>
            )
          }
        />

        <Route
          path="/verify"
          element={
            <PublicLayout>
              <VerifyPage />
            </PublicLayout>
          }
        />

        <Route
          path="/verify/:hash"
          element={
            <PublicLayout>
              <VerifyPage />
            </PublicLayout>
          }
        />

        <Route
          path="/graph"
          element={
            <PublicLayout>
              <GraphExplorerPage />
            </PublicLayout>
          }
        />

        <Route
          path="/timeline/:id"
          element={
            <PublicLayout>
              <TimelinePage />
            </PublicLayout>
          }
        />

        {/* ---- Protected routes ---- */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <DashboardPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/register"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <RegisterPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/conflicts"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <ConflictPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/document/:hash"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <DocumentDetailPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        {/* ---- Default redirect ---- */}
        <Route path="*" element={<Navigate to="/verify" replace />} />
      </Routes>
    </div>
  );
}
