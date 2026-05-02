// ============================================================================
// LexNet Frontend — Timeline Page
// ============================================================================
//
// Chronological event timeline for a property:
//   - Loads from URL param :propertyId
//   - Shows all events in vertical timeline format
//   - Input to search by property ID
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import {
  Clock,
  Loader2,
  AlertTriangle,
  Search,
  Building,
} from 'lucide-react';
import { GET_PROPERTY_TIMELINE } from '../graphql/queries';
import TimelineItem from '../components/TimelineItem';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimelineEvent {
  id: string;
  eventType: string;
  timestamp: string;
  description: string;
  docHash: string | null;
  actor: string | null;
  metadata: Record<string, unknown> | null;
}

interface TimelineData {
  getPropertyTimeline: {
    propertyId: string;
    events: TimelineEvent[];
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TimelinePage() {
  const { propertyId: urlPropId } = useParams<{ propertyId?: string }>();
  const navigate = useNavigate();
  const [propertyInput, setPropertyInput] = useState(urlPropId ?? '');

  // ---- Fetch timeline ----
  const { data, loading, error } = useQuery<TimelineData>(GET_PROPERTY_TIMELINE, {
    variables: { propertyId: urlPropId ?? '' },
    skip: !urlPropId,
    fetchPolicy: 'cache-and-network',
  });

  // ---- Sync URL param to input ----
  useEffect(() => {
    if (urlPropId) setPropertyInput(urlPropId);
  }, [urlPropId]);

  // ---- Search handler ----
  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = propertyInput.trim();
      if (trimmed) {
        navigate(`/timeline/${trimmed}`);
      }
    },
    [propertyInput, navigate],
  );

  const events = data?.getPropertyTimeline?.events ?? [];

  return (
    <div className="page-section max-w-3xl mx-auto space-y-6">
      {/* ---- Header ---- */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2" id="timeline-heading">
          <Clock className="text-accent-400" size={24} />
          Property Timeline
        </h1>
        <p className="text-surface-200/50 mt-1">
          View the chronological history of events for a registered property.
        </p>
      </div>

      {/* ---- Property search ---- */}
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            className="input-field pl-10 text-sm"
            placeholder="Enter Property ID (e.g. PROP_KA_BLR_001)…"
            value={propertyInput}
            onChange={(e) => setPropertyInput(e.target.value)}
            id="timeline-property-input"
          />
          <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-200/30" size={16} />
        </div>
        <button
          type="submit"
          className="btn-primary text-sm"
          disabled={!propertyInput.trim() || loading}
          id="timeline-search-btn"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
          Search
        </button>
      </form>

      {/* ---- Error ---- */}
      {error && (
        <div
          className="flex items-start gap-2.5 p-3 rounded-lg bg-risk-high/10 border border-risk-high/20 animate-slide-down"
          role="alert"
        >
          <AlertTriangle className="text-risk-high flex-shrink-0 mt-0.5" size={16} />
          <p className="text-sm text-risk-high">{error.message}</p>
        </div>
      )}

      {/* ---- Loading ---- */}
      {loading && (
        <div className="glass-card p-12 flex items-center justify-center">
          <Loader2 className="text-accent-400 animate-spin" size={32} />
        </div>
      )}

      {/* ---- Timeline ---- */}
      {!loading && urlPropId && events.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-surface-200/30 uppercase tracking-wider">
              Property
            </span>
            <span className="text-sm font-mono text-accent-400">
              {data?.getPropertyTimeline?.propertyId}
            </span>
            <span className="text-xs text-surface-200/20">
              · {events.length} event{events.length !== 1 ? 's' : ''}
            </span>
          </div>

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
        </div>
      )}

      {/* ---- Empty state ---- */}
      {!loading && urlPropId && events.length === 0 && !error && (
        <div className="glass-card p-12 text-center">
          <Clock className="mx-auto text-surface-200/15 mb-3" size={40} />
          <p className="text-sm text-surface-200/30">
            No events found for property <span className="font-mono text-surface-200/50">{urlPropId}</span>.
          </p>
        </div>
      )}

      {/* ---- No search yet ---- */}
      {!urlPropId && !loading && (
        <div className="glass-card p-12 text-center">
          <Building className="mx-auto text-surface-200/15 mb-3" size={40} />
          <p className="text-sm text-surface-200/30">
            Enter a Property ID above to view its event history.
          </p>
        </div>
      )}
    </div>
  );
}
