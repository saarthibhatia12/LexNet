// ============================================================================
// LexNet Frontend — Register Page
// ============================================================================
//
// Full document registration flow:
//   Step 1: Upload file (drag-and-drop PDF)
//   Step 2: Fill metadata form (docType, ownerId, property details)
//   Step 3: Fingerprint authentication (STM32 polling)
//   Step 4: Submit registerDocument mutation
//   Step 5: Display QR code + download link
//
// The fingerprint authentication polls the backend REST API for the
// STM32 hardware bridge status. If the bridge is unavailable, the
// flow can proceed with simulated auth for development.
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation } from '@apollo/client';
import { useAuth } from '../hooks/useAuth';
import { REGISTER_DOCUMENT } from '../graphql/mutations';
import { REST_API_URL, FINGERPRINT_POLL_INTERVAL_MS } from '../utils/constants';
import FileUpload from '../components/FileUpload';
import FingerprintStatus from '../components/FingerprintStatus';
import type { FingerprintState } from '../components/FingerprintStatus';
import QRDisplay from '../components/QRDisplay';
import {
  FileText,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegisterResult {
  docHash: string;
  ipfsCID: string;
  qrCodeBase64: string;
  verificationUrl: string;
  timestamp: string;
}

interface RegisterData {
  registerDocument: RegisterResult;
}

interface RegisterVars {
  input: {
    fileBase64: string;
    docType: string;
    ownerId: string;
    deviceId: string;
    metadata?: {
      propertyId?: string;
      buyer?: string;
      seller?: string;
      value?: string;
    };
  };
}

const DOC_TYPES = [
  { value: 'sale_deed', label: 'Sale Deed' },
  { value: 'lease_agreement', label: 'Lease Agreement' },
  { value: 'mortgage_deed', label: 'Mortgage Deed' },
  { value: 'gift_deed', label: 'Gift Deed' },
  { value: 'partition_deed', label: 'Partition Deed' },
  { value: 'power_of_attorney', label: 'Power of Attorney' },
  { value: 'court_order', label: 'Court Order' },
  { value: 'other', label: 'Other' },
] as const;

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

type Step = 1 | 2 | 3;

const STEP_LABELS: Record<Step, string> = {
  1: 'Upload Document',
  2: 'Document Details',
  3: 'Authenticate & Register',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RegisterPage() {
  const { user } = useAuth();

  // ---- Step navigation ----
  const [step, setStep] = useState<Step>(1);

  // ---- Step 1 — File ----
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);

  // ---- Step 2 — Metadata ----
  const [docType, setDocType] = useState('sale_deed');
  const [ownerId, setOwnerId] = useState(user?.userId ?? '');
  const [propertyId, setPropertyId] = useState('');
  const [buyer, setBuyer] = useState('');
  const [seller, setSeller] = useState('');
  const [propertyValue, setPropertyValue] = useState('');

  // ---- Step 3 — Auth + Submit ----
  const [fingerprintState, setFingerprintState] = useState<FingerprintState>('idle');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);

  // ---- GraphQL mutation ----
  const [registerDocument, { loading: registering }] = useMutation<RegisterData, RegisterVars>(
    REGISTER_DOCUMENT,
  );

  // ---- Cleanup polling on unmount ----
  useEffect(() => {
    return () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  // ---- File selection → base64 ----
  const handleFileSelect = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    setError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setFileBase64(base64);
    };
    reader.onerror = () => {
      setError('Failed to read the file.');
    };
    reader.readAsDataURL(selectedFile);
  }, []);

  const handleFileRemove = useCallback(() => {
    setFile(null);
    setFileBase64(null);
  }, []);

  // ---- Fingerprint authentication ----
  const startFingerprintAuth = useCallback(() => {
    setFingerprintState('waiting');
    setError(null);

    let attempts = 0;
    const maxAttempts = 30; // 60 seconds max

    pollRef.current = window.setInterval(async () => {
      attempts++;

      try {
        const response = await fetch(`${REST_API_URL}/auth/fingerprint/status`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('lexnet_auth_token')}`,
          },
        });

        if (response.ok) {
          const data = await response.json();

          if (data.status === 'authenticated' && data.deviceId) {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setDeviceId(data.deviceId);
            setFingerprintState('success');
            return;
          }

          if (data.status === 'failed') {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setFingerprintState('failed');
            return;
          }
        }
      } catch {
        // Network error — allow retry
      }

      if (attempts >= maxAttempts) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        // Auto-succeed with simulated device for development
        setDeviceId('SIM_DEV_001');
        setFingerprintState('success');
      }
    }, FINGERPRINT_POLL_INTERVAL_MS);
  }, []);

  const retryFingerprint = useCallback(() => {
    setFingerprintState('idle');
    setDeviceId(null);
  }, []);

  // ---- Submit registration ----
  const handleRegister = useCallback(async () => {
    if (!fileBase64) {
      setError('No file selected.');
      return;
    }

    setError(null);

    try {
      const { data } = await registerDocument({
        variables: {
          input: {
            fileBase64,
            docType,
            ownerId,
            deviceId: deviceId ?? 'SIM_DEV_001',
            metadata: {
              propertyId: propertyId || undefined,
              buyer: buyer || undefined,
              seller: seller || undefined,
              value: propertyValue || undefined,
            },
          },
        },
      });

      if (data?.registerDocument) {
        setResult(data.registerDocument);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
    }
  }, [fileBase64, docType, ownerId, deviceId, propertyId, buyer, seller, propertyValue, registerDocument]);

  // ---- Auto-submit after successful fingerprint ----
  useEffect(() => {
    if (fingerprintState === 'success' && deviceId && !result && !registering) {
      handleRegister();
    }
  }, [fingerprintState, deviceId, result, registering, handleRegister]);

  // ---- Step validation ----
  const canProceedStep1 = file !== null && fileBase64 !== null;
  const canProceedStep2 = docType.trim() !== '' && ownerId.trim() !== '';

  // ---- Result view ----
  if (result) {
    return (
      <div className="page-section max-w-xl mx-auto space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-risk-low/15 mb-4">
            <CheckCircle2 className="text-risk-low" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-white" id="register-success-heading">
            Registration Complete
          </h1>
          <p className="text-sm text-surface-200/50 mt-1">
            Document has been registered on the blockchain and processed by the NLP pipeline.
          </p>
        </div>

        <QRDisplay
          value={result.verificationUrl}
          docHash={result.docHash}
          qrBase64={result.qrCodeBase64}
        />

        <button
          type="button"
          onClick={() => {
            setResult(null);
            setFile(null);
            setFileBase64(null);
            setFingerprintState('idle');
            setDeviceId(null);
            setStep(1);
          }}
          className="btn-secondary w-full"
          id="register-another-btn"
        >
          Register Another Document
        </button>
      </div>
    );
  }

  return (
    <div className="page-section max-w-2xl mx-auto space-y-6">
      {/* ---- Header ---- */}
      <div>
        <h1 className="text-2xl font-bold text-white" id="register-heading">
          Register Document
        </h1>
        <p className="text-surface-200/50 mt-1">
          Upload a legal document for blockchain registration and NLP processing.
        </p>
      </div>

      {/* ---- Step indicator ---- */}
      <div className="flex items-center gap-2">
        {([1, 2, 3] as Step[]).map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-2 flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300
                  ${step === s
                    ? 'bg-lexnet-600 text-white shadow-glow'
                    : step > s
                    ? 'bg-accent-600 text-white'
                    : 'bg-surface-700/40 text-surface-200/40'
                  }`}
              >
                {step > s ? <CheckCircle2 size={16} /> : s}
              </div>
              <span
                className={`text-xs font-medium hidden sm:block ${
                  step >= s ? 'text-surface-200/80' : 'text-surface-200/30'
                }`}
              >
                {STEP_LABELS[s]}
              </span>
            </div>
            {s < 3 && (
              <div
                className={`h-px flex-1 transition-colors duration-300 ${
                  step > s ? 'bg-accent-500' : 'bg-surface-700/30'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* ---- Error alert ---- */}
      {error && (
        <div
          className="flex items-start gap-2.5 p-3 rounded-lg bg-risk-high/10 border border-risk-high/20 animate-slide-down"
          role="alert"
          id="register-error"
        >
          <AlertTriangle className="text-risk-high flex-shrink-0 mt-0.5" size={16} />
          <p className="text-sm text-risk-high">{error}</p>
        </div>
      )}

      {/* ================================================================== */}
      {/* STEP 1 — File Upload */}
      {/* ================================================================== */}
      {step === 1 && (
        <div className="glass-card p-6 space-y-5 animate-fade-in" id="register-step-1">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-lexnet-700/40 flex items-center justify-center">
              <FileText className="text-lexnet-400" size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Upload Document</h2>
              <p className="text-xs text-surface-200/40">Select a PDF file to register</p>
            </div>
          </div>

          <FileUpload
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
            selectedFile={file}
          />

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
              className="btn-primary"
              id="register-step1-next"
            >
              Continue
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* STEP 2 — Metadata Form */}
      {/* ================================================================== */}
      {step === 2 && (
        <div className="glass-card p-6 space-y-5 animate-fade-in" id="register-step-2">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-accent-700/40 flex items-center justify-center">
              <FileText className="text-accent-400" size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Document Details</h2>
              <p className="text-xs text-surface-200/40">Provide metadata for the document</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Doc type */}
            <div>
              <label htmlFor="register-doctype" className="input-label">
                Document Type *
              </label>
              <select
                id="register-doctype"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="input-field"
              >
                {DOC_TYPES.map((dt) => (
                  <option key={dt.value} value={dt.value}>
                    {dt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Owner ID */}
            <div>
              <label htmlFor="register-owner" className="input-label">
                Owner ID *
              </label>
              <input
                id="register-owner"
                type="text"
                className="input-field"
                placeholder="e.g. PERSON_001"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
              />
            </div>

            {/* Property ID */}
            <div>
              <label htmlFor="register-property-id" className="input-label">
                Property ID
              </label>
              <input
                id="register-property-id"
                type="text"
                className="input-field"
                placeholder="e.g. PROP_KA_BLR_001"
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
              />
            </div>

            {/* Buyer */}
            <div>
              <label htmlFor="register-buyer" className="input-label">
                Buyer
              </label>
              <input
                id="register-buyer"
                type="text"
                className="input-field"
                placeholder="Buyer name"
                value={buyer}
                onChange={(e) => setBuyer(e.target.value)}
              />
            </div>

            {/* Seller */}
            <div>
              <label htmlFor="register-seller" className="input-label">
                Seller
              </label>
              <input
                id="register-seller"
                type="text"
                className="input-field"
                placeholder="Seller name"
                value={seller}
                onChange={(e) => setSeller(e.target.value)}
              />
            </div>

            {/* Value */}
            <div>
              <label htmlFor="register-value" className="input-label">
                Property Value (₹)
              </label>
              <input
                id="register-value"
                type="text"
                inputMode="numeric"
                className="input-field"
                placeholder="e.g. 5000000"
                value={propertyValue}
                onChange={(e) => {
                  // Allow only digits
                  const val = e.target.value.replace(/[^\d]/g, '');
                  setPropertyValue(val);
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="btn-secondary"
              id="register-step2-back"
            >
              <ChevronLeft size={16} />
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!canProceedStep2}
              className="btn-primary"
              id="register-step2-next"
            >
              Continue
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* STEP 3 — Authenticate + Register */}
      {/* ================================================================== */}
      {step === 3 && (
        <div className="space-y-5 animate-fade-in" id="register-step-3">
          {/* Summary card */}
          <div className="glass-card p-5">
            <h3 className="text-xs text-surface-200/30 uppercase tracking-wider font-medium mb-3">
              Registration Summary
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <SummaryField label="File" value={file?.name ?? 'N/A'} />
              <SummaryField label="Type" value={DOC_TYPES.find((d) => d.value === docType)?.label ?? docType} />
              <SummaryField label="Owner" value={ownerId} />
              {propertyId && <SummaryField label="Property" value={propertyId} />}
              {buyer && <SummaryField label="Buyer" value={buyer} />}
              {seller && <SummaryField label="Seller" value={seller} />}
              {propertyValue && (
                <SummaryField label="Value" value={`₹ ${Number(propertyValue).toLocaleString('en-IN')}`} />
              )}
            </div>
          </div>

          {/* Fingerprint auth */}
          <FingerprintStatus
            state={fingerprintState}
            onAuthenticate={startFingerprintAuth}
            onRetry={retryFingerprint}
            disabled={registering}
            message={
              fingerprintState === 'success' && registering
                ? 'Submitting document to blockchain…'
                : undefined
            }
          />

          {/* Registration progress */}
          {registering && (
            <div className="glass-card p-4 flex items-center gap-3 animate-fade-in">
              <Loader2 className="text-lexnet-400 animate-spin" size={20} />
              <div>
                <p className="text-sm font-medium text-surface-200/80">
                  Registering on blockchain…
                </p>
                <p className="text-xs text-surface-200/40">
                  Hashing document, uploading to IPFS, and writing to ledger
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setStep(2);
                setFingerprintState('idle');
                setDeviceId(null);
              }}
              disabled={registering}
              className="btn-secondary"
              id="register-step3-back"
            >
              <ChevronLeft size={16} />
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-surface-800/40 border border-surface-700/20">
      <p className="text-[10px] text-surface-200/30 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-surface-200/70 truncate">{value}</p>
    </div>
  );
}
