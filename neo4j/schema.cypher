// ============================================================================
// LexNet Neo4j Schema
// ============================================================================
// INF1 contract:
//   - 6 unique constraints
//   - 5 indexes
//   - Labels: Person, Property, Document, Court, LegalAct, Organisation
// ============================================================================

CREATE CONSTRAINT person_name_id IF NOT EXISTS
FOR (p:Person)
REQUIRE (p.name, p.id) IS UNIQUE;

CREATE CONSTRAINT property_id IF NOT EXISTS
FOR (p:Property)
REQUIRE p.id IS UNIQUE;

CREATE CONSTRAINT document_hash IF NOT EXISTS
FOR (d:Document)
REQUIRE d.hash IS UNIQUE;

CREATE CONSTRAINT court_name IF NOT EXISTS
FOR (c:Court)
REQUIRE c.name IS UNIQUE;

CREATE CONSTRAINT legalact_name_section IF NOT EXISTS
FOR (l:LegalAct)
REQUIRE (l.name, l.section) IS UNIQUE;

CREATE CONSTRAINT org_name IF NOT EXISTS
FOR (o:Organisation)
REQUIRE o.name IS UNIQUE;

CREATE INDEX doc_type_idx IF NOT EXISTS
FOR (d:Document)
ON (d.docType);

CREATE INDEX doc_date_idx IF NOT EXISTS
FOR (d:Document)
ON (d.date);

CREATE INDEX doc_risk_idx IF NOT EXISTS
FOR (d:Document)
ON (d.riskScore);

CREATE INDEX property_survey_idx IF NOT EXISTS
FOR (p:Property)
ON (p.surveyNumber);

CREATE FULLTEXT INDEX node_name_search IF NOT EXISTS
FOR (n:Person|Property|Court|Organisation)
ON EACH [n.name];
