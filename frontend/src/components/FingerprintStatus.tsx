// ============================================================================
// LexNet Frontend — FingerprintStatus Component
// ============================================================================
//
// STM32 fingerprint authentication status indicator.
// Shows three states with animations:
//   - idle:     Waiting for user to initiate
//   - waiting:  Polling for STM32 scan result (pulsing animation)
//   - success:  Authenticated (green check with glow)
//   - failed:   Authentication failed (red X with shake)
// ============================================================================

import { Fingerprint, Check, X, Loader2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FingerprintState = 'idle' | 'waiting' | 'success' | 'failed';

interface FingerprintStatusProps {
  state: FingerprintState;
  onAuthenticate: () => void;
  onRetry?: () => void;
  disabled?: boolean;
  message?: string;
}

// ---------------------------------------------------------------------------
// State config
// ---------------------------------------------------------------------------

const STATE_CONFIG = {
  idle: {
    containerClass: 'border-surface-700/50',
    iconBgClass: 'bg-surface-700/40',
    iconClass: 'text-surface-200/40',
    label: 'Fingerprint Authentication',
    description: 'Click to authenticate with your STM32 biometric device.',
  },
  waiting: {
    containerClass: 'border-lexnet-500/30 animate-pulse-glow',
    iconBgClass: 'bg-lexnet-600/20',
    iconClass: 'text-lexnet-400',
    label: 'Waiting for Scan…',
    description: 'Place your finger on the biometric sensor.',
  },
  success: {
    containerClass: 'border-risk-low/30 shadow-[0_0_20px_rgba(34,197,94,0.15)]',
    iconBgClass: 'bg-risk-low/15',
    iconClass: 'text-risk-low',
    label: 'Authenticated',
    description: 'Biometric identity verified successfully.',
  },
  failed: {
    containerClass: 'border-risk-high/30',
    iconBgClass: 'bg-risk-high/15',
    iconClass: 'text-risk-high',
    label: 'Authentication Failed',
    description: 'Fingerprint not recognised. Please try again.',
  },
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FingerprintStatus({
  state,
  onAuthenticate,
  onRetry,
  disabled = false,
  message,
}: FingerprintStatusProps) {
  const config = STATE_CONFIG[state];

  return (
    <div
      className={`glass-card border ${config.containerClass} p-5 transition-all duration-500`}
      id="fingerprint-status"
    >
      <div className="flex items-center gap-4">
        {/* Icon */}
        <div
          className={`w-14 h-14 rounded-xl ${config.iconBgClass} flex items-center justify-center flex-shrink-0 transition-all duration-500`}
        >
          {state === 'waiting' ? (
            <Loader2 className={`${config.iconClass} animate-spin`} size={28} />
          ) : state === 'success' ? (
            <Check className={config.iconClass} size={28} />
          ) : state === 'failed' ? (
            <X className={config.iconClass} size={28} />
          ) : (
            <Fingerprint className={config.iconClass} size={28} />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-semibold ${
              state === 'success'
                ? 'text-risk-low'
                : state === 'failed'
                ? 'text-risk-high'
                : 'text-surface-200/80'
            }`}
            id="fingerprint-label"
          >
            {config.label}
          </p>
          <p className="text-xs text-surface-200/40 mt-0.5" id="fingerprint-description">
            {message ?? config.description}
          </p>
        </div>

        {/* Action button */}
        <div className="flex-shrink-0">
          {state === 'idle' && (
            <button
              type="button"
              onClick={onAuthenticate}
              disabled={disabled}
              className="btn-primary text-sm"
              id="fingerprint-authenticate-btn"
            >
              <Fingerprint size={16} />
              Authenticate
            </button>
          )}

          {state === 'waiting' && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-lexnet-900/40 border border-lexnet-600/20">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-lexnet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-lexnet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-lexnet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-lexnet-300">Scanning</span>
            </div>
          )}

          {state === 'success' && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-risk-low/10 border border-risk-low/20">
              <Check className="text-risk-low" size={14} />
              <span className="text-xs font-medium text-risk-low">Verified</span>
            </div>
          )}

          {state === 'failed' && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={disabled}
              className="btn-secondary text-sm"
              id="fingerprint-retry-btn"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      {/* Animated underline for waiting state */}
      {state === 'waiting' && (
        <div className="mt-4 w-full h-0.5 rounded-full bg-surface-700/30 overflow-hidden">
          <div className="h-full w-1/3 rounded-full bg-lexnet-500 animate-[slide-right_1.5s_ease-in-out_infinite]"
               style={{ animation: 'slide-right 1.5s ease-in-out infinite' }} />
        </div>
      )}
    </div>
  );
}
