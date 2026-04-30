
from __future__ import annotations

import logging
import pickle
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from src.config import get_settings
from src.models.risk import RiskResult

LOGGER = logging.getLogger(__name__)

FEATURE_COLUMNS = [
    "doc_age_days",
    "num_previous_transfers",
    "num_linked_disputes",
    "owner_change_frequency",
    "has_court_involvement",
    "monetary_value_normalized",
    "num_owners_last_year",
    "invalid_reference_count",
]

DEFAULT_LOW_RISK_SCORE = 10.0
MAX_MONETARY_VALUE = 10_000_000.0


@dataclass(frozen=True, slots=True)
class ConflictFeatures:
    doc_age_days: float
    num_previous_transfers: float
    num_linked_disputes: float
    owner_change_frequency: float
    has_court_involvement: float
    monetary_value_normalized: float
    num_owners_last_year: float
    invalid_reference_count: float

    def as_vector(self) -> list[float]:
        return [float(getattr(self, column)) for column in FEATURE_COLUMNS]


def compute_risk_score(doc_hash: str, doc_metadata: dict[str, Any], graph_features: dict[str, Any]) -> RiskResult:
    cleaned_doc_hash = doc_hash.strip()
    if not cleaned_doc_hash:
        raise ValueError("doc_hash must not be empty.")

    features = extract_features(doc_metadata, graph_features)
    flags, rule_score, explanations = evaluate_rules(doc_metadata, graph_features, features)
    model_score = predict_model_score(features)
    score = round(max(model_score, rule_score), 2)

    if not flags and score <= DEFAULT_LOW_RISK_SCORE:
        explanation = "No risky graph history or metadata anomalies detected."
    elif explanations:
        explanation = "; ".join(explanations)
    else:
        explanation = "Conflict model raised the document risk score."

    return RiskResult(score=score, flags=flags, explanation=explanation)


def extract_features(doc_metadata: dict[str, Any], graph_features: dict[str, Any]) -> ConflictFeatures:
    doc_age_days = _doc_age_days(doc_metadata)
    monetary_value = _first_number(
        doc_metadata,
        "monetaryValue",
        "monetary_value",
        "amount",
        "considerationAmount",
    )
    monetary_value_normalized = min(max(monetary_value / MAX_MONETARY_VALUE, 0.0), 1.0)

    return ConflictFeatures(
        doc_age_days=doc_age_days,
        num_previous_transfers=_first_number(graph_features, "num_previous_transfers", "previousTransfers"),
        num_linked_disputes=_first_number(graph_features, "num_linked_disputes", "linkedDisputes"),
        owner_change_frequency=_first_number(graph_features, "owner_change_frequency", "ownerChangeFrequency"),
        has_court_involvement=1.0
        if _first_bool(graph_features, "has_court_involvement", "hasCourtInvolvement")
        else 0.0,
        monetary_value_normalized=monetary_value_normalized,
        num_owners_last_year=_first_number(graph_features, "num_owners_last_year", "ownersLastYear"),
        invalid_reference_count=_first_number(graph_features, "invalid_reference_count", "invalidReferences"),
    )


def evaluate_rules(
    doc_metadata: dict[str, Any],
    graph_features: dict[str, Any],
    features: ConflictFeatures,
) -> tuple[list[str], float, list[str]]:
    flags: list[str] = []
    explanations: list[str] = []
    rule_score = DEFAULT_LOW_RISK_SCORE

    if (
        features.num_owners_last_year > 3
        or features.num_previous_transfers >= 4
        or features.owner_change_frequency >= 3
    ):
        flags.append("RAPID_TRANSFER")
        rule_score = max(rule_score, 72.0)
        explanations.append("Property has rapid ownership movement in the recent graph history")

    if features.invalid_reference_count > 0 or _first_bool(
        graph_features,
        "has_invalid_reference",
        "hasInvalidReference",
    ) or _is_false(doc_metadata.get("legalReferenceValid")):
        flags.append("INVALID_REFERENCE")
        rule_score = max(rule_score, 65.0)
        explanations.append("Document references at least one invalid or unresolved legal section")

    if (
        _first_bool(graph_features, "owner_mismatch", "ownerMismatch")
        or _first_number(graph_features, "conflicting_owner_count", "conflictingOwnerCount") > 0
        or _first_number(graph_features, "duplicate_owner_edges", "duplicateOwnerEdges") > 0
    ):
        flags.append("OWNERSHIP_CONFLICT")
        rule_score = max(rule_score, 80.0)
        explanations.append("Current owner conflicts with existing ownership graph records")

    if features.num_linked_disputes > 0:
        flags.append("DISPUTE_HISTORY")
        rule_score = max(rule_score, 60.0)
        explanations.append("Property or document is linked to dispute history")

    if features.has_court_involvement:
        rule_score = max(rule_score, 35.0)
        explanations.append("Court involvement is present in the graph neighborhood")

    if features.monetary_value_normalized >= 0.9:
        rule_score = max(rule_score, 45.0)
        explanations.append("Transaction value is unusually high for the configured demo scale")

    return _dedupe(flags), rule_score, _dedupe(explanations)


def predict_model_score(features: ConflictFeatures) -> float:
    model = load_conflict_model()
    if model is None:
        return DEFAULT_LOW_RISK_SCORE

    vector = [features.as_vector()]
    try:
        if hasattr(model, "predict_proba"):
            probabilities = model.predict_proba(vector)
            return round(float(probabilities[0][1]) * 100, 2)
        prediction = model.predict(vector)
        return round(float(prediction[0]) * 100, 2)
    except Exception as error:
        LOGGER.warning("Conflict model prediction failed; falling back to rules: %s", error)
        return DEFAULT_LOW_RISK_SCORE


@lru_cache(maxsize=1)
def load_conflict_model() -> Any | None:
    model_path = get_settings().conflict_model_path
    if not model_path.exists() or model_path.stat().st_size == 0:
        LOGGER.warning("Conflict model not found at %s; using rule-based scoring only.", model_path)
        return None

    try:
        with model_path.open("rb") as model_file:
            return pickle.load(model_file)
    except (OSError, pickle.UnpicklingError, EOFError) as error:
        LOGGER.warning("Could not load conflict model from %s: %s", model_path, error)
        return None


def _doc_age_days(doc_metadata: dict[str, Any]) -> float:
    raw_date = _first_value(doc_metadata, "date", "documentDate", "registrationDate", "timestamp")
    parsed_date = _parse_date(raw_date)
    if parsed_date is None:
        return 0.0
    return float(max((date.today() - parsed_date).days, 0))


def _parse_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.astimezone(UTC).date() if value.tzinfo else value.date()
    if isinstance(value, date):
        return value
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None
    for pattern in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d %B %Y", "%d %b %Y"):
        try:
            return datetime.strptime(text, pattern).date()
        except ValueError:
            continue
    return None


def _first_value(mapping: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in mapping and mapping[key] is not None:
            return mapping[key]
    return None


def _first_number(mapping: dict[str, Any], *keys: str) -> float:
    value = _first_value(mapping, *keys)
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return float(value)

    match = re.search(r"-?\d[\d,]*(?:\.\d+)?", str(value))
    if match is None:
        return 0.0
    try:
        return float(match.group(0).replace(",", ""))
    except ValueError:
        return 0.0


def _first_bool(mapping: dict[str, Any], *keys: str) -> bool:
    value = _first_value(mapping, *keys)
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().casefold() in {"1", "true", "yes", "y"}


def _is_false(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return not value
    return str(value).strip().casefold() in {"0", "false", "no", "n"}


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        if value not in seen:
            deduped.append(value)
            seen.add(value)
    return deduped
