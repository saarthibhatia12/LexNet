
from __future__ import annotations

from src.models.entity import Entity
from src.models.risk import RiskResult
from src.pipeline.rel_extract import extract_relations
from src.utils.text_clean import clean_text


def entity(text: str, label: str, source: str, confidence: float = 0.95) -> Entity:
    start = source.index(text)
    return Entity(text=text, label=label, start=start, end=start + len(text), confidence=confidence)


def test_extract_relations_detects_ownership() -> None:
    text = "Ram Kumar owns property Sy.No.123/4 in Bengaluru Urban."
    entities = [
        entity("Ram Kumar", "PERSON", text),
        entity("Sy.No.123/4", "PROPERTY_ID", text),
    ]

    triples = extract_relations(text, entities)

    assert any(
        triple.subject == "Ram Kumar"
        and triple.predicate == "OWNS"
        and triple.object_ == "Sy.No.123/4"
        for triple in triples
    )


def test_extract_relations_detects_legal_reference() -> None:
    text = "Asha Rao filed the claim under Section 17 of Registration Act for Sy.No.123/4."
    entities = [
        entity("Asha Rao", "PERSON", text),
        entity("Section 17 of Registration Act", "LEGAL_SECTION", text),
        entity("Sy.No.123/4", "PROPERTY_ID", text),
    ]

    triples = extract_relations(text, entities)

    assert any(
        triple.subject == "Asha Rao"
        and triple.predicate == "REFERENCES"
        and triple.object_ == "Section 17 of Registration Act"
        for triple in triples
    )


def test_extract_relations_uses_involvement_for_nearby_case_parties() -> None:
    text = "Megha Sharma executed sale deed for property PROP-77 before Registrar Office."
    entities = [
        entity("Megha Sharma", "PERSON", text),
        entity("PROP-77", "PROPERTY_ID", text),
        entity("Registrar Office", "ORGANISATION", text),
    ]

    triples = extract_relations(text, entities)

    assert any(triple.predicate == "INVOLVES" for triple in triples)


def test_extract_relations_no_relations_case() -> None:
    text = "Ram Kumar. " + " ".join(f"word{i}" for i in range(60)) + " Sy.No.123/4."
    entities = [
        entity("Ram Kumar", "PERSON", text),
        entity("Sy.No.123/4", "PROPERTY_ID", text),
    ]

    assert extract_relations(text, entities) == []


def test_clean_text_normalizes_common_ocr_noise() -> None:
    raw = "LEXNET DEED\nPage 1 of 2\nSvy No 123/4\nLEXNET DEED\nPage 2 of 2\nRs:5000"

    assert clean_text(raw) == "Sy.No. 123/4 Rs. 5000"


def test_risk_result_rejects_out_of_range_score() -> None:
    try:
        RiskResult(score=101)
    except ValueError as error:
        assert "between 0 and 100" in str(error)
    else:
        raise AssertionError("RiskResult should reject scores above 100.")
