
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Any

from neo4j import Transaction
from neo4j.exceptions import Neo4jError

from src.models.triple import Triple
from src.utils.neo4j_driver import get_driver

ALLOWED_RELATIONSHIPS = {
    "OWNS",
    "REFERENCES",
    "INVOLVES",
    "CONCERNS",
    "ISSUED",
    "DISPUTES",
    "SUPERSEDES",
}

PROPERTY_ID_PATTERN = re.compile(
    r"(?:\bPROP[-/][A-Z0-9-]+\b|\b(?:Sy\.?\s*No\.?|Survey\s*No\.?)\s*\d+(?:/\d+)*(?:-[A-Z0-9]+)?\b)",
    re.IGNORECASE,
)
LEGAL_SECTION_PATTERN = re.compile(
    r"\bSection\s+(?P<section>\d+[A-Za-z-]*(?:\(\d+\))?)"
    r"(?:\s+of\s+(?P<name>[A-Z][A-Za-z.\s]+?))?$",
    re.IGNORECASE,
)
DOCUMENT_HASH_PATTERN = re.compile(r"\b[a-f0-9]{64}\b", re.IGNORECASE)
COURT_PATTERN = re.compile(r"\b(?:court|tribunal|bench)\b", re.IGNORECASE)
ORG_PATTERN = re.compile(
    r"\b(?:authority|office|corporation|registrar|bank|ltd|limited|department|board|municipality)\b",
    re.IGNORECASE,
)


class GraphInsertError(RuntimeError):
    """Raised when triples cannot be inserted into Neo4j."""


@dataclass(frozen=True, slots=True)
class GraphNode:
    label: str
    properties: dict[str, Any]


def insert_triples(triples: list[Triple], doc_hash: str) -> int:
    cleaned_doc_hash = doc_hash.strip()
    if not cleaned_doc_hash:
        raise ValueError("doc_hash must not be empty.")
    if not triples:
        return 0

    normalized_triples = [_normalize_triple(triple) for triple in triples]

    try:
        with get_driver().session() as session:
            return int(
                session.execute_write(
                    _insert_triples_tx,
                    normalized_triples,
                    cleaned_doc_hash,
                )
            )
    except Neo4jError as error:
        raise GraphInsertError(f"Failed to insert triples for document {cleaned_doc_hash}: {error}") from error


def _insert_triples_tx(tx: Transaction, triples: list[Triple], doc_hash: str) -> int:
    doc_result = tx.run(
        """
        MERGE (d:Document {hash: $docHash})
        ON CREATE SET d.createdFromNlp = true
        """,
        {"docHash": doc_hash},
    )
    touched = _write_count(doc_result)

    for triple in triples:
        subject = _node_for_value(triple.subject)
        object_node = _node_for_value(triple.object_)
        relationship = _validate_relationship(triple.predicate)

        touched += _merge_node(tx, subject)
        touched += _merge_node(tx, object_node)
        touched += _merge_relationship(tx, relationship, subject, object_node, doc_hash, triple.source_span)
        touched += _merge_document_mentions(tx, subject, object_node, doc_hash, triple.source_span)

    return touched


def _normalize_triple(triple: Triple) -> Triple:
    subject = " ".join(triple.subject.split())
    object_ = " ".join(triple.object_.split())
    predicate = triple.predicate.strip().upper()
    source_span = " ".join(triple.source_span.split())
    if not subject or not object_:
        raise ValueError("Triple subject and object_ must not be empty.")
    if subject.casefold() == object_.casefold():
        raise ValueError("Self-referencing triples are not allowed.")
    return Triple(subject=subject, predicate=predicate, object_=object_, source_span=source_span)


def _node_for_value(value: str) -> GraphNode:
    normalized = " ".join(value.split()).strip()
    if DOCUMENT_HASH_PATTERN.fullmatch(normalized):
        return GraphNode("Document", {"hash": normalized.lower()})

    property_match = PROPERTY_ID_PATTERN.search(normalized)
    if property_match:
        property_id = _normalize_property_id(property_match.group(0))
        return GraphNode(
            "Property",
            {
                "id": property_id,
                "name": property_id,
                "surveyNumber": property_id if property_id.upper().startswith(("SY.NO.", "SURVEY NO.")) else None,
            },
        )

    legal_match = LEGAL_SECTION_PATTERN.search(normalized)
    if legal_match:
        section = legal_match.group("section").strip()
        name = (legal_match.group("name") or "Unknown Act").strip(" .")
        return GraphNode("LegalAct", {"name": name, "section": section})

    if COURT_PATTERN.search(normalized):
        return GraphNode("Court", {"name": normalized})

    if ORG_PATTERN.search(normalized):
        return GraphNode("Organisation", {"name": normalized})

    return GraphNode("Person", {"name": normalized, "id": _stable_person_id(normalized)})


def _merge_node(tx: Transaction, node: GraphNode) -> int:
    query = _merge_node_query(node.label)
    result = tx.run(query, _node_parameters(node))
    return _write_count(result)


def _merge_node_query(label: str) -> str:
    queries = {
        "Person": """
            MERGE (n:Person {name: $name, id: $id})
        """,
        "Property": """
            MERGE (n:Property {id: $id})
            SET n.name = coalesce(n.name, $name),
                n.surveyNumber = coalesce(n.surveyNumber, $surveyNumber)
        """,
        "Document": """
            MERGE (n:Document {hash: $hash})
        """,
        "Court": """
            MERGE (n:Court {name: $name})
        """,
        "LegalAct": """
            MERGE (n:LegalAct {name: $name, section: $section})
        """,
        "Organisation": """
            MERGE (n:Organisation {name: $name})
        """,
    }
    return queries[label]


def _merge_relationship(
    tx: Transaction,
    relationship: str,
    subject: GraphNode,
    object_node: GraphNode,
    doc_hash: str,
    source_span: str,
) -> int:
    query = (
        f"MATCH (s:{subject.label} {_node_match_pattern('subject', subject)})\n"
        f"MATCH (o:{object_node.label} {_node_match_pattern('object', object_node)})\n"
        f"MERGE (s)-[r:{relationship} {{sourceDoc: $docHash}}]->(o)\n"
        "SET r.sourceSpan = $sourceSpan"
    )
    result = tx.run(query, _relationship_parameters(subject, object_node, doc_hash, source_span))
    return _write_count(result)


def _merge_document_mentions(
    tx: Transaction,
    subject: GraphNode,
    object_node: GraphNode,
    doc_hash: str,
    source_span: str,
) -> int:
    touched = 0
    for node in (subject, object_node):
        if node.label == "Document" and node.properties.get("hash") == doc_hash:
            continue
        query = (
            "MATCH (d:Document {hash: $docHash})\n"
            f"MATCH (n:{node.label} {_node_match_pattern('node', node)})\n"
            "MERGE (d)-[r:INVOLVES {sourceDoc: $docHash}]->(n)\n"
            "SET r.sourceSpan = $sourceSpan"
        )
        result = tx.run(query, _document_mention_parameters(node, doc_hash, source_span))
        touched += _write_count(result)
    return touched


def _node_match_pattern(prefix: str, node: GraphNode) -> str:
    patterns = {
        "Person": f"{{name: ${prefix}Name, id: ${prefix}Id}}",
        "Property": f"{{id: ${prefix}Id}}",
        "Document": f"{{hash: ${prefix}Hash}}",
        "Court": f"{{name: ${prefix}Name}}",
        "LegalAct": f"{{name: ${prefix}Name, section: ${prefix}Section}}",
        "Organisation": f"{{name: ${prefix}Name}}",
    }
    return patterns[node.label]


def _node_parameters(node: GraphNode) -> dict[str, Any]:
    return {key: value for key, value in node.properties.items()}


def _relationship_parameters(
    subject: GraphNode,
    object_node: GraphNode,
    doc_hash: str,
    source_span: str,
) -> dict[str, Any]:
    params = {"docHash": doc_hash, "sourceSpan": source_span}
    params.update(_prefixed_node_parameters("subject", subject))
    params.update(_prefixed_node_parameters("object", object_node))
    return params


def _document_mention_parameters(node: GraphNode, doc_hash: str, source_span: str) -> dict[str, Any]:
    params = {"docHash": doc_hash, "sourceSpan": source_span}
    params.update(_prefixed_node_parameters("node", node))
    return params


def _prefixed_node_parameters(prefix: str, node: GraphNode) -> dict[str, Any]:
    params: dict[str, Any] = {}
    for key, value in node.properties.items():
        params[f"{prefix}{key[:1].upper()}{key[1:]}"] = value
    return params


def _validate_relationship(predicate: str) -> str:
    relationship = predicate.strip().upper()
    if relationship not in ALLOWED_RELATIONSHIPS:
        raise ValueError(f"Unsupported relationship type: {predicate}")
    return relationship


def _normalize_property_id(value: str) -> str:
    normalized = re.sub(r"\s+", "", value).replace("SYN0.", "SYNO.")
    normalized = re.sub(r"^Sy\.?No\.?", "Sy.No.", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"^SurveyNo\.?", "Survey No.", normalized, flags=re.IGNORECASE)
    return normalized


def _stable_person_id(name: str) -> str:
    digest = hashlib.sha256(name.casefold().encode("utf-8")).hexdigest()[:16]
    return f"person-{digest}"


def _write_count(result: Any) -> int:
    counters = result.consume().counters
    return int(counters.nodes_created + counters.relationships_created)
