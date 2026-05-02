// ============================================================================
// LexNet Frontend — Document Detail Page
// ============================================================================
//
// Full document metadata view:
//   - Blockchain record (hash, IPFS CID, owner, device, timestamps)
//   - Metadata (property, buyer, seller, value)
//   - Risk score + flags
//   - Dispute status
//   - Document history / events
//   - Quick links (verify, graph, timeline)
// ============================================================================

import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import {
  FileText,
  Loader2,
  AlertTriangle,
  Shield,
  Network,
  Clock,
  Copy,
  Check,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Hash,
} from 'lucide-react';
import { useState, useCallback } from 'react';
import { GET_DOCUMENT, GET_DOCUMENT_EVENTS, GET_RISK_SCORE } from '../graphql/queries';
import RiskBadge from '../components/RiskBadge';
import TimelineItem from '../components/TimelineItem';
import { formatDate, truncateHash, formatDocType, formatCurrency } from '../utils/formatters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentMeta {
  propertyId: string | null;
  buyer: string | null;
  seller: string | null;
  value: string | null;
}

interface Document {
  docHash: string;
  ipfsCID: string;
  ownerId: string;
  deviceId: string;
  timestamp: string;
  docType: string;
  metadata: DocumentMeta | null;
  activeDispute: boolean;
  disputeCaseId: string | null;
  riskScore: number;
  createdAt: string;
}

interface RiskFlag {
  type: string;
  severity: string;
  description: string;
  relatedDocHash: string | null;
}

interface RiskData {
  docHash: string;
  riskScore: number;
  flags: RiskFlag[];
  assessedAt: string;
}

interface TimelineEvent {
  id: string;
  eventType: string;
  timestamp: string;
  description: string;
  docHash: string | null;
  actor: string | null;
  metadata: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DocumentDetailPage() {
  const { hash } = useParams<{ hash: string }>();
  const [copied, setCopied] = useState<string | null>(null);

  // ---- Fetch document ----
  const { data: docData, loading: docLoading, error: docError } = useQuery<{
    getDocument: Document;
  }>(GET_DOCUMENT, {
    variables: { docHash: hash ?? '' },
    skip: !hash,
  });

  // ---- Fetch risk score ----
  const { data: riskData } = useQuery<{
    getRiskScore: RiskData;
  }>(GET_RISK_SCORE, {
    variables: { docHash: hash ?? '' },
    skip: !hash,
  });

  // ---- Fetch events ----
  const { data: eventsData, loading: eventsLoading } = useQuery<{
    getDocumentEvents: TimelineEvent[];
  }>(GET_DOCUMENT_EVENTS, {
    variables: { docHash: hash ?? '' },
    skip: !hash,
  });

  // ---- Copy helper ----
  const handleCopy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const doc = docData?.getDocument;
  const risk = riskData?.getRiskScore;
  const events = eventsData?.getDocumentEvents ?? [];

  // ---- Loading ----
  if (docLoading) {
    return (
      <div className="page-section max-w-4xl mx-auto flex items-center justify-center py-24">
        <Loader2 className="text-lexnet-400 animate-spin" size={36} />
      </div>
    );
  }

  // ---- Error ----
  if (docError || !doc) {
    return (
      <div className="page-section max-w-4xl mx-auto space-y-4">
        <div className="flex items-start gap-2.5 p-4 rounded-lg bg-risk-high/10 border border-risk-high/20">
          <AlertTriangle className="text-risk-high flex-shrink-0 mt-0.5" size={18} />
          <div>
            <p className="text-sm font-medium text-risk-high">Document Not Found</p>
            <p className="text-xs text-risk-high/60 mt-1">
              {docError?.message ?? `No document found with hash: ${hash}`}
            </p>
          </div>
        </div>
        <Link to="/verify" className="btn-secondary text-sm inline-flex">
          <Shield size={14} /> Try Verifying
        </Link>
      </div>
    );
  }

  return (
    <div className="page-section max-w-4xl mx-auto space-y-6">
      {/* ---- Header ---- */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="text-lexnet-400" size={20} />
            <h1 className="text-xl font-bold text-white" id="document-detail-heading">
              {formatDocType(doc.docType)}
            </h1>
            {doc.activeDispute && (
              <span className="badge bg-risk-high/15 text-risk-high border border-risk-high/30 text-[10px]">
                <ShieldAlert size={10} />
                Dispute Active
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-surface-200/40 break-all">
            {doc.docHash}
          </p>
        </div>
        <RiskBadge score={doc.riskScore} size="lg" />
      </div>

      {/* ---- Quick actions ---- */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link to={`/verify/${doc.docHash}`} className="btn-secondary text-xs">
          <Shield size={13} /> Verify
        </Link>
        <Link to={`/graph`} className="btn-secondary text-xs">
          <Network size={13} /> Graph
        </Link>
        {doc.metadata?.propertyId && (
          <Link to={`/timeline/${doc.metadata.propertyId}`} className="btn-secondary text-xs">
            <Clock size={13} /> Timeline
          </Link>
        )}
      </div>

      {/* ---- Two-column details ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ---- Blockchain Record ---- */}
        <div className="glass-card p-5 space-y-3">
          <h2 className="text-xs text-surface-200/30 uppercase tracking-wider font-medium mb-2">
            Blockchain Record
          </h2>

          <DetailField label="Document Hash" value={doc.docHash} mono copyable onCopy={handleCopy} copiedLabel={copied} />
          <DetailField label="IPFS CID" value={doc.ipfsCID} mono copyable onCopy={handleCopy} copiedLabel={copied} />
          <DetailField label="Owner ID" value={doc.ownerId} />
          <DetailField label="Device ID" value={doc.deviceId} mono />
          <DetailField label="Document Type" value={formatDocType(doc.docType)} />
          <DetailField label="Registered" value={formatDate(doc.createdAt)} />
          <DetailField label="Timestamp" value={formatDate(doc.timestamp)} />
        </div>

        {/* ---- Metadata ---- */}
        <div className="space-y-4">
          {/* Property metadata */}
          {doc.metadata && (
            <div className="glass-card p-5 space-y-3">
              <h2 className="text-xs text-surface-200/30 uppercase tracking-wider font-medium mb-2">
                Document Metadata
              </h2>
              {doc.metadata.propertyId && (
                <DetailField
                  label="Property ID"
                  value={doc.metadata.propertyId}
                  link={`/timeline/${doc.metadata.propertyId}`}
                />
              )}
              {doc.metadata.buyer && <DetailField label="Buyer" value={doc.metadata.buyer} />}
              {doc.metadata.seller && <DetailField label="Seller" value={doc.metadata.seller} />}
              {doc.metadata.value && <DetailField label="Value" value={formatCurrency(doc.metadata.value)} />}
            </div>
          )}

          {/* Dispute info */}
          {doc.activeDispute && doc.disputeCaseId && (
            <div className="glass-card p-5 border-risk-high/20">
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="text-risk-high" size={16} />
                <h2 className="text-xs text-risk-high uppercase tracking-wider font-medium">
                  Active Dispute
                </h2>
              </div>
              <DetailField label="Case ID" value={doc.disputeCaseId} mono />
            </div>
          )}

          {!doc.activeDispute && (
            <div className="glass-card p-4 flex items-center gap-2">
              <ShieldCheck className="text-risk-low" size={16} />
              <p className="text-xs text-risk-low">No active disputes on this document.</p>
            </div>
          )}
        </div>
      </div>

      {/* ---- Risk Flags ---- */}
      {risk && risk.flags.length > 0 && (
        <div className="glass-card p-5">
          <h2 className="text-xs text-surface-200/30 uppercase tracking-wider font-medium mb-3 flex items-center gap-2">
            <AlertTriangle className="text-risk-medium" size={14} />
            Risk Flags ({risk.flags.length})
          </h2>
          <div className="space-y-2">
            {risk.flags.map((flag, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border
                  ${flag.severity === 'high'
                    ? 'bg-risk-high/5 border-risk-high/15'
                    : flag.severity === 'medium'
                    ? 'bg-risk-medium/5 border-risk-medium/15'
                    : 'bg-surface-700/20 border-surface-700/20'
                  }`}
              >
                <span
                  className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0
                    ${flag.severity === 'high' ? 'bg-risk-high' : flag.severity === 'medium' ? 'bg-risk-medium' : 'bg-risk-low'}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-surface-200/70">{flag.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] text-surface-200/25 uppercase">{flag.type}</span>
                    {flag.relatedDocHash && (
                      <Link
                        to={`/document/${flag.relatedDocHash}`}
                        className="text-[9px] font-mono text-lexnet-400/50 hover:text-lexnet-300 transition-colors"
                      >
                        {truncateHash(flag.relatedDocHash, 6, 4)}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-surface-200/20 mt-2">
            Assessed: {formatDate(risk.assessedAt)}
          </p>
        </div>
      )}

      {/* ---- Document Events ---- */}
      <div>
        <h2 className="text-sm font-semibold text-surface-200/60 mb-3 flex items-center gap-2">
          <Clock className="text-accent-400" size={16} />
          Document History
        </h2>

        {eventsLoading ? (
          <div className="glass-card p-8 flex items-center justify-center">
            <Loader2 className="text-accent-400 animate-spin" size={24} />
          </div>
        ) : events.length > 0 ? (
          <div className="glass-card p-6">
            {events.map((event, idx) => (
              <TimelineItem
                key={event.id}
                id={event.id}
                eventType={event.eventType}
                timestamp={event.timestamp}
                description={event.description}
                docHash={event.docHash}
                actor={event.actor}
                isLast={idx === events.length - 1}
              />
            ))}
          </div>
        ) : (
          <div className="glass-card p-8 text-center">
            <Clock className="mx-auto text-surface-200/15 mb-2" size={28} />
            <p className="text-xs text-surface-200/25">No events recorded for this document.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DetailField({
  label,
  value,
  mono = false,
  copyable = false,
  link,
  onCopy,
  copiedLabel,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
  link?: string;
  onCopy?: (text: string, label: string) => void;
  copiedLabel?: string | null;
}) {
  const isCopied = copiedLabel === label;

  return (
    <div className="flex items-start justify-between gap-2 py-1.5">
      <span className="text-[10px] text-surface-200/30 uppercase tracking-wider min-w-[90px] pt-0.5 flex-shrink-0">
        {label}
      </span>
      <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
        {link ? (
          <Link
            to={link}
            className={`text-sm text-lexnet-400 hover:text-lexnet-300 transition-colors truncate ${mono ? 'font-mono' : ''}`}
          >
            {value}
            <ExternalLink size={10} className="inline ml-1 opacity-50" />
          </Link>
        ) : (
          <span className={`text-sm text-surface-200/70 break-all text-right ${mono ? 'font-mono text-xs' : ''}`}>
            {value}
          </span>
        )}
        {copyable && onCopy && (
          <button
            onClick={() => onCopy(value, label)}
            className="flex-shrink-0 p-0.5 text-surface-200/20 hover:text-lexnet-400 transition-colors"
            aria-label={`Copy ${label}`}
          >
            {isCopied ? <Check size={12} className="text-risk-low" /> : <Copy size={12} />}
          </button>
        )}
      </div>
    </div>
  );
}
