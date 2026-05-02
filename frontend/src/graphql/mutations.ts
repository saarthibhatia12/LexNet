// ============================================================================
// LexNet Frontend — GraphQL Mutations
// ============================================================================
//
// All GQL mutation strings matching the backend schema.
// Consumed by Apollo `useMutation` hooks throughout the app.
// ============================================================================

import { gql } from '@apollo/client';

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export const LOGIN = gql`
  mutation Login($username: String!, $password: String!) {
    login(username: $username, password: $password) {
      token
      userId
      role
      expiresIn
    }
  }
`;

// ---------------------------------------------------------------------------
// Document Registration
// ---------------------------------------------------------------------------

export const REGISTER_DOCUMENT = gql`
  mutation RegisterDocument($input: RegisterDocumentInput!) {
    registerDocument(input: $input) {
      docHash
      ipfsCID
      qrCodeBase64
      verificationUrl
      timestamp
    }
  }
`;

// ---------------------------------------------------------------------------
// Document Management
// ---------------------------------------------------------------------------

export const TRANSFER_DOCUMENT = gql`
  mutation TransferDocument($docHash: String!, $newOwnerId: String!) {
    transferDocument(docHash: $docHash, newOwnerId: $newOwnerId) {
      docHash
      ipfsCID
      ownerId
      deviceId
      timestamp
      docType
      activeDispute
      disputeCaseId
      riskScore
      createdAt
    }
  }
`;

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

export const ADD_DISPUTE = gql`
  mutation AddDispute($docHash: String!, $caseId: String!, $filedBy: String) {
    addDispute(docHash: $docHash, caseId: $caseId, filedBy: $filedBy) {
      docHash
      ipfsCID
      ownerId
      deviceId
      timestamp
      docType
      activeDispute
      disputeCaseId
      riskScore
      createdAt
    }
  }
`;

export const RESOLVE_DISPUTE = gql`
  mutation ResolveDispute($docHash: String!, $caseId: String!) {
    resolveDispute(docHash: $docHash, caseId: $caseId) {
      docHash
      ipfsCID
      ownerId
      deviceId
      timestamp
      docType
      activeDispute
      disputeCaseId
      riskScore
      createdAt
    }
  }
`;
