// ============================================================================
// LexNet Frontend — FileUpload Component
// ============================================================================
//
// Drag-and-drop file upload with:
//   - Visual drop zone with hover/active states
//   - Progress bar during upload
//   - File type validation (PDF only)
//   - Size validation (reject >50MB client-side)
//   - File preview after selection
// ============================================================================

import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, X, AlertTriangle } from 'lucide-react';
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, ACCEPTED_FILE_TYPES } from '../utils/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  onFileRemove: () => void;
  selectedFile: File | null;
  disabled?: boolean;
  progress?: number; // 0-100
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FileUpload({
  onFileSelect,
  onFileRemove,
  selectedFile,
  disabled = false,
  progress,
}: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    if (!ACCEPTED_FILE_TYPES.includes(file.type as typeof ACCEPTED_FILE_TYPES[number])) {
      return `Invalid file type: ${file.type || 'unknown'}. Only PDF files are accepted.`;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return `File too large (${sizeMB} MB). Maximum size is ${MAX_FILE_SIZE_MB} MB.`;
    }
    return null;
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      onFileSelect(file);
    },
    [validateFile, onFileSelect],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (disabled) return;

      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [disabled, handleFile],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragOver(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleRemove = useCallback(() => {
    setError(null);
    onFileRemove();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [onFileRemove]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isUploading = progress !== undefined && progress > 0 && progress < 100;

  return (
    <div className="space-y-3" id="file-upload-container">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleInputChange}
        className="hidden"
        id="file-upload-input"
        disabled={disabled}
      />

      {/* Error display */}
      {error && (
        <div
          className="flex items-start gap-2.5 p-3 rounded-lg bg-risk-high/10 border border-risk-high/20 animate-slide-down"
          role="alert"
          id="file-upload-error"
        >
          <AlertTriangle className="text-risk-high flex-shrink-0 mt-0.5" size={16} />
          <p className="text-sm text-risk-high">{error}</p>
        </div>
      )}

      {selectedFile ? (
        /* ---- File selected state ---- */
        <div className="glass-card p-4 animate-scale-in" id="file-upload-preview">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-lexnet-700/40 flex items-center justify-center flex-shrink-0">
              <FileText className="text-lexnet-400" size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-surface-200/80 truncate">
                {selectedFile.name}
              </p>
              <p className="text-xs text-surface-200/40">
                {formatFileSize(selectedFile.size)} · PDF
              </p>
            </div>
            {!disabled && !isUploading && (
              <button
                type="button"
                onClick={handleRemove}
                className="p-1.5 rounded-lg text-surface-200/30 hover:text-risk-high hover:bg-risk-high/10 transition-all duration-200"
                aria-label="Remove file"
                id="file-upload-remove"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Progress bar */}
          {isUploading && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-surface-200/40">Uploading…</span>
                <span className="text-xs text-lexnet-400 font-medium">{progress}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-surface-700/40 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-lexnet-600 to-accent-500 transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ---- Drop zone ---- */
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          disabled={disabled}
          className="w-full group"
          id="file-upload-dropzone"
        >
          <div
            className={`border-2 border-dashed rounded-lexnet p-8 text-center transition-all duration-300
              ${isDragOver
                ? 'border-accent-500 bg-accent-500/10 scale-[1.02]'
                : 'border-surface-700/50 hover:border-lexnet-500/40 hover:bg-lexnet-900/20'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div
              className={`inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3 transition-all duration-300
                ${isDragOver
                  ? 'bg-accent-500/20'
                  : 'bg-surface-700/40 group-hover:bg-lexnet-700/30'
                }`}
            >
              <Upload
                className={`transition-colors duration-300 ${
                  isDragOver
                    ? 'text-accent-400'
                    : 'text-surface-200/30 group-hover:text-lexnet-400'
                }`}
                size={24}
              />
            </div>
            <p className="text-sm font-medium text-surface-200/60 group-hover:text-surface-200/80 transition-colors">
              {isDragOver ? 'Drop your PDF here' : 'Drag & drop a PDF or click to browse'}
            </p>
            <p className="text-xs text-surface-200/25 mt-1">
              PDF files only · Max {MAX_FILE_SIZE_MB} MB
            </p>
          </div>
        </button>
      )}
    </div>
  );
}
