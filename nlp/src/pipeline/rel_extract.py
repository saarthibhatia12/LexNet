
from __future__ import annotations

import re
from dataclasses import dataclass
from itertools import combinations

from src.models.entity import Entity
from src.models.triple import Triple
from src.utils.text_clean import normalize_unicode, normalize_whitespace

WINDOW_TOKENS = 50

PARTY_LABELS = {"PERSON", "ORGANISATION"}
PROPERTY_LABELS = {"PROPERTY_ID", "SURVEY_NUMBER"}
REFERENCE_LABELS = {"LEGAL_SECTION", "JURISDICTION"}

OWNERSHIP_CUES = re.compile(
    r"\b(?:owns?|owner|owned|possesses|possessed|held|holder|title\s+holder|"
    r"purchased|purchaser|buyer|acquired|transferred\s+to|conveyed\s+to|"
    r"sold\s+to|gifted\s+to|leased\s+to)\b",
    re.IGNORECASE,
)
TRANSFER_FROM_CUES = re.compile(r"\b(?:sold|transferred|conveyed|gifted|leased)\b", re.IGNORECASE)
REFERENCE_CUES = re.compile(
    r"\b(?:under|pursuant\s+to|as\s+per|according\s+to|refer(?:red|ence)?s?|"
    r"section|act|order|case|court|jurisdiction)\b",
    re.IGNORECASE,
)
INVOLVEMENT_CUES = re.compile(
    r"\b(?:executed|filed|signed|witnessed|registered|appeared|represented|"
    r"issued|ordered|disputed|concerns|involves)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class PositionedEntity:
    entity: Entity
    token_index: int


def extract_relations(text: str, entities: list[Entity]) -> list[Triple]:
    if not text or not text.strip() or len(entities) < 2:
        return []

    normalized_text = normalize_unicode(text)
    positioned_entities = _position_entities(normalized_text, entities)
    triples: list[Triple] = []
    seen: set[tuple[str, str, str, str]] = set()

    for left, right in combinations(positioned_entities, 2):
        if abs(left.token_index - right.token_index) > WINDOW_TOKENS:
            continue

        subject, predicate, object_, source_span = _infer_relation(normalized_text, left.entity, right.entity)
        if subject is None:
            continue

        key = (subject, predicate, object_, source_span)
        if key not in seen:
            triples.append(Triple(subject=subject, predicate=predicate, object_=object_, source_span=source_span))
            seen.add(key)

    return triples


def _position_entities(text: str, entities: list[Entity]) -> list[PositionedEntity]:
    token_spans = [(match.start(), match.end()) for match in re.finditer(r"\S+", text)]
    sorted_entities = sorted(entities, key=lambda entity: (entity.start, entity.end, entity.label))
    positioned: list[PositionedEntity] = []

    for entity in sorted_entities:
        token_index = _token_index_for_char(token_spans, entity.start)
        positioned.append(PositionedEntity(entity=entity, token_index=token_index))

    return positioned


def _token_index_for_char(token_spans: list[tuple[int, int]], char_index: int) -> int:
    for index, (start, end) in enumerate(token_spans):
        if start <= char_index < end:
            return index
        if char_index < start:
            return index
    return max(len(token_spans) - 1, 0)


def _infer_relation(
    text: str,
    first: Entity,
    second: Entity,
) -> tuple[str | None, str, str, str]:
    source_span = _source_span(text, first, second)
    first_label = first.label
    second_label = second.label

    if _is_party(first_label) and _is_property(second_label):
        predicate = "OWNS" if OWNERSHIP_CUES.search(source_span) else "INVOLVES"
        return first.text, predicate, second.text, source_span

    if _is_property(first_label) and _is_party(second_label):
        predicate = "OWNS" if OWNERSHIP_CUES.search(source_span) else "INVOLVES"
        return second.text, predicate, first.text, source_span

    if _is_party(first_label) and _is_reference(second_label) and REFERENCE_CUES.search(source_span):
        return first.text, "REFERENCES", second.text, source_span

    if _is_reference(first_label) and _is_party(second_label) and REFERENCE_CUES.search(source_span):
        return second.text, "REFERENCES", first.text, source_span

    if _is_property(first_label) and _is_reference(second_label) and REFERENCE_CUES.search(source_span):
        return first.text, "REFERENCES", second.text, source_span

    if _is_reference(first_label) and _is_property(second_label) and REFERENCE_CUES.search(source_span):
        return second.text, "REFERENCES", first.text, source_span

    if first_label == "PERSON" and second_label == "PERSON" and TRANSFER_FROM_CUES.search(source_span):
        return first.text, "INVOLVES", second.text, source_span

    if _eligible_for_involvement(first_label, second_label) and INVOLVEMENT_CUES.search(source_span):
        return first.text, "INVOLVES", second.text, source_span

    return None, "", "", ""


def _source_span(text: str, first: Entity, second: Entity) -> str:
    start = max(min(first.start, second.start) - 80, 0)
    end = min(max(first.end, second.end) + 80, len(text))
    return normalize_whitespace(text[start:end])


def _is_party(label: str) -> bool:
    return label in PARTY_LABELS


def _is_property(label: str) -> bool:
    return label in PROPERTY_LABELS


def _is_reference(label: str) -> bool:
    return label in REFERENCE_LABELS


def _eligible_for_involvement(first_label: str, second_label: str) -> bool:
    labels = {first_label, second_label}
    return bool(labels & PARTY_LABELS) and bool(labels & (PROPERTY_LABELS | REFERENCE_LABELS | {"DATE", "MONETARY_VALUE"}))
