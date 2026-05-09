
from __future__ import annotations

from collections import defaultdict
import logging
import math
import pickle
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from src.config import get_settings
from src.models.entity import Entity
from src.models.risk import RiskResult
from src.models.triple import Triple

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
TRANSFER_CUE_PATTERN = re.compile(
    r"\b(?:sold|transferred|conveyed|gifted|leased|assigned|reassigned|mortgaged)\b",
    re.IGNORECASE,
)
DISPUTE_CUE_PATTERN = re.compile(
    r"\b(?:dispute|objection|rival|competing|conflict|litigation|injunction|"
    r"claim(?:ed|s)?|restrain|stay|petition|suit)\b",
    re.IGNORECASE,
)
COURT_CUE_PATTERN = re.compile(
    r"\b(?:court|tribunal|judge|bench|injunction|case\s+id|civil\s+suit|drt)\b",
    re.IGNORECASE,
)
ANOMALY_CUE_PATTERN = re.compile(
    r"\b(?:forged|fake|fraudulent|fabricated|duplicate|invalid|benami|sham|bogus|"
    r"without\s+consent|without\s+noc|unregistered)\b",
    re.IGNORECASE,
)
CASE_REFERENCE_PATTERN = re.compile(
    r"\b(?:CASE|SUIT|PETITION|APPEAL)[-_:/]?[A-Z0-9/_-]+\b",
    re.IGNORECASE,
)
KNOWN_LEGAL_ACT_NAMES = (
    "registration act",
    "transfer of property act",
    "indian stamp act",
    "specific relief act",
    "civil procedure code",
    "cpc",
    "code of civil procedure",
    "succession act",
    "evidence act",
)


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
    score = round(max(_normalize_score(model_score, fallback=rule_score), rule_score), 2)

    if not flags and score <= DEFAULT_LOW_RISK_SCORE:
        explanation = "No risky graph history or metadata anomalies detected."
    elif explanations:
        explanation = "; ".join(explanations)
    else:
        explanation = "Conflict model raised the document risk score."

    return RiskResult(score=score, flags=flags, explanation=explanation)


def derive_graph_features(
    doc_metadata: dict[str, Any],
    cleaned_text: str,
    entities: list[Entity],
    triples: list[Triple],
    triples_inserted: int,
) -> dict[str, Any]:
    graph_features = doc_metadata.get("graphFeatures", {})
    if not isinstance(graph_features, dict):
        graph_features = {}

    ownership_map: dict[str, set[str]] = defaultdict(set)
    for triple in triples:
        if triple.predicate != "OWNS":
            continue
        property_key = _normalize_graph_value(triple.object_)
        owner_key = _normalize_graph_value(triple.subject)
        if property_key and owner_key:
            ownership_map[property_key].add(owner_key)

    max_owners_for_property = max((len(owners) for owners in ownership_map.values()), default=0)
    duplicate_owner_edges = sum(max(len(owners) - 1, 0) for owners in ownership_map.values())
    transfer_mentions = len(TRANSFER_CUE_PATTERN.findall(cleaned_text))
    dispute_detected = DISPUTE_CUE_PATTERN.search(cleaned_text) is not None
    court_detected = _has_court_involvement(doc_metadata, cleaned_text, entities)
    anomaly_mentions = len(ANOMALY_CUE_PATTERN.findall(cleaned_text))
    invalid_reference_count = _count_invalid_legal_references(entities)
    if anomaly_mentions > 0 and invalid_reference_count == 0:
        invalid_reference_count = 1

    derived_features: dict[str, Any] = {
        "entitiesFound": len(entities),
        "triplesInserted": triples_inserted,
        "num_previous_transfers": max(max_owners_for_property - 1, max(transfer_mentions - 1, 0)),
        "owner_change_frequency": max(max_owners_for_property - 1, transfer_mentions),
        "num_owners_last_year": max_owners_for_property,
        "num_linked_disputes": max(
            len(CASE_REFERENCE_PATTERN.findall(cleaned_text)),
            1 if dispute_detected else 0,
        ),
        "has_court_involvement": court_detected,
        "invalid_reference_count": invalid_reference_count,
        "owner_mismatch": duplicate_owner_edges > 0 and (dispute_detected or court_detected or anomaly_mentions > 0),
        "conflicting_owner_count": duplicate_owner_edges,
        "duplicate_owner_edges": duplicate_owner_edges,
    }

    highest_monetary_value = _highest_monetary_value(entities)
    if highest_monetary_value > 0:
        derived_features["monetaryValue"] = highest_monetary_value

    resolved_features = dict(graph_features)
    for key, value in derived_features.items():
        resolved_features.setdefault(key, value)

    return resolved_features


def extract_features(doc_metadata: dict[str, Any], graph_features: dict[str, Any]) -> ConflictFeatures:
    doc_age_days = _doc_age_days(doc_metadata)
    monetary_value = _first_number(
        doc_metadata,
        "monetaryValue",
        "monetary_value",
        "amount",
        "considerationAmount",
    ) or _first_number(
        graph_features,
        "monetaryValue",
        "monetary_value",
        "highestMonetaryValue",
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
            return round(_require_finite_score(float(probabilities[0][1]) * 100), 2)
        prediction = model.predict(vector)
        return round(_require_finite_score(float(prediction[0]) * 100), 2)
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
    except (OSError, pickle.UnpicklingError, EOFError, ImportError, ModuleNotFoundError, AttributeError, ValueError) as error:
        LOGGER.warning("Could not load conflict model from %s: %s", model_path, error)
        return None


def _require_finite_score(score: float) -> float:
    if not math.isfinite(score):
        raise ValueError(f"Conflict model produced a non-finite score: {score}")
    return score


def _normalize_score(score: float, fallback: float) -> float:
    if not math.isfinite(score):
        LOGGER.warning("Conflict score was not finite; using fallback score %.2f", fallback)
        return fallback
    return min(max(score, 0.0), 100.0)


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


def _normalize_graph_value(value: str) -> str:
    return " ".join(value.split()).strip().casefold()


def _has_court_involvement(doc_metadata: dict[str, Any], cleaned_text: str, entities: list[Entity]) -> bool:
    if COURT_CUE_PATTERN.search(cleaned_text):
        return True

    metadata_values = [str(value) for value in doc_metadata.values() if isinstance(value, (str, int, float))]
    if any(COURT_CUE_PATTERN.search(value) for value in metadata_values):
        return True

    return any(
        "court" in entity.text.casefold() or "tribunal" in entity.text.casefold()
        for entity in entities
        if entity.label in {"JURISDICTION", "ORGANISATION"}
    )


def _count_invalid_legal_references(entities: list[Entity]) -> int:
    invalid_references = 0
    for entity in entities:
        if entity.label != "LEGAL_SECTION":
            continue

        normalized_text = entity.text.casefold()
        if "section" not in normalized_text:
            continue

        if " of " not in normalized_text:
            invalid_references += 1
            continue

        if not any(act_name in normalized_text for act_name in KNOWN_LEGAL_ACT_NAMES):
            invalid_references += 1

    return invalid_references


def _highest_monetary_value(entities: list[Entity]) -> float:
    highest_value = 0.0
    for entity in entities:
        if entity.label != "MONETARY_VALUE":
            continue

        highest_value = max(highest_value, _first_number({"value": entity.text}, "value"))

    return highest_value


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
