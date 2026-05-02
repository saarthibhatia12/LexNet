// ============================================================================
// LexNet Frontend — Dashboard Page
// ============================================================================
//
// Main dashboard showing:
//   - Welcome header with role badge
//   - Quick action cards
//   - Recent documents (owned by current user)
//   - Risk alerts summary (high-risk flagged docs)
//   - System stats
// ============================================================================

import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';
import {
  FileText,
  ShieldAlert,
  Clock,
  TrendingUp,
  AlertTriangle,
  Loader2,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { GET_DOCUMENTS_BY_OWNER, GET_FLAGGED_DOCUMENTS } from '../graphql/queries';
import DocumentCard from '../components/DocumentCard';
import RiskBadge from '../components/RiskBadge';
import { formatRelativeTime, truncateHash, formatDocType } from '../utils/formatters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Document {
  docHash: string;
  ipfsCID: string;
  ownerId: string;
  docType: string;
  timestamp: string;
  riskScore: number;
  activeDispute: boolean;
  createdAt: string;
}

interface FlaggedDoc {
  document: Document;
  riskScore: number;
  flags: Array<{
    type: string;
    severity: string;
    description: string;
    relatedDocHash: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { user } = useAuth();

  // ---- Fetch recent documents ----
  const { data: docsData, loading: docsLoading } = useQuery<{
    getDocumentsByOwner: Document[];
  }>(GET_DOCUMENTS_BY_OWNER, {
    variables: { ownerId: user?.userId ?? '' },
    skip: !user?.userId,
    fetchPolicy: 'cache-and-network',
  });

  // ---- Fetch flagged documents ----
  const { data: flaggedData, loading: flaggedLoading } = useQuery<{
    getFlaggedDocuments: FlaggedDoc[];
  }>(GET_FLAGGED_DOCUMENTS, {
    variables: { minRisk: 50 },
    fetchPolicy: 'cache-and-network',
  });

  const recentDocs = docsData?.getDocumentsByOwner?.slice(0, 5) ?? [];
  const flaggedDocs = flaggedData?.getFlaggedDocuments?.slice(0, 5) ?? [];
  const highRiskCount = flaggedDocs.filter((f) => f.riskScore > 60).length;

  const quickActions = [
    {
      title: 'Register Document',
      description: 'Upload and register a new legal document on the blockchain',
      icon: <FileText size={24} />,
      path: '/register',
      colour: 'from-lexnet-600 to-lexnet-800',
      id: 'dashboard-register',
    },
    {
      title: 'View Conflicts',
      description: 'Monitor flagged documents and risk assessments',
      icon: <ShieldAlert size={24} />,
      path: '/conflicts',
      colour: 'from-amber-500 to-amber-700',
      id: 'dashboard-conflicts',
    },
    {
      title: 'Verify Document',
      description: 'Check the authenticity of a registered document',
      icon: <Shield size={24} />,
      path: '/verify',
      colour: 'from-accent-500 to-accent-700',
      id: 'dashboard-verify',
    },
    {
      title: 'Graph Explorer',
      description: 'Explore the legal knowledge graph and entity relationships',
      icon: <TrendingUp size={24} />,
      path: '/graph',
      colour: 'from-violet-500 to-violet-700',
      id: 'dashboard-graph',
    },
  ];

  return (
    <div className="page-section space-y-8">
      {/* ---- Welcome header ---- */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white" id="dashboard-heading">
            Welcome back, {user?.userId ?? 'Official'}
          </h1>
          <p className="text-surface-200/50 mt-1">
            LexNet Official Dashboard — manage documents, monitor risks, explore the knowledge graph.
          </p>
        </div>
        {user?.role && (
          <span className="badge-primary capitalize">{user.role}</span>
        )}
      </div>

      {/* ---- Stats row ---- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Your Documents" value={docsLoading ? '…' : String(recentDocs.length)} icon={<FileText size={18} />} colour="text-lexnet-400" />
        <StatCard label="High Risk Alerts" value={flaggedLoading ? '…' : String(highRiskCount)} icon={<AlertTriangle size={18} />} colour="text-risk-high" />
        <StatCard label="Flagged Total" value={flaggedLoading ? '…' : String(flaggedDocs.length)} icon={<ShieldAlert size={18} />} colour="text-risk-medium" />
        <StatCard label="Active Disputes" value={docsLoading ? '…' : String(recentDocs.filter((d) => d.activeDispute).length)} icon={<Clock size={18} />} colour="text-violet-400" />
      </div>

      {/* ---- Quick actions ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {quickActions.map((action) => (
          <Link
            key={action.path}
            to={action.path}
            id={action.id}
            className="glass-card p-5 group hover:border-lexnet-600/40 transition-all duration-300 hover:shadow-lexnet-lg"
          >
            <div
              className={`w-11 h-11 rounded-xl bg-gradient-to-br ${action.colour} flex items-center justify-center mb-3
                          shadow-md group-hover:shadow-lg transition-shadow duration-300`}
            >
              <span className="text-white">{action.icon}</span>
            </div>
            <h3 className="text-sm font-semibold text-white group-hover:text-lexnet-300 transition-colors">
              {action.title}
            </h3>
            <p className="text-xs text-surface-200/40 mt-1 line-clamp-2">
              {action.description}
            </p>
          </Link>
        ))}
      </div>

      {/* ---- Two-column content ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ---- Recent Documents ---- */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-surface-200/60">Recent Documents</h2>
            <Link
              to="/conflicts"
              className="text-xs text-lexnet-400 hover:text-lexnet-300 flex items-center gap-1 transition-colors"
            >
              View all <ChevronRight size={12} />
            </Link>
          </div>

          {docsLoading ? (
            <div className="glass-card p-8 flex items-center justify-center">
              <Loader2 className="text-lexnet-400 animate-spin" size={24} />
            </div>
          ) : recentDocs.length > 0 ? (
            <div className="space-y-2">
              {recentDocs.map((doc) => (
                <DocumentCard
                  key={doc.docHash}
                  docHash={doc.docHash}
                  docType={doc.docType}
                  ownerId={doc.ownerId}
                  riskScore={doc.riskScore}
                  activeDispute={doc.activeDispute}
                  createdAt={doc.createdAt}
                />
              ))}
            </div>
          ) : (
            <div className="glass-card p-8 text-center">
              <FileText className="mx-auto text-surface-200/15 mb-2" size={32} />
              <p className="text-sm text-surface-200/30">
                No documents found. Register your first document to get started.
              </p>
            </div>
          )}
        </div>

        {/* ---- Risk Alerts ---- */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-surface-200/60">Risk Alerts</h2>
            <Link
              to="/conflicts"
              className="text-xs text-risk-medium hover:text-risk-high flex items-center gap-1 transition-colors"
            >
              View all <ChevronRight size={12} />
            </Link>
          </div>

          {flaggedLoading ? (
            <div className="glass-card p-8 flex items-center justify-center">
              <Loader2 className="text-risk-medium animate-spin" size={24} />
            </div>
          ) : flaggedDocs.length > 0 ? (
            <div className="space-y-2">
              {flaggedDocs.map((flagged) => (
                <Link
                  key={flagged.document.docHash}
                  to={`/document/${flagged.document.docHash}`}
                  className="glass-card p-3 flex items-center gap-3 hover:border-risk-high/20 transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-risk-high/10 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="text-risk-high" size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-surface-200/50">
                        {truncateHash(flagged.document.docHash)}
                      </span>
                      <RiskBadge score={flagged.riskScore} size="sm" showScore={false} />
                    </div>
                    <p className="text-[10px] text-surface-200/30 mt-0.5 truncate">
                      {flagged.flags[0]?.description ?? formatDocType(flagged.document.docType)}
                    </p>
                  </div>
                  <span className="text-[10px] text-surface-200/20">
                    {formatRelativeTime(flagged.document.createdAt)}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="glass-card p-8 text-center">
              <ShieldAlert className="mx-auto text-surface-200/15 mb-2" size={32} />
              <p className="text-sm text-surface-200/30">
                No risk alerts at this time.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon,
  colour,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  colour: string;
}) {
  return (
    <div className="glass-card px-4 py-3 flex items-center gap-3">
      <div className={`${colour}`}>{icon}</div>
      <div>
        <p className="text-lg font-bold text-white">{value}</p>
        <p className="text-[10px] text-surface-200/30 uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}
