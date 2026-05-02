// ============================================================================
// LexNet Frontend — RiskBadge Component
// ============================================================================
//
// Colour-coded risk score badge:
//   0-30:  green  (low)
//   31-60: yellow (medium)
//   61-100: red   (high)
// ============================================================================

import { getRiskLevel } from '../utils/constants';
import { formatRiskScore } from '../utils/formatters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RiskBadgeProps {
  score: number;
  /** Show numeric value next to label */
  showScore?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const LEVEL_CONFIG = {
  low: {
    badgeClass: 'bg-risk-low/15 text-risk-low border-risk-low/30',
    label: 'Low',
    dotClass: 'bg-risk-low',
  },
  medium: {
    badgeClass: 'bg-risk-medium/15 text-risk-medium border-risk-medium/30',
    label: 'Medium',
    dotClass: 'bg-risk-medium',
  },
  high: {
    badgeClass: 'bg-risk-high/15 text-risk-high border-risk-high/30',
    label: 'High',
    dotClass: 'bg-risk-high',
  },
} as const;

const SIZE_CONFIG = {
  sm: 'px-1.5 py-0 text-[10px]',
  md: 'px-2.5 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RiskBadge({
  score,
  showScore = true,
  size = 'md',
}: RiskBadgeProps) {
  const level = getRiskLevel(score);
  const config = LEVEL_CONFIG[level];

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border uppercase tracking-wider
        ${config.badgeClass} ${SIZE_CONFIG[size]}`}
      id="risk-badge"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
      {showScore ? (
        <span>{formatRiskScore(score)} · {config.label}</span>
      ) : (
        <span>{config.label}</span>
      )}
    </span>
  );
}
