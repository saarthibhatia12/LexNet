// ============================================================================
// LexNet Frontend — TimelineItem Component
// ============================================================================
//
// Single event card in a chronological timeline.
// Shows: event type icon, description, actor, timestamp, connected doc hash.
// ============================================================================

import { Link } from 'react-router-dom';
import {
  FileText,
  ArrowRightLeft,
  ShieldAlert,
  ShieldCheck,
  Search,
  Brain,
  AlertTriangle,
  Circle,
} from 'lucide-react';
import { formatTimelineDate, formatEventType, truncateHash } from '../utils/formatters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimelineItemProps {
  id: string;
  eventType: string;
  timestamp: string;
  description: string;
  docHash?: string | null;
  actor?: string | null;
  isLast?: boolean;
}

// ---------------------------------------------------------------------------
// Event icon mapping
// ---------------------------------------------------------------------------

const EVENT_ICONS: Record<string, { icon: typeof FileText; colour: string }> = {
  REGISTERED: { icon: FileText, colour: 'text-lexnet-400 bg-lexnet-600/20' },
  TRANSFERRED: { icon: ArrowRightLeft, colour: 'text-accent-400 bg-accent-600/20' },
  DISPUTED: { icon: ShieldAlert, colour: 'text-risk-high bg-risk-high/15' },
  DISPUTE_RESOLVED: { icon: ShieldCheck, colour: 'text-risk-low bg-risk-low/15' },
  VERIFIED: { icon: Search, colour: 'text-violet-400 bg-violet-600/20' },
  NLP_PROCESSED: { icon: Brain, colour: 'text-amber-400 bg-amber-600/20' },
  RISK_UPDATED: { icon: AlertTriangle, colour: 'text-risk-medium bg-risk-medium/15' },
};

const DEFAULT_EVENT = { icon: Circle, colour: 'text-surface-200/40 bg-surface-700/40' };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TimelineItem({
  eventType,
  timestamp,
  description,
  docHash,
  actor,
  isLast = false,
}: TimelineItemProps) {
  const { date, time } = formatTimelineDate(timestamp);
  const eventConfig = EVENT_ICONS[eventType] ?? DEFAULT_EVENT;
  const EventIcon = eventConfig.icon;

  return (
    <div className="flex gap-4" id="timeline-item">
      {/* ---- Timeline track ---- */}
      <div className="flex flex-col items-center">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${eventConfig.colour}`}>
          <EventIcon size={16} />
        </div>
        {!isLast && (
          <div className="w-px flex-1 bg-surface-700/30 my-1" />
        )}
      </div>

      {/* ---- Event content ---- */}
      <div className="pb-6 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h4 className="text-sm font-medium text-surface-200/80">
            {formatEventType(eventType)}
          </h4>
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] text-surface-200/30">{date}</p>
            <p className="text-[10px] text-surface-200/20">{time}</p>
          </div>
        </div>

        <p className="text-xs text-surface-200/50 mb-2">
          {description}
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          {actor && (
            <span className="text-[10px] text-surface-200/30">
              by <span className="text-surface-200/50">{actor}</span>
            </span>
          )}
          {docHash && (
            <Link
              to={`/document/${docHash}`}
              className="text-[10px] font-mono text-lexnet-400/60 hover:text-lexnet-300 transition-colors"
            >
              {truncateHash(docHash, 8, 6)}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
