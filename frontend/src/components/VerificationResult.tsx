// ============================================================================
// LexNet Frontend — VerificationResult Component
// ============================================================================
//
// Displays the result of a document verification:
//   - Status badge: green AUTHENTIC / red TAMPERED / grey NOT REGISTERED / amber ERROR
//   - Document metadata table (when available)
//   - Risk score indicator
//   - Ownership info
// ============================================================================

import {
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  ShieldX,
  FileText,
  User,
  Calendar,
  Hash,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getRiskLevel } from '../utils/constants';

// ---------------------------------------------------------------------------
// Types — mirrors the GraphQL VerificationResult
// ---------------------------------------------------------------------------

interface DocumentMetadata {
  propertyId?: string | null;
  buyer?: string | null;
  seller?: string | null;
  value?: string | null;
}

interface DocumentData {
  docHash: string;
  ipfsCID: string;
  ownerId: string;
  deviceId: string;
  timestamp: string;
  docType: string;
  metadata?: DocumentMetadata | null;
  activeDispute: boolean;
  disputeCaseId?: string | null;
  riskScore: number;
  createdAt: string;
}

export interface VerificationData {
  status: 'AUTHENTIC' | 'TAMPERED' | 'NOT_REGISTERED' | 'ERROR';
  docHash: string;
  timestamp?: string | null;
  document?: DocumentData | null;
  message: string;
}

interface VerificationResultProps {
  data: VerificationData;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  AUTHENTIC: {
    icon: ShieldCheck,
    label: 'Authentic',
    badgeClass: 'bg-risk-low/15 text-risk-low border-risk-low/30',
    bgClass: 'from-risk-low/5 to-transparent',
    iconColour: 'text-risk-low',
    glowClass: 'shadow-[0_0_30px_rgba(34,197,94,0.15)]',
  },
  TAMPERED: {
    icon: ShieldX,
    label: 'Tampered',
    badgeClass: 'bg-risk-high/15 text-risk-high border-risk-high/30',
    bgClass: 'from-risk-high/5 to-transparent',
    iconColour: 'text-risk-high',
    glowClass: 'shadow-[0_0_30px_rgba(239,68,68,0.15)]',
  },
  NOT_REGISTERED: {
    icon: ShieldQuestion,
    label: 'Not Registered',
    badgeClass: 'bg-surface-200/10 text-surface-200/60 border-surface-200/20',
    bgClass: 'from-surface-200/5 to-transparent',
    iconColour: 'text-surface-200/50',
    glowClass: '',
  },
  ERROR: {
    icon: ShieldAlert,
    label: 'Error',
    badgeClass: 'bg-risk-medium/15 text-risk-medium border-risk-medium/30',
    bgClass: 'from-risk-medium/5 to-transparent',
    iconColour: 'text-risk-medium',
    glowClass: '',
  },
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VerificationResult({ data }: VerificationResultProps) {
  const config = STATUS_CONFIG[data.status];
  const StatusIcon = config.icon;
  const doc = data.document;

  return (
    <div className={`glass-card overflow-hidden animate-scale-in ${config.glowClass}`} id="verification-result">
      {/* ---- Status header ---- */}
      <div className={`bg-gradient-to-b ${config.bgClass} px-6 py-8 text-center border-b border-surface-700/30`}>
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-surface-800/80 border border-surface-700/30 mb-4`}>
          <StatusIcon className={config.iconColour} size={32} />
        </div>

        <div className="flex items-center justify-center gap-2 mb-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 text-sm font-semibold rounded-full border ${config.badgeClass}`}
            id="verification-status-badge"
          >
            <StatusIcon size={14} />
            {config.label}
          </span>
        </div>

        <p className="text-sm text-surface-200/50 max-w-md mx-auto mt-2" id="verification-message">
          {data.message}
        </p>
      </div>

      {/* ---- Document hash ---- */}
      <div className="px-6 py-4 border-b border-surface-700/20">
        <div className="flex items-start gap-3">
          <Hash className="text-surface-200/30 flex-shrink-0 mt-0.5" size={16} />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-surface-200/40 mb-0.5 uppercase tracking-wider font-medium">
              Document Hash
            </p>
            <p className="text-xs font-mono text-surface-200/70 break-all" id="verification-hash">
              {data.docHash}
            </p>
          </div>
        </div>
      </div>

      {/* ---- Document metadata (if available) ---- */}
      {doc && (
        <div className="px-6 py-5 space-y-4">
          {/* Key info grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MetaField
              icon={<FileText size={15} />}
              label="Document Type"
              value={formatDocType(doc.docType)}
              id="verification-doctype"
            />
            <MetaField
              icon={<User size={15} />}
              label="Owner"
              value={doc.ownerId}
              id="verification-owner"
            />
            <MetaField
              icon={<Calendar size={15} />}
              label="Registered"
              value={formatDate(doc.createdAt)}
              id="verification-date"
            />
            <MetaField
              icon={<RiskIndicator score={doc.riskScore} />}
              label="Risk Score"
              value={`${doc.riskScore.toFixed(1)} — ${getRiskLevel(doc.riskScore).toUpperCase()}`}
              id="verification-risk"
            />
          </div>

          {/* Dispute warning */}
          {doc.activeDispute && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-risk-medium/10 border border-risk-medium/20">
              <AlertTriangle className="text-risk-medium flex-shrink-0 mt-0.5" size={16} />
              <div>
                <p className="text-sm font-medium text-risk-medium">Active Dispute</p>
                <p className="text-xs text-risk-medium/70 mt-0.5">
                  Case ID: {doc.disputeCaseId ?? 'Unknown'}
                </p>
              </div>
            </div>
          )}

          {/* Metadata details */}
          {doc.metadata && (
            <div className="pt-3 border-t border-surface-700/20">
              <p className="text-xs text-surface-200/30 uppercase tracking-wider font-medium mb-3">
                Document Details
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {doc.metadata.propertyId && (
                  <DetailChip label="Property ID" value={doc.metadata.propertyId} />
                )}
                {doc.metadata.buyer && (
                  <DetailChip label="Buyer" value={doc.metadata.buyer} />
                )}
                {doc.metadata.seller && (
                  <DetailChip label="Seller" value={doc.metadata.seller} />
                )}
                {doc.metadata.value && (
                  <DetailChip label="Value" value={`₹ ${Number(doc.metadata.value).toLocaleString('en-IN')}`} />
                )}
              </div>
            </div>
          )}

          {/* IPFS link */}
          <div className="pt-3 border-t border-surface-700/20 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-surface-200/30">
              <span>IPFS CID:</span>
              <span className="font-mono text-surface-200/50 truncate max-w-[200px]">
                {doc.ipfsCID}
              </span>
            </div>
            <Link
              to={`/document/${doc.docHash}`}
              className="inline-flex items-center gap-1 text-xs text-lexnet-400 hover:text-lexnet-300 transition-colors font-medium"
            >
              Full Details
              <ExternalLink size={12} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetaField({
  icon,
  label,
  value,
  id,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  id: string;
}) {
  return (
    <div className="flex items-start gap-2.5" id={id}>
      <span className="text-surface-200/30 flex-shrink-0 mt-0.5">{icon}</span>
      <div>
        <p className="text-[11px] text-surface-200/30 uppercase tracking-wider">{label}</p>
        <p className="text-sm text-surface-200/80 font-medium">{value}</p>
      </div>
    </div>
  );
}

function DetailChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-surface-800/40 border border-surface-700/20">
      <p className="text-[10px] text-surface-200/30 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-surface-200/70 truncate">{value}</p>
    </div>
  );
}

function RiskIndicator({ score }: { score: number }) {
  const level = getRiskLevel(score);
  const colourMap = { low: 'bg-risk-low', medium: 'bg-risk-medium', high: 'bg-risk-high' };

  return (
    <span className={`inline-block w-3.5 h-3.5 rounded-full ${colourMap[level]}`} />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDocType(docType: string): string {
  return docType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
