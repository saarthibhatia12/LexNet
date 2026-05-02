// ============================================================================
// LexNet Frontend — Formatters
// ============================================================================
//
// Reusable display formatters for dates, hashes, risk scores, and values.
// ============================================================================

// ---------------------------------------------------------------------------
// Date / Time
// ---------------------------------------------------------------------------

/**
 * Format an ISO date string to a human-readable short form.
 * Example: "15 Mar 2024, 10:30"
 */
export function formatDate(iso: string): string {
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

/**
 * Format an ISO date string to a relative time (e.g. "3 hours ago").
 */
export function formatRelativeTime(iso: string): string {
  try {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffMs = now - then;

    if (diffMs < 0) return 'just now';

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return formatDate(iso);
  } catch {
    return iso;
  }
}

/**
 * Format date for timeline display.
 */
export function formatTimelineDate(iso: string): { date: string; time: string } {
  try {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    };
  } catch {
    return { date: iso, time: '' };
  }
}

// ---------------------------------------------------------------------------
// Hash
// ---------------------------------------------------------------------------

/**
 * Truncate a hash for display: "a1b2c3...x9y0z1"
 */
export function truncateHash(hash: string, headChars = 6, tailChars = 6): string {
  if (hash.length <= headChars + tailChars + 3) return hash;
  return `${hash.slice(0, headChars)}…${hash.slice(-tailChars)}`;
}

// ---------------------------------------------------------------------------
// Document Type
// ---------------------------------------------------------------------------

/**
 * Format a doc type slug to title case: "sale_deed" → "Sale Deed"
 */
export function formatDocType(docType: string): string {
  return docType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Risk Score
// ---------------------------------------------------------------------------

/**
 * Format risk score for display.
 */
export function formatRiskScore(score: number): string {
  return score.toFixed(1);
}

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

/**
 * Format a numeric string as Indian Rupees.
 */
export function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? Number(value) : value;
  if (isNaN(num)) return String(value);
  return `₹ ${num.toLocaleString('en-IN')}`;
}

// ---------------------------------------------------------------------------
// Event Type
// ---------------------------------------------------------------------------

/**
 * Format an event type to a human-readable label.
 */
export function formatEventType(eventType: string): string {
  const map: Record<string, string> = {
    REGISTERED: 'Document Registered',
    TRANSFERRED: 'Ownership Transferred',
    DISPUTED: 'Dispute Filed',
    DISPUTE_RESOLVED: 'Dispute Resolved',
    VERIFIED: 'Document Verified',
    NLP_PROCESSED: 'NLP Processing Complete',
    RISK_UPDATED: 'Risk Score Updated',
  };
  return map[eventType] ?? formatDocType(eventType);
}
