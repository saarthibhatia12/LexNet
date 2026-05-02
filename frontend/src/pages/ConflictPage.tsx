// ============================================================================
// LexNet Frontend — Conflict Page
// ============================================================================
//
// Risk feed + flagged documents table:
//   - Polls every 30 seconds for new conflicts
//   - Sortable columns (risk score, date, type)
//   - Click row → DocumentDetailPage
//   - Risk score filter slider
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  Loader2,
  AlertTriangle,
  ArrowUpDown,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { GET_FLAGGED_DOCUMENTS } from '../graphql/queries';
import RiskBadge from '../components/RiskBadge';
import { formatDate, truncateHash, formatDocType } from '../utils/formatters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FlaggedDocument {
  document: {
    docHash: string;
    ipfsCID: string;
    ownerId: string;
    docType: string;
    timestamp: string;
    riskScore: number;
    activeDispute: boolean;
    createdAt: string;
  };
  riskScore: number;
  flags: Array<{
    type: string;
    severity: string;
    description: string;
    relatedDocHash: string | null;
  }>;
}

type SortField = 'riskScore' | 'createdAt' | 'docType';
type SortDir = 'asc' | 'desc';

const POLL_INTERVAL_MS = 30_000; // 30 seconds

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConflictPage() {
  const [minRisk, setMinRisk] = useState(0);
  const [sortField, setSortField] = useState<SortField>('riskScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // ---- Fetch flagged documents with polling ----
  const { data, loading, refetch, startPolling, stopPolling } = useQuery<{
    getFlaggedDocuments: FlaggedDocument[];
  }>(GET_FLAGGED_DOCUMENTS, {
    variables: { minRisk },
    fetchPolicy: 'cache-and-network',
  });

  // ---- Start/stop polling ----
  useEffect(() => {
    startPolling(POLL_INTERVAL_MS);
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  // ---- Sort toggle ----
  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('desc');
      }
    },
    [sortField],
  );

  // ---- Sort + filter data ----
  const flaggedDocs = [...(data?.getFlaggedDocuments ?? [])].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'riskScore':
        cmp = a.riskScore - b.riskScore;
        break;
      case 'createdAt':
        cmp = new Date(a.document.createdAt).getTime() - new Date(b.document.createdAt).getTime();
        break;
      case 'docType':
        cmp = a.document.docType.localeCompare(b.document.docType);
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <div className="page-section space-y-6">
      {/* ---- Header ---- */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2" id="conflict-heading">
            <ShieldAlert className="text-risk-medium" size={24} />
            Conflict Monitor
          </h1>
          <p className="text-surface-200/50 mt-1">
            Flagged documents with elevated risk scores. Auto-refreshes every 30 seconds.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="btn-secondary text-sm"
          disabled={loading}
          id="conflict-refresh"
        >
          <RefreshCw className={`${loading ? 'animate-spin' : ''}`} size={14} />
          Refresh
        </button>
      </div>

      {/* ---- Filter bar ---- */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-4">
          <label className="text-xs text-surface-200/40 flex-shrink-0">
            Min Risk Score
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={minRisk}
            onChange={(e) => setMinRisk(Number(e.target.value))}
            className="flex-1 h-1.5 rounded-full appearance-none bg-surface-700/40
                       accent-lexnet-500 cursor-pointer"
            id="conflict-risk-slider"
          />
          <span className="text-sm font-mono text-surface-200/60 w-8 text-right">
            {minRisk}
          </span>
        </div>
      </div>

      {/* ---- Table ---- */}
      {loading && !data ? (
        <div className="glass-card p-12 flex items-center justify-center">
          <Loader2 className="text-lexnet-400 animate-spin" size={32} />
        </div>
      ) : flaggedDocs.length > 0 ? (
        <div className="glass-card overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2.5 text-[10px] uppercase tracking-wider text-surface-200/30 border-b border-surface-700/30 bg-surface-800/30">
            <div className="col-span-3">Document</div>
            <div className="col-span-2">
              <SortButton label="Type" field="docType" current={sortField} dir={sortDir} onClick={toggleSort} />
            </div>
            <div className="col-span-2">
              <SortButton label="Risk" field="riskScore" current={sortField} dir={sortDir} onClick={toggleSort} />
            </div>
            <div className="col-span-2">Flags</div>
            <div className="col-span-2">
              <SortButton label="Date" field="createdAt" current={sortField} dir={sortDir} onClick={toggleSort} />
            </div>
            <div className="col-span-1" />
          </div>

          {/* Table rows */}
          {flaggedDocs.map((flagged) => (
            <Link
              key={flagged.document.docHash}
              to={`/document/${flagged.document.docHash}`}
              className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-surface-700/20 transition-colors group border-b border-surface-700/10 last:border-b-0"
            >
              <div className="col-span-3 flex items-center gap-2 min-w-0">
                <AlertTriangle
                  className={`flex-shrink-0 ${flagged.riskScore > 60 ? 'text-risk-high' : 'text-risk-medium'}`}
                  size={14}
                />
                <span className="text-xs font-mono text-surface-200/60 truncate">
                  {truncateHash(flagged.document.docHash)}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-xs text-surface-200/50">
                  {formatDocType(flagged.document.docType)}
                </span>
              </div>
              <div className="col-span-2">
                <RiskBadge score={flagged.riskScore} size="sm" />
              </div>
              <div className="col-span-2">
                <span className="text-[10px] text-surface-200/40">
                  {flagged.flags.length} flag{flagged.flags.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-[10px] text-surface-200/30">
                  {formatDate(flagged.document.createdAt)}
                </span>
              </div>
              <div className="col-span-1 text-right">
                <ChevronRight
                  className="text-surface-200/15 group-hover:text-lexnet-400 transition-colors inline"
                  size={14}
                />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="glass-card p-12 text-center">
          <ShieldAlert className="mx-auto text-surface-200/15 mb-3" size={40} />
          <p className="text-sm text-surface-200/30">
            {minRisk > 0
              ? `No documents with risk score above ${minRisk}.`
              : 'No flagged documents at this time.'}
          </p>
        </div>
      )}

      {/* ---- Count ---- */}
      {flaggedDocs.length > 0 && (
        <p className="text-xs text-surface-200/20 text-center">
          Showing {flaggedDocs.length} flagged document{flaggedDocs.length !== 1 ? 's' : ''}
          {minRisk > 0 ? ` with risk ≥ ${minRisk}` : ''}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SortButton({
  label,
  field,
  current,
  dir,
  onClick,
}: {
  label: string;
  field: SortField;
  current: SortField;
  dir: SortDir;
  onClick: (field: SortField) => void;
}) {
  const isActive = current === field;
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        onClick(field);
      }}
      className={`inline-flex items-center gap-1 ${isActive ? 'text-lexnet-400' : 'text-surface-200/30'} hover:text-surface-200/60 transition-colors`}
    >
      {label}
      <ArrowUpDown size={10} className={isActive ? (dir === 'asc' ? 'rotate-180' : '') : 'opacity-50'} />
    </button>
  );
}
