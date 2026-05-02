// ============================================================================
// LexNet Frontend — VerifyPage Tests
// ============================================================================
//
// Tests:
//   1. Renders the verify page with heading and input
//   2. Hash input accepts and displays text
//   3. Shows error for invalid hash format
//   4. Submit button disabled when input is empty
//   5. Tab switching between hash and QR modes
//   6. Displays AUTHENTIC result correctly
//   7. Displays TAMPERED result correctly
//   8. Displays NOT_REGISTERED result correctly
//   9. Pre-fills hash from URL parameter
// ============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MockedProvider, MockedResponse } from '@apollo/client/testing';
import { AuthProvider } from '../src/context/AuthContext';
import VerifyPage from '../src/pages/VerifyPage';
import { VERIFY_DOCUMENT } from '../src/graphql/queries';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderVerifyPage(mocks: MockedResponse[] = [], initialHash?: string) {
  const path = initialHash ? `/verify/${initialHash}` : '/verify';

  return render(
    <MockedProvider mocks={mocks}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/verify/:hash" element={<VerifyPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </MockedProvider>,
  );
}

const VALID_HASH = 'a'.repeat(64);

function buildVerifyMock(
  docHash: string,
  status: 'AUTHENTIC' | 'TAMPERED' | 'NOT_REGISTERED' | 'ERROR',
  message: string,
  doc?: Record<string, unknown> | null,
): MockedResponse {
  return {
    request: {
      query: VERIFY_DOCUMENT,
      variables: { docHash },
    },
    result: {
      data: {
        verifyDocument: {
          __typename: 'VerificationResult',
          status,
          docHash,
          timestamp: '2024-03-15T10:30:00Z',
          document: doc ?? null,
          message,
        },
      },
    },
  };
}

const SAMPLE_DOCUMENT = {
  __typename: 'Document',
  docHash: VALID_HASH,
  ipfsCID: 'bafybeigtest123',
  ownerId: 'PERSON_001',
  deviceId: 'DEV_A1B2C3D4',
  timestamp: '2024-03-15T10:30:00Z',
  docType: 'sale_deed',
  metadata: {
    __typename: 'DocumentMetadata',
    propertyId: 'PROP_KA_BLR_001',
    buyer: 'Ram Kumar',
    seller: 'Sita Devi',
    value: '5000000',
  },
  activeDispute: false,
  disputeCaseId: null,
  riskScore: 15.5,
  createdAt: '2024-03-15T10:30:05Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VerifyPage', () => {
  it('renders the verification page with heading and input', () => {
    renderVerifyPage();

    expect(screen.getByText('Document Verification')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/a1b2c3d4e5f6/i)).toBeInTheDocument();
    expect(screen.getByText('Verify Document')).toBeInTheDocument();
  });

  it('accepts text in the hash input field', () => {
    renderVerifyPage();

    const input = screen.getByPlaceholderText(/a1b2c3d4e5f6/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: VALID_HASH } });

    expect(input.value).toBe(VALID_HASH);
  });

  it('shows error for invalid hash format on submit', async () => {
    renderVerifyPage();

    const input = screen.getByPlaceholderText(/a1b2c3d4e5f6/i);
    fireEvent.change(input, { target: { value: 'not-a-valid-hash' } });

    const form = input.closest('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Invalid hash format/i)).toBeInTheDocument();
    });
  });

  it('has submit button disabled when input is empty', () => {
    renderVerifyPage();

    const submitBtn = screen.getByText('Verify Document').closest('button') as HTMLButtonElement;
    expect(submitBtn).toBeDisabled();
  });

  it('enables submit button when hash is entered', () => {
    renderVerifyPage();

    const input = screen.getByPlaceholderText(/a1b2c3d4e5f6/i);
    fireEvent.change(input, { target: { value: VALID_HASH } });

    const submitBtn = screen.getByText('Verify Document').closest('button') as HTMLButtonElement;
    expect(submitBtn).not.toBeDisabled();
  });

  it('shows tab switching between hash and QR modes', () => {
    renderVerifyPage();

    // Hash tab should be active by default
    expect(screen.getByPlaceholderText(/a1b2c3d4e5f6/i)).toBeInTheDocument();

    // Switch to QR tab
    const qrTab = screen.getByText('Upload QR');
    fireEvent.click(qrTab);

    expect(screen.getByText(/Upload an image containing a LexNet QR code/i)).toBeInTheDocument();

    // Switch back to hash tab
    const hashTab = screen.getByText('Paste Hash');
    fireEvent.click(hashTab);

    expect(screen.getByPlaceholderText(/a1b2c3d4e5f6/i)).toBeInTheDocument();
  });

  it('displays AUTHENTIC result with document details', async () => {
    const mock = buildVerifyMock(
      VALID_HASH,
      'AUTHENTIC',
      'Document is authentic and unmodified.',
      SAMPLE_DOCUMENT,
    );

    renderVerifyPage([mock], VALID_HASH);

    await waitFor(() => {
      expect(screen.getByText('Authentic')).toBeInTheDocument();
    });

    expect(screen.getByText('Document is authentic and unmodified.')).toBeInTheDocument();
    expect(screen.getByText('Sale Deed')).toBeInTheDocument();
    expect(screen.getByText('PERSON_001')).toBeInTheDocument();
  });

  it('displays TAMPERED result', async () => {
    const mock = buildVerifyMock(
      VALID_HASH,
      'TAMPERED',
      'Document has been modified after registration.',
      SAMPLE_DOCUMENT,
    );

    renderVerifyPage([mock], VALID_HASH);

    await waitFor(() => {
      expect(screen.getByText('Tampered')).toBeInTheDocument();
    });

    expect(screen.getByText('Document has been modified after registration.')).toBeInTheDocument();
  });

  it('displays NOT_REGISTERED result', async () => {
    const mock = buildVerifyMock(
      VALID_HASH,
      'NOT_REGISTERED',
      'No document found with this hash.',
    );

    renderVerifyPage([mock], VALID_HASH);

    await waitFor(() => {
      expect(screen.getByText('Not Registered')).toBeInTheDocument();
    });

    expect(screen.getByText('No document found with this hash.')).toBeInTheDocument();
  });

  it('pre-fills hash from URL parameter', () => {
    renderVerifyPage([], VALID_HASH);

    const input = screen.getByPlaceholderText(/a1b2c3d4e5f6/i) as HTMLInputElement;
    expect(input.value).toBe(VALID_HASH);
  });
});
