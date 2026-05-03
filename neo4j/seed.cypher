// ============================================================================
// LexNet Neo4j Seed Data
// ============================================================================
// INF1 targets:
//   - 10 Person nodes
//   - 5 Property nodes
//   - 8 Document nodes
//   - Supporting Court, LegalAct, Organisation nodes
//   - Relationship coverage for all 7 LexNet relationship types
//
// Notes:
//   - MERGE is used throughout to keep the seed idempotent.
//   - Property nodes include both `location` and `address` because the current
//     backend search helper checks `address` while the schema plan documents
//     `location`.
// ============================================================================

// ---------------------------------------------------------------------------
// Core nodes
// ---------------------------------------------------------------------------

UNWIND [
  {name: 'Ram Kumar', id: 'PERSON_001', type: 'individual'},
  {name: 'Sita Ayyer', id: 'PERSON_002', type: 'individual'},
  {name: 'Vikram Singh', id: 'PERSON_003', type: 'individual'},
  {name: 'Ananya Patel', id: 'PERSON_004', type: 'individual'},
  {name: 'Meera Iyer', id: 'PERSON_005', type: 'individual'},
  {name: 'Arjun Rao', id: 'PERSON_006', type: 'individual'},
  {name: 'Divya Nair', id: 'PERSON_007', type: 'individual'},
  {name: 'Farhan Khan', id: 'PERSON_008', type: 'individual'},
  {name: 'Priya Sharma', id: 'PERSON_009', type: 'individual'},
  {name: 'Neeraj Joshi', id: 'PERSON_010', type: 'individual'}
] AS person
MERGE (p:Person {name: person.name, id: person.id})
SET p.type = person.type;

UNWIND [
  {
    id: 'PROP_KA_BLR_001',
    name: 'Indiranagar Residential Parcel',
    surveyNumber: 'SY-123/4A',
    location: 'Indiranagar, Bengaluru, Karnataka',
    address: 'Indiranagar, Bengaluru, Karnataka',
    area: '2400 sqft',
    type: 'building'
  },
  {
    id: 'PROP_KA_MYS_002',
    name: 'Hebbal Apartment Block',
    surveyNumber: 'SY-88/2B',
    location: 'Hebbal, Mysuru, Karnataka',
    address: 'Hebbal, Mysuru, Karnataka',
    area: '1800 sqft',
    type: 'building'
  },
  {
    id: 'PROP_TN_CHN_003',
    name: 'Tambaram Agricultural Parcel',
    surveyNumber: 'SY-41/9',
    location: 'Tambaram, Chennai, Tamil Nadu',
    address: 'Tambaram, Chennai, Tamil Nadu',
    area: '1.8 acres',
    type: 'land'
  },
  {
    id: 'PROP_MH_PUN_004',
    name: 'Kharadi Commercial Warehouse',
    surveyNumber: 'SY-302/7',
    location: 'Kharadi, Pune, Maharashtra',
    address: 'Kharadi, Pune, Maharashtra',
    area: '4200 sqft',
    type: 'building'
  },
  {
    id: 'PROP_TS_HYD_005',
    name: 'Gachibowli Villa Plot',
    surveyNumber: 'SY-17/11C',
    location: 'Gachibowli, Hyderabad, Telangana',
    address: 'Gachibowli, Hyderabad, Telangana',
    area: '3200 sqft',
    type: 'building'
  }
] AS property
MERGE (p:Property {id: property.id})
SET
  p.name = property.name,
  p.surveyNumber = property.surveyNumber,
  p.location = property.location,
  p.address = property.address,
  p.area = property.area,
  p.type = property.type;

UNWIND [
  {
    hash: 'DOC_HASH_SALE_001',
    docType: 'sale_deed',
    title: 'Sale Deed for PROP_KA_BLR_001',
    date: '2024-01-10',
    timestamp: '2024-01-10T10:15:00Z',
    createdAt: '2024-01-10T10:18:00Z',
    assessedAt: '2024-01-10T10:20:00Z',
    ipfsCID: 'bafybeifakecid0001sale',
    riskScore: 18.5,
    flags: '[]'
  },
  {
    hash: 'DOC_HASH_MUT_002',
    docType: 'land_record',
    title: 'Mutation Entry for PROP_KA_BLR_001',
    date: '2024-01-24',
    timestamp: '2024-01-24T09:00:00Z',
    createdAt: '2024-01-24T09:05:00Z',
    assessedAt: '2024-01-24T09:06:00Z',
    ipfsCID: 'bafybeifakecid0002mutation',
    riskScore: 12.0,
    flags: '[]'
  },
  {
    hash: 'DOC_HASH_MORT_003',
    docType: 'mortgage_deed',
    title: 'Mortgage Deed for PROP_KA_BLR_001',
    date: '2024-06-03',
    timestamp: '2024-06-03T11:45:00Z',
    createdAt: '2024-06-03T11:50:00Z',
    assessedAt: '2024-06-03T11:52:00Z',
    ipfsCID: 'bafybeifakecid0003mortgage',
    riskScore: 38.0,
    flags: '[{"type":"ENCUMBRANCE_ALERT","severity":"medium","description":"Mortgage lien recorded against the property."}]'
  },
  {
    hash: 'DOC_HASH_COURT_004',
    docType: 'court_order',
    title: 'Interim Court Order on PROP_KA_BLR_001',
    date: '2025-02-11',
    timestamp: '2025-02-11T14:10:00Z',
    createdAt: '2025-02-11T14:15:00Z',
    assessedAt: '2025-02-11T14:16:00Z',
    ipfsCID: 'bafybeifakecid0004court',
    riskScore: 76.0,
    flags: '[{"type":"ACTIVE_DISPUTE","severity":"high","description":"Ownership dispute is active before the district court."},{"type":"OWNERSHIP_CONFLICT","severity":"high","description":"Multiple competing ownership narratives were detected."}]'
  },
  {
    hash: 'DOC_HASH_RECT_005',
    docType: 'rectification_deed',
    title: 'Rectification Deed for PROP_KA_BLR_001',
    date: '2025-03-08',
    timestamp: '2025-03-08T12:30:00Z',
    createdAt: '2025-03-08T12:34:00Z',
    assessedAt: '2025-03-08T12:35:00Z',
    ipfsCID: 'bafybeifakecid0005rectify',
    riskScore: 42.5,
    flags: '[{"type":"METADATA_MISMATCH","severity":"medium","description":"Rectification changed survey wording after prior registration."}]'
  },
  {
    hash: 'DOC_HASH_SALE_006',
    docType: 'sale_deed',
    title: 'Sale Deed for PROP_KA_MYS_002',
    date: '2025-07-19',
    timestamp: '2025-07-19T16:00:00Z',
    createdAt: '2025-07-19T16:04:00Z',
    assessedAt: '2025-07-19T16:05:00Z',
    ipfsCID: 'bafybeifakecid0006sale',
    riskScore: 84.0,
    flags: '[{"type":"RAPID_TRANSFER","severity":"high","description":"Property changed hands unusually quickly."},{"type":"OWNERSHIP_CONFLICT","severity":"high","description":"Buyer identity conflicts with prior owner record."}]'
  },
  {
    hash: 'DOC_HASH_GIFT_007',
    docType: 'gift_deed',
    title: 'Gift Deed for PROP_TN_CHN_003',
    date: '2025-09-02',
    timestamp: '2025-09-02T10:20:00Z',
    createdAt: '2025-09-02T10:25:00Z',
    assessedAt: '2025-09-02T10:26:00Z',
    ipfsCID: 'bafybeifakecid0007gift',
    riskScore: 22.0,
    flags: '[]'
  },
  {
    hash: 'DOC_HASH_LAND_008',
    docType: 'land_record',
    title: 'Record of Rights for PROP_TS_HYD_005',
    date: '2025-11-21',
    timestamp: '2025-11-21T08:40:00Z',
    createdAt: '2025-11-21T08:43:00Z',
    assessedAt: '2025-11-21T08:44:00Z',
    ipfsCID: 'bafybeifakecid0008land',
    riskScore: 10.0,
    flags: '[]'
  }
] AS document
MERGE (d:Document {hash: document.hash})
SET
  d.docType = document.docType,
  d.title = document.title,
  d.date = document.date,
  d.timestamp = document.timestamp,
  d.createdAt = document.createdAt,
  d.assessedAt = document.assessedAt,
  d.ipfsCID = document.ipfsCID,
  d.riskScore = document.riskScore,
  d.flags = document.flags;

UNWIND [
  {
    name: 'Bengaluru Urban District Court',
    jurisdiction: 'Bengaluru Urban',
    level: 'district'
  },
  {
    name: 'Karnataka High Court',
    jurisdiction: 'Karnataka',
    level: 'high'
  }
] AS court
MERGE (c:Court {name: court.name})
SET
  c.jurisdiction = court.jurisdiction,
  c.level = court.level;

UNWIND [
  {name: 'Transfer of Property Act', section: '54', year: 1882},
  {name: 'Registration Act', section: '17', year: 1908},
  {name: 'Karnataka Land Revenue Act', section: '128', year: 1964}
] AS legalAct
MERGE (a:LegalAct {name: legalAct.name, section: legalAct.section})
SET a.year = legalAct.year;

UNWIND [
  {
    name: 'Bengaluru Sub-Registrar Office',
    type: 'registrar',
    jurisdiction: 'Bengaluru Urban'
  },
  {
    name: 'Canara Bank Home Finance',
    type: 'bank',
    jurisdiction: 'Karnataka'
  },
  {
    name: 'Telangana Revenue Authority',
    type: 'authority',
    jurisdiction: 'Telangana'
  }
] AS organisation
MERGE (o:Organisation {name: organisation.name})
SET
  o.type = organisation.type,
  o.jurisdiction = organisation.jurisdiction;

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

UNWIND [
  {
    personId: 'PERSON_001',
    propertyId: 'PROP_KA_BLR_001',
    since: '2024-01-10',
    transferType: 'sale',
    sourceDoc: 'DOC_HASH_SALE_001'
  },
  {
    personId: 'PERSON_004',
    propertyId: 'PROP_KA_MYS_002',
    since: '2025-07-19',
    transferType: 'sale',
    sourceDoc: 'DOC_HASH_SALE_006'
  },
  {
    personId: 'PERSON_003',
    propertyId: 'PROP_KA_MYS_002',
    since: '2023-05-12',
    transferType: 'inheritance',
    sourceDoc: 'LEGACY_OWNER_PROP_KA_MYS_002'
  },
  {
    personId: 'PERSON_007',
    propertyId: 'PROP_TN_CHN_003',
    since: '2025-09-02',
    transferType: 'gift',
    sourceDoc: 'DOC_HASH_GIFT_007'
  },
  {
    personId: 'PERSON_008',
    propertyId: 'PROP_MH_PUN_004',
    since: '2022-08-14',
    transferType: 'sale',
    sourceDoc: 'LEGACY_OWNER_PROP_MH_PUN_004'
  },
  {
    personId: 'PERSON_009',
    propertyId: 'PROP_TS_HYD_005',
    since: '2025-11-21',
    transferType: 'sale',
    sourceDoc: 'DOC_HASH_LAND_008'
  }
] AS ownRel
MATCH (person:Person {id: ownRel.personId})
MATCH (property:Property {id: ownRel.propertyId})
MERGE (person)-[r:OWNS]->(property)
SET
  r.since = ownRel.since,
  r.transferType = ownRel.transferType,
  r.sourceDoc = ownRel.sourceDoc;

UNWIND [
  {docHash: 'DOC_HASH_SALE_001', actName: 'Transfer of Property Act', section: '54', context: 'Sale consideration and transfer of title.'},
  {docHash: 'DOC_HASH_SALE_001', actName: 'Registration Act', section: '17', context: 'Compulsory registration of sale deed.'},
  {docHash: 'DOC_HASH_MUT_002', actName: 'Karnataka Land Revenue Act', section: '128', context: 'Mutation entry after transfer.'},
  {docHash: 'DOC_HASH_MORT_003', actName: 'Transfer of Property Act', section: '54', context: 'Mortgage rights linked to sale record.'},
  {docHash: 'DOC_HASH_COURT_004', actName: 'Registration Act', section: '17', context: 'Validity of the registered instrument challenged.'},
  {docHash: 'DOC_HASH_RECT_005', actName: 'Registration Act', section: '17', context: 'Rectification deed registration requirement.'},
  {docHash: 'DOC_HASH_SALE_006', actName: 'Transfer of Property Act', section: '54', context: 'Transfer of ownership for Mysuru apartment.'},
  {docHash: 'DOC_HASH_LAND_008', actName: 'Karnataka Land Revenue Act', section: '128', context: 'Revenue record update reference.'}
] AS referenceRel
MATCH (document:Document {hash: referenceRel.docHash})
MATCH (act:LegalAct {name: referenceRel.actName, section: referenceRel.section})
MERGE (document)-[r:REFERENCES]->(act)
SET
  r.section = referenceRel.section,
  r.context = referenceRel.context;

UNWIND [
  {docHash: 'DOC_HASH_SALE_001', personId: 'PERSON_001', role: 'buyer'},
  {docHash: 'DOC_HASH_SALE_001', personId: 'PERSON_002', role: 'seller'},
  {docHash: 'DOC_HASH_MUT_002', personId: 'PERSON_001', role: 'buyer'},
  {docHash: 'DOC_HASH_MUT_002', personId: 'PERSON_010', role: 'witness'},
  {docHash: 'DOC_HASH_MORT_003', personId: 'PERSON_001', role: 'buyer'},
  {docHash: 'DOC_HASH_COURT_004', personId: 'PERSON_006', role: 'plaintiff'},
  {docHash: 'DOC_HASH_COURT_004', personId: 'PERSON_001', role: 'defendant'},
  {docHash: 'DOC_HASH_RECT_005', personId: 'PERSON_002', role: 'seller'},
  {docHash: 'DOC_HASH_RECT_005', personId: 'PERSON_001', role: 'buyer'},
  {docHash: 'DOC_HASH_SALE_006', personId: 'PERSON_004', role: 'buyer'},
  {docHash: 'DOC_HASH_SALE_006', personId: 'PERSON_003', role: 'seller'},
  {docHash: 'DOC_HASH_GIFT_007', personId: 'PERSON_007', role: 'buyer'},
  {docHash: 'DOC_HASH_GIFT_007', personId: 'PERSON_005', role: 'seller'},
  {docHash: 'DOC_HASH_LAND_008', personId: 'PERSON_009', role: 'buyer'}
] AS involveRel
MATCH (document:Document {hash: involveRel.docHash})
MATCH (person:Person {id: involveRel.personId})
MERGE (document)-[r:INVOLVES]->(person)
SET r.role = involveRel.role;

UNWIND [
  {docHash: 'DOC_HASH_SALE_001', propertyId: 'PROP_KA_BLR_001', nature: 'transfer'},
  {docHash: 'DOC_HASH_MUT_002', propertyId: 'PROP_KA_BLR_001', nature: 'transfer'},
  {docHash: 'DOC_HASH_MORT_003', propertyId: 'PROP_KA_BLR_001', nature: 'mortgage'},
  {docHash: 'DOC_HASH_COURT_004', propertyId: 'PROP_KA_BLR_001', nature: 'dispute'},
  {docHash: 'DOC_HASH_RECT_005', propertyId: 'PROP_KA_BLR_001', nature: 'transfer'},
  {docHash: 'DOC_HASH_SALE_006', propertyId: 'PROP_KA_MYS_002', nature: 'transfer'},
  {docHash: 'DOC_HASH_GIFT_007', propertyId: 'PROP_TN_CHN_003', nature: 'transfer'},
  {docHash: 'DOC_HASH_LAND_008', propertyId: 'PROP_TS_HYD_005', nature: 'transfer'}
] AS concernRel
MATCH (document:Document {hash: concernRel.docHash})
MATCH (property:Property {id: concernRel.propertyId})
MERGE (document)-[r:CONCERNS]->(property)
SET r.nature = concernRel.nature;

UNWIND [
  {
    courtName: 'Bengaluru Urban District Court',
    docHash: 'DOC_HASH_COURT_004',
    caseNumber: 'OS-214-2025',
    date: '2025-02-11'
  }
] AS issuedRel
MATCH (court:Court {name: issuedRel.courtName})
MATCH (document:Document {hash: issuedRel.docHash})
MERGE (court)-[r:ISSUED]->(document)
SET
  r.caseNumber = issuedRel.caseNumber,
  r.date = issuedRel.date;

UNWIND [
  {
    docHash: 'DOC_HASH_COURT_004',
    propertyId: 'PROP_KA_BLR_001',
    caseId: 'CASE_2025_014',
    status: 'active'
  }
] AS disputeRel
MATCH (document:Document {hash: disputeRel.docHash})
MATCH (property:Property {id: disputeRel.propertyId})
MERGE (document)-[r:DISPUTES]->(property)
SET
  r.caseId = disputeRel.caseId,
  r.status = disputeRel.status;

UNWIND [
  {
    newerDocHash: 'DOC_HASH_RECT_005',
    olderDocHash: 'DOC_HASH_SALE_001',
    reason: 'Corrected survey boundary description.',
    date: '2025-03-08'
  }
] AS supersedeRel
MATCH (newer:Document {hash: supersedeRel.newerDocHash})
MATCH (older:Document {hash: supersedeRel.olderDocHash})
MERGE (newer)-[r:SUPERSEDES]->(older)
SET
  r.reason = supersedeRel.reason,
  r.date = supersedeRel.date;
