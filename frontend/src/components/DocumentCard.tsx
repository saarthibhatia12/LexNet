// ============================================================================
// LexNet Frontend — DocumentCard Component
// ============================================================================
//
// Document summary card for list views (dashboard, search results).
// Shows: doc type, owner, risk score badge, timestamp, dispute status.
// ============================================================================

import { Link } from 'react-router-dom';
import { FileText, AlertTriangle, ExternalLink } from 'lucide-react';
import RiskBadge from './RiskBadge';
import { formatDate, truncateHash, formatDocType } from '../utils/formatters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentCardProps {
  docHash: string;
  docType: string;
  ownerId: string;
  riskScore: number;
  activeDispute: boolean;
  createdAt: string;
  /** Optional click handler override (default navigates to /document/:hash) */
  onClick?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DocumentCard({
  docHash,
  docType,
  ownerId,
  riskScore,
  activeDispute,
  createdAt,
  onClick,
}: DocumentCardProps) {
  const content = (
    <div className="glass-card p-4 hover:border-lexnet-600/30 transition-all duration-200 group cursor-pointer">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="w-10 h-10 rounded-lg bg-lexnet-700/30 flex items-center justify-center flex-shrink-0 group-hover:bg-lexnet-700/50 transition-colors">
          <FileText className="text-lexnet-400" size={18} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-surface-200/80 group-hover:text-white transition-colors">
              {formatDocType(docType)}
            </span>
            {activeDispute && (
              <span className="inline-flex items-center gap-1 text-[10px] text-risk-medium">
                <AlertTriangle size={10} />
                Disputed
              </span>
            )}
          </div>

          <p className="text-xs font-mono text-surface-200/40 mb-2">
            {truncateHash(docHash)}
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            <RiskBadge score={riskScore} size="sm" />
            <span className="text-[10px] text-surface-200/25">
              Owner: {ownerId}
            </span>
            <span className="text-[10px] text-surface-200/20">
              {formatDate(createdAt)}
            </span>
          </div>
        </div>

        {/* Arrow */}
        <ExternalLink
          className="text-surface-200/15 group-hover:text-lexnet-400 transition-colors flex-shrink-0 mt-1"
          size={14}
        />
      </div>
    </div>
  );

  if (onClick) {
    return <button type="button" onClick={onClick} className="w-full text-left">{content}</button>;
  }

  return (
    <Link to={`/document/${docHash}`} className="block">
      {content}
    </Link>
  );
}
