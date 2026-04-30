
from __future__ import annotations

from src.models.risk import RiskResult
from src.pipeline import conflict
from src.pipeline.conflict import compute_risk_score, extract_features


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


def test_empty_doc_hash_is_rejected() -> None:
    try:
        compute_risk_score(" ", {}, {})
    except ValueError as error:
        assert "doc_hash" in str(error)
    else:
        raise AssertionError("compute_risk_score should reject an empty doc_hash.")
