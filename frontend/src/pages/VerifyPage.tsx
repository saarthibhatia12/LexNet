// ============================================================================
// LexNet Frontend — Verify Page
// ============================================================================
//
// Public document verification page with two input methods:
//   1. Paste/type a SHA-256 hash
//   2. Upload a QR code image (decoded client-side with jsQR)
//
// Pre-fills from URL param `/verify/:hash`.
// Calls the `verifyDocument` GraphQL query and displays the result.
// ============================================================================

import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLazyQuery } from '@apollo/client';
import { VERIFY_DOCUMENT } from '../graphql/queries';
import VerificationResult from '../components/VerificationResult';
import type { VerificationData } from '../components/VerificationResult';
import {
  Shield,
  Search,
  Upload,
  Loader2,
  AlertTriangle,
  QrCode,
  X,
  Camera,
} from 'lucide-react';
import jsQR from 'jsqr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VerifyQueryData {
  verifyDocument: VerificationData;
}

interface VerifyQueryVars {
  docHash: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VerifyPage() {
  const { hash: urlHash } = useParams<{ hash?: string }>();
  const navigate = useNavigate();

  const [hashInput, setHashInput] = useState(urlHash ?? '');
  const [error, setError] = useState<string | null>(null);
  const [qrFileName, setQrFileName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'hash' | 'qr'>('hash');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ---- GraphQL lazy query ----
  const [executeVerify, { data, loading, called, error: queryError }] = useLazyQuery<
    VerifyQueryData,
    VerifyQueryVars
  >(VERIFY_DOCUMENT, {
    fetchPolicy: 'network-only',
  });

  // ---- Sync GraphQL errors to local state ----
  useEffect(() => {
    if (queryError) {
      setError(queryError.graphQLErrors?.[0]?.message ?? queryError.message ?? 'Verification failed');
    }
  }, [queryError]);

  // ---- Auto-verify if URL param present ----
  useEffect(() => {
    if (urlHash && isValidHash(urlHash)) {
      setHashInput(urlHash);
      executeVerify({ variables: { docHash: urlHash } });
    }
  }, [urlHash, executeVerify]);

  // ---- Submit hash ----
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const trimmed = hashInput.trim().toLowerCase();
      if (!trimmed) {
        setError('Please enter a document hash');
        return;
      }
      if (!isValidHash(trimmed)) {
        setError('Invalid hash format. Expected a 64-character hexadecimal SHA-256 hash.');
        return;
      }

      // Update the URL to reflect the hash being verified
      navigate(`/verify/${trimmed}`, { replace: true });
      executeVerify({ variables: { docHash: trimmed } });
    },
    [hashInput, executeVerify, navigate],
  );

  // ---- QR image upload ----
  const handleQrUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setError(null);
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        setError('Please upload an image file (PNG, JPG, etc.)');
        return;
      }

      setQrFileName(file.name);

      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          if (!canvas) return;

          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);

          const qrResult = jsQR(imageData.data, img.width, img.height);

          if (!qrResult) {
            setError('No QR code found in the uploaded image. Please try a clearer image.');
            return;
          }

          // Extract hash from QR data — supports full URL or raw hash
          const extractedHash = extractHashFromQr(qrResult.data);

          if (!extractedHash) {
            setError(
              `QR code decoded but contains unexpected data: "${qrResult.data.substring(0, 80)}…"`,
            );
            return;
          }

          setHashInput(extractedHash);
          setActiveTab('hash');
          navigate(`/verify/${extractedHash}`, { replace: true });
          executeVerify({ variables: { docHash: extractedHash } });
        };

        img.onerror = () => {
          setError('Failed to load the image. Please try a different file.');
        };

        img.src = reader.result as string;
      };

      reader.onerror = () => {
        setError('Failed to read the file.');
      };

      reader.readAsDataURL(file);
    },
    [executeVerify, navigate],
  );

  // ---- Clear state ----
  const handleClear = () => {
    setHashInput('');
    setError(null);
    setQrFileName(null);
    navigate('/verify', { replace: true });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const result = data?.verifyDocument ?? null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 sm:py-16 page-section">
      {/* Hidden canvas for QR decoding */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ---- Header ---- */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-accent shadow-glow-accent mb-4">
          <Shield className="text-white" size={32} />
        </div>
        <h1 className="text-2xl font-bold text-white" id="verify-heading">
          Document Verification
        </h1>
        <p className="mt-2 text-sm text-surface-200/50 max-w-md mx-auto">
          Verify the authenticity of any registered document by entering its hash or scanning a QR code.
        </p>
      </div>

      {/* ---- Input card ---- */}
      <div className="glass-card overflow-hidden mb-8">
        {/* Tab switcher */}
        <div className="flex border-b border-surface-700/30">
          <button
            onClick={() => setActiveTab('hash')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all duration-200
              ${activeTab === 'hash'
                ? 'text-white bg-surface-700/30 border-b-2 border-accent-500'
                : 'text-surface-200/40 hover:text-surface-200/70 hover:bg-surface-700/20'
              }`}
            id="verify-tab-hash"
          >
            <Search size={16} />
            Paste Hash
          </button>
          <button
            onClick={() => setActiveTab('qr')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all duration-200
              ${activeTab === 'qr'
                ? 'text-white bg-surface-700/30 border-b-2 border-accent-500'
                : 'text-surface-200/40 hover:text-surface-200/70 hover:bg-surface-700/20'
              }`}
            id="verify-tab-qr"
          >
            <QrCode size={16} />
            Upload QR
          </button>
        </div>

        <div className="p-6">
          {/* Error alert */}
          {error && (
            <div
              className="flex items-start gap-2.5 p-3 rounded-lg bg-risk-high/10 border border-risk-high/20 mb-5 animate-slide-down"
              role="alert"
              id="verify-error"
            >
              <AlertTriangle className="text-risk-high flex-shrink-0 mt-0.5" size={16} />
              <p className="text-sm text-risk-high">{error}</p>
            </div>
          )}

          {/* ---- Hash input tab ---- */}
          {activeTab === 'hash' && (
            <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
              <div>
                <label htmlFor="verify-hash-input" className="input-label">
                  Document Hash (SHA-256)
                </label>
                <div className="relative">
                  <input
                    id="verify-hash-input"
                    type="text"
                    className="input-field pl-10 pr-10 font-mono text-sm"
                    placeholder="e.g. a1b2c3d4e5f6..."
                    value={hashInput}
                    onChange={(e) => {
                      setHashInput(e.target.value);
                      setError(null);
                    }}
                    disabled={loading}
                    autoFocus
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-200/30"
                    size={18}
                  />
                  {hashInput && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-200/30 hover:text-surface-200/60 transition-colors"
                      aria-label="Clear input"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-surface-200/25 mt-1.5">
                  64-character hexadecimal string
                </p>
              </div>

              <button
                type="submit"
                className="btn-accent w-full"
                disabled={loading || !hashInput.trim()}
                id="verify-submit"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Verifying…
                  </>
                ) : (
                  <>
                    <Shield size={18} />
                    Verify Document
                  </>
                )}
              </button>
            </form>
          )}

          {/* ---- QR upload tab ---- */}
          {activeTab === 'qr' && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-sm text-surface-200/50">
                Upload an image containing a LexNet QR code. The hash will be extracted and verified automatically.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleQrUpload}
                className="hidden"
                id="verify-qr-file-input"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="w-full group"
                id="verify-qr-upload-btn"
              >
                <div className="border-2 border-dashed border-surface-700/50 rounded-lexnet p-8
                                hover:border-accent-500/40 hover:bg-accent-500/5
                                transition-all duration-300 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-surface-700/40 mb-3
                                  group-hover:bg-accent-500/10 transition-colors duration-300">
                    {loading ? (
                      <Loader2 className="animate-spin text-surface-200/40" size={24} />
                    ) : (
                      <Camera className="text-surface-200/30 group-hover:text-accent-400 transition-colors duration-300" size={24} />
                    )}
                  </div>
                  <p className="text-sm font-medium text-surface-200/60 group-hover:text-surface-200/80 transition-colors">
                    {qrFileName
                      ? qrFileName
                      : 'Click to upload QR code image'}
                  </p>
                  <p className="text-xs text-surface-200/25 mt-1">
                    PNG, JPG, or WebP
                  </p>
                </div>
              </button>

              {qrFileName && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="w-full btn-secondary text-sm"
                >
                  <X size={14} />
                  Clear & Upload Again
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---- Result ---- */}
      {called && !loading && result && (
        <VerificationResult data={result} />
      )}

      {/* ---- Loading skeleton ---- */}
      {loading && (
        <div className="glass-card p-8 animate-pulse">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-surface-700/40" />
            <div className="w-32 h-6 rounded-full bg-surface-700/40" />
            <div className="w-64 h-4 rounded bg-surface-700/30" />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate a SHA-256 hash string (64 hex chars).
 */
function isValidHash(hash: string): boolean {
  return /^[a-fA-F0-9]{64}$/.test(hash);
}

/**
 * Extract a SHA-256 hash from QR code data.
 * Supports:
 *   - Raw 64-char hex hash
 *   - URL containing /verify/<hash>
 *   - URL with ?hash=<hash> query param
 */
function extractHashFromQr(data: string): string | null {
  const trimmed = data.trim();

  // Raw hash
  if (isValidHash(trimmed)) {
    return trimmed.toLowerCase();
  }

  // URL with /verify/<hash>
  const verifyMatch = trimmed.match(/\/verify\/([a-fA-F0-9]{64})/);
  if (verifyMatch) {
    return verifyMatch[1].toLowerCase();
  }

  // URL with ?hash=<hash>
  try {
    const url = new URL(trimmed);
    const hashParam = url.searchParams.get('hash');
    if (hashParam && isValidHash(hashParam)) {
      return hashParam.toLowerCase();
    }
  } catch {
    // Not a valid URL, ignore
  }

  return null;
}
