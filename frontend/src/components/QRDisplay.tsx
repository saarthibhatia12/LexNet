// ============================================================================
// LexNet Frontend — QRDisplay Component
// ============================================================================
//
// Renders a QR code using qrcode.react and provides:
//   - Visual card with the QR code
//   - Verification URL display
//   - Download button (PNG)
//   - Copy URL button
// ============================================================================

import { useState, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Copy, Check, ExternalLink } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QRDisplayProps {
  /** The full verification URL or raw data to encode */
  value: string;
  /** Document hash for display */
  docHash: string;
  /** Base64-encoded QR image from the backend (optional — fallback to client render) */
  qrBase64?: string;
  /** Size in pixels */
  size?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function QRDisplay({
  value,
  docHash,
  qrBase64,
  size = 200,
}: QRDisplayProps) {
  const [copied, setCopied] = useState(false);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  // ---- Copy URL to clipboard ----
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for insecure contexts
      const textarea = document.createElement('textarea');
      textarea.value = value;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [value]);

  // ---- Download as PNG ----
  const handleDownload = useCallback(() => {
    if (qrBase64) {
      // Download from backend-provided base64
      const link = document.createElement('a');
      link.href = `data:image/png;base64,${qrBase64}`;
      link.download = `lexnet-qr-${docHash.slice(0, 12)}.png`;
      link.click();
      return;
    }

    // Render SVG to canvas for PNG export
    const svgElement = svgContainerRef.current?.querySelector('svg');
    if (!svgElement) return;

    const canvas = document.createElement('canvas');
    const padding = 32;
    canvas.width = size + padding * 2;
    canvas.height = size + padding * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Serialize SVG to image
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, padding, padding, size, size);
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `lexnet-qr-${docHash.slice(0, 12)}.png`;
      link.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  }, [qrBase64, docHash, size]);

  return (
    <div className="glass-card overflow-hidden animate-scale-in" id="qr-display">
      {/* Header */}
      <div className="px-6 py-4 border-b border-surface-700/30 bg-accent-500/5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent-500 animate-pulse" />
          <h3 className="text-sm font-semibold text-white">
            Document Registered Successfully
          </h3>
        </div>
      </div>

      {/* QR code */}
      <div className="p-6 flex flex-col items-center">
        <div
          ref={svgContainerRef}
          className="p-4 bg-white rounded-xl shadow-lexnet mb-4"
          id="qr-code-container"
        >
          {qrBase64 ? (
            <img
              src={`data:image/png;base64,${qrBase64}`}
              alt="Document verification QR code"
              width={size}
              height={size}
              className="block"
            />
          ) : (
            <QRCodeSVG
              value={value}
              size={size}
              level="M"
              bgColor="#ffffff"
              fgColor="#0f1340"
              includeMargin={false}
            />
          )}
        </div>

        <p className="text-xs text-surface-200/30 text-center mb-4">
          Scan this QR code to verify the document
        </p>

        {/* Document hash */}
        <div className="w-full px-3 py-2 rounded-lg bg-surface-800/60 border border-surface-700/30 mb-4">
          <p className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-0.5">
            Document Hash
          </p>
          <p className="text-xs font-mono text-surface-200/60 break-all" id="qr-doc-hash">
            {docHash}
          </p>
        </div>

        {/* Verification URL */}
        <div className="w-full px-3 py-2 rounded-lg bg-surface-800/60 border border-surface-700/30 mb-4">
          <p className="text-[10px] text-surface-200/30 uppercase tracking-wider mb-0.5">
            Verification URL
          </p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-lexnet-400 break-all flex-1 min-w-0" id="qr-verification-url">
              {value}
            </p>
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 text-surface-200/30 hover:text-lexnet-400 transition-colors"
              aria-label="Open verification URL"
            >
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 w-full">
          <button
            type="button"
            onClick={handleDownload}
            className="btn-primary flex-1 text-sm"
            id="qr-download-btn"
          >
            <Download size={15} />
            Download QR
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="btn-secondary flex-1 text-sm"
            id="qr-copy-url-btn"
          >
            {copied ? (
              <>
                <Check size={15} />
                Copied!
              </>
            ) : (
              <>
                <Copy size={15} />
                Copy URL
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
