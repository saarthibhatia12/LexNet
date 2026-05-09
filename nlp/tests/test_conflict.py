
from __future__ import annotations

from pathlib import Path

from src.models.risk import RiskResult
from src.models.entity import Entity
from src.models.triple import Triple
from src.pipeline import conflict
from src.pipeline.conflict import compute_risk_score, derive_graph_features, extract_features


def test_high_risk_scenario_returns_score_above_70() -> None:
    result = compute_risk_score(
        "doc-123",
        {"docType": "sale_deed", "ownerId": "Ram Kumar", "monetaryValue": 9_500_000},
        {
            "num_previous_transfers": 5,
            "num_linked_disputes": 1,
            "owner_change_frequency": 4,
            "num_owners_last_year": 4,
            "owner_mismatch": True,
            "invalid_reference_count": 1,
            "has_court_involvement": True,
        },
    )

    assert isinstance(result, RiskResult)
    assert result.score > 70
    assert "RAPID_TRANSFER" in result.flags
    assert "OWNERSHIP_CONFLICT" in result.flags
    assert "INVALID_REFERENCE" in result.flags


def test_normal_scenario_returns_low_score() -> None:
    result = compute_risk_score(
        "doc-456",
        {"docType": "land_record", "ownerId": "Asha Rao", "monetaryValue": 300_000},
        {
            "num_previous_transfers": 0,
            "num_linked_disputes": 0,
            "owner_change_frequency": 0,
            "num_owners_last_year": 1,
            "invalid_reference_count": 0,
            "has_court_involvement": False,
        },
    )

    assert result.score < 30
    assert result.flags == []


def test_model_score_is_combined_conservatively(monkeypatch: object) -> None:
    class FakeModel:
        def predict_proba(self, vector: list[list[float]]) -> list[list[float]]:
            assert len(vector[0]) == len(conflict.FEATURE_COLUMNS)
            return [[0.2, 0.8]]

    conflict.load_conflict_model.cache_clear()
    monkeypatch.setattr(conflict, "load_conflict_model", lambda: FakeModel())

    result = compute_risk_score("doc-789", {}, {})

    assert result.score == 80
    assert result.flags == []


def test_extract_features_supports_metadata_aliases() -> None:
    features = extract_features(
        {"considerationAmount": "Rs. 5000000", "registrationDate": "2026-04-01"},
        {"previousTransfers": "2", "hasCourtInvolvement": "yes", "invalidReferences": "1"},
    )

    assert features.monetary_value_normalized == 0.5
    assert features.num_previous_transfers == 2
    assert features.has_court_involvement == 1
    assert features.invalid_reference_count == 1


def test_derive_graph_features_detects_risky_transfer_chain() -> None:
    text = (
        "Kavya Nair sold property PROP_KA_BLR_077 to Rohan Das. "
        "Rohan Das transferred property PROP_KA_BLR_077 to Punit Arora. "
        "Punit Arora conveyed property PROP_KA_BLR_077 to Leena Thomas. "
        "Leena Thomas sold property PROP_KA_BLR_077 to Dev Malhotra. "
        "Meera Iyer filed objection before Bengaluru Urban Civil Court under "
        "Section 999 of Urban Title Integrity Act and alleged forged and duplicate registration papers. "
        "The bundle states a consideration of INR 98500000 and records Case-2025-077."
    )
    entities = [
        Entity(text="Kavya Nair", label="PERSON", start=0, end=10, confidence=0.95),
        Entity(text="Rohan Das", label="PERSON", start=48, end=57, confidence=0.95),
        Entity(text="Punit Arora", label="PERSON", start=108, end=119, confidence=0.95),
        Entity(text="Leena Thomas", label="PERSON", start=169, end=181, confidence=0.95),
        Entity(text="Dev Malhotra", label="PERSON", start=229, end=241, confidence=0.95),
        Entity(text="Meera Iyer", label="PERSON", start=243, end=253, confidence=0.95),
        Entity(text="PROP_KA_BLR_077", label="PROPERTY_ID", start=30, end=45, confidence=0.97),
        Entity(
            text="Bengaluru Urban Civil Court",
            label="JURISDICTION",
            start=277,
            end=305,
            confidence=0.9,
        ),
        Entity(
            text="Section 999 of Urban Title Integrity Act",
            label="LEGAL_SECTION",
            start=312,
            end=353,
            confidence=0.94,
        ),
        Entity(text="INR 98500000", label="MONETARY_VALUE", start=438, end=450, confidence=0.9),
    ]
    triples = [
        Triple(subject="Kavya Nair", predicate="OWNS", object_="PROP_KA_BLR_077", source_span="Kavya Nair sold property PROP_KA_BLR_077 to Rohan Das."),
        Triple(subject="Rohan Das", predicate="OWNS", object_="PROP_KA_BLR_077", source_span="Rohan Das transferred property PROP_KA_BLR_077 to Punit Arora."),
        Triple(subject="Punit Arora", predicate="OWNS", object_="PROP_KA_BLR_077", source_span="Punit Arora conveyed property PROP_KA_BLR_077 to Leena Thomas."),
        Triple(subject="Leena Thomas", predicate="OWNS", object_="PROP_KA_BLR_077", source_span="Leena Thomas sold property PROP_KA_BLR_077 to Dev Malhotra."),
        Triple(subject="Meera Iyer", predicate="REFERENCES", object_="Section 999 of Urban Title Integrity Act", source_span="Meera Iyer filed objection before Bengaluru Urban Civil Court under Section 999 of Urban Title Integrity Act."),
    ]

    graph_features = derive_graph_features(
        {"docType": "sale_deed", "ownerId": "Dev Malhotra"},
        text,
        entities,
        triples,
        triples_inserted=12,
    )
    result = compute_risk_score(
        "doc-risk-graph",
        {"docType": "sale_deed", "ownerId": "Dev Malhotra"},
        graph_features,
    )

    assert graph_features["num_previous_transfers"] >= 3
    assert graph_features["num_owners_last_year"] >= 4
    assert graph_features["has_court_involvement"] is True
    assert graph_features["invalid_reference_count"] >= 1
    assert graph_features["owner_mismatch"] is True
    assert graph_features["monetaryValue"] == 98500000.0
    assert result.score > 70
    assert "RAPID_TRANSFER" in result.flags
    assert "OWNERSHIP_CONFLICT" in result.flags
    assert "INVALID_REFERENCE" in result.flags


def test_empty_doc_hash_is_rejected() -> None:
    try:
        compute_risk_score(" ", {}, {})
    except ValueError as error:
        assert "doc_hash" in str(error)
    else:
        raise AssertionError("compute_risk_score should reject an empty doc_hash.")


def test_model_score_falls_back_when_predict_proba_returns_nan(monkeypatch: object) -> None:
    class FakeModel:
        def predict_proba(self, vector: list[list[float]]) -> list[list[float]]:
            assert len(vector[0]) == len(conflict.FEATURE_COLUMNS)
            return [[0.0, float("nan")]]

    conflict.load_conflict_model.cache_clear()
    monkeypatch.setattr(conflict, "load_conflict_model", lambda: FakeModel())

    result = compute_risk_score("doc-nan", {}, {})

    assert result.score == conflict.DEFAULT_LOW_RISK_SCORE


def test_load_conflict_model_returns_none_when_pickle_dependencies_are_missing(
    monkeypatch: object,
    tmp_path: Path,
) -> None:
    model_path = tmp_path / "conflict_model.pkl"
    model_path.write_bytes(b"placeholder")

    class FakeSettings:
        conflict_model_path = model_path

    conflict.load_conflict_model.cache_clear()
    monkeypatch.setattr(conflict, "get_settings", lambda: FakeSettings())
    monkeypatch.setattr(conflict.pickle, "load", lambda _file: (_ for _ in ()).throw(ModuleNotFoundError("xgboost")))

    assert conflict.load_conflict_model() is None
