// ============================================================================
// LexNet Frontend — GraphQL Queries
// ============================================================================
//
// All GQL query strings matching the backend schema.
// Consumed by Apollo `useQuery` hooks throughout the app.
// ============================================================================

import { gql } from '@apollo/client';

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const GET_DOCUMENT = gql`
  query GetDocument($docHash: String!) {
    getDocument(docHash: $docHash) {
      docHash
      ipfsCID
      ownerId
      deviceId
      timestamp
      docType
      metadata {
        propertyId
        buyer
        seller
        value
      }
      activeDispute
      disputeCaseId
      riskScore
      createdAt
    }
  }
`;

export const GET_DOCUMENT_HISTORY = gql`
  query GetDocumentHistory($docHash: String!) {
    getDocumentHistory(docHash: $docHash) {
      docHash
      ipfsCID
      ownerId
      deviceId
      timestamp
      docType
      metadata {
        propertyId
        buyer
        seller
        value
      }
      activeDispute
      disputeCaseId
      riskScore
      createdAt
    }
  }
`;

export const VERIFY_DOCUMENT = gql`
  query VerifyDocument($docHash: String!) {
    verifyDocument(docHash: $docHash) {
      status
      docHash
      timestamp
      document {
        docHash
        ipfsCID
        ownerId
        deviceId
        timestamp
        docType
        metadata {
          propertyId
          buyer
          seller
          value
        }
        activeDispute
        disputeCaseId
        riskScore
        createdAt
      }
      message
    }
  }
`;

export const GET_DOCUMENTS_BY_OWNER = gql`
  query GetDocumentsByOwner($ownerId: String!) {
    getDocumentsByOwner(ownerId: $ownerId) {
      docHash
      ipfsCID
      ownerId
      docType
      timestamp
      riskScore
      activeDispute
      createdAt
    }
  }
`;

// ---------------------------------------------------------------------------
// Knowledge Graph
// ---------------------------------------------------------------------------

export const GET_KNOWLEDGE_GRAPH = gql`
  query GetKnowledgeGraph($docHash: String!, $depth: Int) {
    getKnowledgeGraph(docHash: $docHash, depth: $depth) {
      nodes {
        id
        label
        properties
      }
      edges {
        id
        source
        target
        type
        properties
      }
    }
  }
`;

export const SEARCH_NODES = gql`
  query SearchNodes($query: String!) {
    searchNodes(query: $query) {
      id
      label
      name
      score
    }
  }
`;

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export const GET_PROPERTY_TIMELINE = gql`
  query GetPropertyTimeline($propertyId: String!) {
    getPropertyTimeline(propertyId: $propertyId) {
      propertyId
      events {
        id
        eventType
        timestamp
        description
        docHash
        actor
        metadata
      }
    }
  }
`;

export const GET_DOCUMENT_EVENTS = gql`
  query GetDocumentEvents($docHash: String!) {
    getDocumentEvents(docHash: $docHash) {
      id
      eventType
      timestamp
      description
      docHash
      actor
      metadata
    }
  }
`;

// ---------------------------------------------------------------------------
// Conflicts / Risk
// ---------------------------------------------------------------------------

export const GET_CONFLICTS = gql`
  query GetConflicts($limit: Int, $offset: Int) {
    getConflicts(limit: $limit, offset: $offset) {
      docHash
      riskScore
      flags {
        type
        severity
        description
        relatedDocHash
      }
      assessedAt
    }
  }
`;

export const GET_RISK_SCORE = gql`
  query GetRiskScore($docHash: String!) {
    getRiskScore(docHash: $docHash) {
      docHash
      riskScore
      flags {
        type
        severity
        description
        relatedDocHash
      }
      assessedAt
    }
  }
`;

export const GET_FLAGGED_DOCUMENTS = gql`
  query GetFlaggedDocuments($minRisk: Float) {
    getFlaggedDocuments(minRisk: $minRisk) {
      document {
        docHash
        ipfsCID
        ownerId
        docType
        timestamp
        riskScore
        activeDispute
        createdAt
      }
      riskScore
      flags {
        type
        severity
        description
        relatedDocHash
      }
    }
  }
`;
