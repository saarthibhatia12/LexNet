from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Iterable

import spacy
from spacy.language import Language
from spacy.pipeline import EntityRuler
from transformers import AutoConfig, AutoModelForTokenClassification, AutoTokenizer, pipeline

from src.config import NLP_ROOT, get_settings
from src.models.entity import Entity

MIN_CONFIDENCE = 0.5
WINDOW_SIZE = 512
WINDOW_OVERLAP = 128
NER_LABELS_PATH = NLP_ROOT / "data" / "ner_labels.json"
GENERIC_LABEL_PATTERN = re.compile(r"^LABEL_\d+$")
SEQUENCE_LABEL_PREFIX_PATTERN = re.compile(r"^(?:B|I|L|U|S|E)[-_](?P<label>.+)$")

PERSON_PATTERNS = [
    re.compile(
        r"(?P<entity>\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+"
        r"(?:sold|purchased|transferred|executed|filed|gifted|leased)\b"
    ),
    re.compile(
        r"\b(?:buyer|seller|owner|purchaser|vendor|plaintiff|defendant|witness)\s*:\s*"
        r"(?P<entity>[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})",
        re.IGNORECASE,
    ),
]

PROPERTY_PATTERNS = [
    re.compile(
        r"\b(?:Property\s*ID|Property)\s*[:#-]?\s*(?P<entity>[A-Z0-9][A-Z0-9/-]{2,})\b",
        re.IGNORECASE,
    ),
    re.compile(r"(?P<entity>\bPROP[-/][A-Z0-9-]+\b)", re.IGNORECASE),
    re.compile(r"(?P<entity>\bSy\.?\s*No\.?\s*\d+(?:/\d+)*(?:-[A-Z0-9]+)?\b)", re.IGNORECASE),
]

SURVEY_NUMBER_PATTERNS = [
    re.compile(r"(?P<entity>\bSurvey\s*No\.?\s*\d+(?:/\d+)*(?:-[A-Z0-9]+)?\b)", re.IGNORECASE)
]

DATE_PATTERNS = [
    re.compile(r"(?P<entity>\b\d{4}-\d{2}-\d{2}\b)"),
    re.compile(r"(?P<entity>\b\d{2}/\d{2}/\d{4}\b)"),
    re.compile(
        r"(?P<entity>\b\d{1,2}\s+"
        r"(?:January|February|March|April|May|June|July|August|September|October|November|December)"
        r"\s+\d{4}\b)",
        re.IGNORECASE,
    ),
]

LEGAL_SECTION_PATTERNS = [
    re.compile(
        r"(?P<entity>\bSection\s+\d+[A-Za-z-]*(?:\(\d+\))?(?:\s+of\s+[A-Z][A-Za-z.\s]+)?\b)",
        re.IGNORECASE,
    )
]

JURISDICTION_PATTERNS = [
    re.compile(
        r"\b(?:jurisdiction|district|taluk|village|court)\s*:\s*"
        r"(?P<entity>[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})",
        re.IGNORECASE,
    )
]

ORGANISATION_PATTERNS = [
    re.compile(
        r"(?P<entity>\b[A-Z][A-Za-z&.\s]+(?:Bank|Authority|Office|Corporation|Registrar|Ltd|Limited)\b)"
    )
]

MONETARY_PATTERNS = [
    re.compile(r"(?P<entity>\b(?:Rs\.?|INR)\s*\d[\d,]*(?:\.\d{1,2})?\b)", re.IGNORECASE)
]


class NERConfigurationError(Exception):
    """Raised when the NER configuration files are invalid."""


@lru_cache(maxsize=1)
def load_supported_labels() -> tuple[str, ...]:
    try:
        payload = json.loads(NER_LABELS_PATH.read_text(encoding="utf-8-sig"))
    except FileNotFoundError as error:
        raise NERConfigurationError(f"NER labels file not found: {NER_LABELS_PATH}") from error
    except json.JSONDecodeError as error:
        raise NERConfigurationError(f"NER labels file is not valid JSON: {NER_LABELS_PATH}") from error

    labels = payload.get("labels")
    if not isinstance(labels, list) or not all(isinstance(label, str) for label in labels):
        raise NERConfigurationError("NER labels file must contain a string list under 'labels'.")
    return tuple(labels)


def strip_sequence_label_prefix(label: str) -> str:
    normalized_label = label.upper().strip()
    match = SEQUENCE_LABEL_PREFIX_PATTERN.match(normalized_label)
    return match.group("label") if match else normalized_label


def normalize_label(label: str) -> str | None:
    supported_labels = set(load_supported_labels())
    normalized_label = strip_sequence_label_prefix(label)
    if normalized_label in supported_labels:
        return normalized_label

    fallback_mapping = {
        "PER": "PERSON",
        "ORG": "ORGANISATION",
        "MONEY": "MONETARY_VALUE",
        "LAW": "LEGAL_SECTION",
        "GPE": "JURISDICTION",
        "LOC": "JURISDICTION",
        "FAC": "JURISDICTION",
    }
    mapped_label = fallback_mapping.get(normalized_label)
    return mapped_label if mapped_label in supported_labels else None


def clean_entity_text(text: str) -> str:
    return " ".join(text.replace("\n", " ").split()).strip(" ,;:")


def passes_label_heuristics(text: str, label: str) -> bool:
    cleaned = clean_entity_text(text)
    if not cleaned:
        return False

    if label == "PERSON":
        words = cleaned.split()
        if not 1 <= len(words) <= 3:
            return False
        return all(re.fullmatch(r"[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?", word) for word in words)

    if label == "DATE":
        return any(pattern.search(cleaned) for pattern in DATE_PATTERNS)

    if label in {"PROPERTY_ID", "SURVEY_NUMBER"}:
        return any(pattern.search(cleaned) for pattern in PROPERTY_PATTERNS + SURVEY_NUMBER_PATTERNS)

    if label == "LEGAL_SECTION":
        return any(pattern.search(cleaned) for pattern in LEGAL_SECTION_PATTERNS)

    if label == "JURISDICTION":
        return not any(character.isdigit() for character in cleaned)

    if label == "ORGANISATION":
        return any(pattern.search(cleaned) for pattern in ORGANISATION_PATTERNS) or cleaned.isupper()

    if label == "MONETARY_VALUE":
        return any(pattern.search(cleaned) for pattern in MONETARY_PATTERNS)

    return True


@lru_cache(maxsize=1)
def get_tokenizer():
    settings = get_settings()
    if not settings.ner_model_path.exists():
        return None

    try:
        return AutoTokenizer.from_pretrained(
            str(settings.ner_model_path),
            local_files_only=True,
            use_fast=True,
        )
    except Exception:
        return None


@lru_cache(maxsize=1)
def get_transformer_pipeline():
    settings = get_settings()
    if not settings.ner_model_path.exists():
        return None

    try:
        config = AutoConfig.from_pretrained(str(settings.ner_model_path), local_files_only=True)
    except Exception:
        return None

    id2label = getattr(config, "id2label", {}) or {}
    normalized_labels = {
        strip_sequence_label_prefix(str(label))
        for label in id2label.values()
        if isinstance(label, str)
    }
    if not normalized_labels or all(GENERIC_LABEL_PATTERN.match(label) for label in normalized_labels):
        return None

    mapped_labels = {normalize_label(label) for label in normalized_labels}
    mapped_labels.discard(None)
    if not mapped_labels:
        return None

    try:
        tokenizer = AutoTokenizer.from_pretrained(
            str(settings.ner_model_path),
            local_files_only=True,
            use_fast=True,
        )
        model = AutoModelForTokenClassification.from_pretrained(
            str(settings.ner_model_path),
            local_files_only=True,
        )
    except Exception:
        return None

    return pipeline(
        "token-classification",
        model=model,
        tokenizer=tokenizer,
        aggregation_strategy="simple",
    )


def is_transformer_pipeline_ready() -> bool:
    return get_transformer_pipeline() is not None


def build_entity_ruler(ruler: EntityRuler) -> None:
    ruler.add_patterns(
        [
            {
                "label": "PROPERTY_ID",
                "pattern": [{"TEXT": {"REGEX": "(?i)^PROP[-/][A-Z0-9-]+$"}}],
            },
            {
                "label": "LEGAL_SECTION",
                "pattern": [
                    {"LOWER": "section"},
                    {"TEXT": {"REGEX": "^\\d+[A-Za-z-]*(?:\\(\\d+\\))?$"}},
                ],
            },
            {
                "label": "MONETARY_VALUE",
                "pattern": [
                    {"LOWER": {"IN": ["rs", "rs.", "inr"]}},
                    {"TEXT": {"REGEX": "^\\d[\\d,]*(?:\\.\\d{1,2})?$"}},
                ],
            },
        ]
    )


@lru_cache(maxsize=1)
def get_nlp() -> Language:
    settings = get_settings()
    try:
        nlp = spacy.load(settings.spacy_model)
    except OSError:
        nlp = spacy.blank("en")

    if "entity_ruler" not in nlp.pipe_names:
        if "ner" in nlp.pipe_names:
            ruler = nlp.add_pipe("entity_ruler", before="ner")
        else:
            ruler = nlp.add_pipe("entity_ruler")
        build_entity_ruler(ruler)

    return nlp


def split_text_into_windows(
    text: str,
    max_tokens: int = WINDOW_SIZE,
    overlap: int = WINDOW_OVERLAP,
) -> list[tuple[int, str]]:
    stripped_text = text.strip()
    if not stripped_text:
        return []

    tokenizer = get_tokenizer()
    if tokenizer is not None:
        try:
            encoded = tokenizer(
                text,
                add_special_tokens=False,
                return_offsets_mapping=True,
                truncation=False,
            )
            offsets = encoded.get("offset_mapping", [])
            offsets = [offset for offset in offsets if offset[1] > offset[0]]
            if offsets:
                if len(offsets) <= max_tokens:
                    return [(0, text)]

                windows: list[tuple[int, str]] = []
                step = max_tokens - overlap
                for start_index in range(0, len(offsets), step):
                    end_index = min(start_index + max_tokens, len(offsets))
                    start_char = offsets[start_index][0]
                    end_char = offsets[end_index - 1][1]
                    windows.append((start_char, text[start_char:end_char]))
                    if end_index == len(offsets):
                        break
                return windows
        except Exception:
            pass

    matches = list(re.finditer(r"\S+", text))
    if not matches:
        return []
    if len(matches) <= max_tokens:
        return [(0, text)]

    windows = []
    step = max_tokens - overlap
    for start_index in range(0, len(matches), step):
        end_index = min(start_index + max_tokens, len(matches))
        start_char = matches[start_index].start()
        end_char = matches[end_index - 1].end()
        windows.append((start_char, text[start_char:end_char]))
        if end_index == len(matches):
            break
    return windows


def create_entity(text: str, label: str, start: int, end: int, confidence: float) -> Entity | None:
    cleaned_text = clean_entity_text(text)
    normalized = normalize_label(label)
    if (
        not cleaned_text
        or normalized is None
        or confidence < MIN_CONFIDENCE
        or end <= start
        or not passes_label_heuristics(cleaned_text, normalized)
    ):
        return None
    return Entity(
        text=cleaned_text,
        label=normalized,
        start=start,
        end=end,
        confidence=round(confidence, 3),
    )


def extract_transformer_entities(window_text: str, offset: int) -> list[Entity]:
    ner_pipeline = get_transformer_pipeline()
    if ner_pipeline is None:
        return []

    entities: list[Entity] = []
    for prediction in ner_pipeline(window_text):
        entity = create_entity(
            text=prediction.get("word", ""),
            label=str(prediction.get("entity_group", "")),
            start=offset + int(prediction.get("start", 0)),
            end=offset + int(prediction.get("end", 0)),
            confidence=float(prediction.get("score", 0.0)),
        )
        if entity is not None:
            entities.append(entity)
    return entities


def extract_spacy_entities(window_text: str, offset: int) -> list[Entity]:
    doc = get_nlp()(window_text)
    entities: list[Entity] = []
    for ent in doc.ents:
        confidence = 0.93 if ent.label_ in {"PROPERTY_ID", "LEGAL_SECTION", "MONETARY_VALUE"} else 0.74
        entity = create_entity(
            text=ent.text,
            label=ent.label_,
            start=offset + ent.start_char,
            end=offset + ent.end_char,
            confidence=confidence,
        )
        if entity is not None:
            entities.append(entity)
    return entities


def extract_pattern_entities(window_text: str, offset: int) -> list[Entity]:
    entities: list[Entity] = []
    pattern_sets: Iterable[tuple[str, float, list[re.Pattern[str]]]] = (
        ("PERSON", 0.91, PERSON_PATTERNS),
        ("PROPERTY_ID", 0.97, PROPERTY_PATTERNS),
        ("SURVEY_NUMBER", 0.96, SURVEY_NUMBER_PATTERNS),
        ("DATE", 0.94, DATE_PATTERNS),
        ("LEGAL_SECTION", 0.95, LEGAL_SECTION_PATTERNS),
        ("JURISDICTION", 0.88, JURISDICTION_PATTERNS),
        ("ORGANISATION", 0.86, ORGANISATION_PATTERNS),
        ("MONETARY_VALUE", 0.9, MONETARY_PATTERNS),
    )

    for label, confidence, patterns in pattern_sets:
        for pattern in patterns:
            for match in pattern.finditer(window_text):
                matched_text = match.groupdict().get("entity", match.group(0))
                start = offset + match.start("entity") if "entity" in match.groupdict() else offset + match.start()
                end = offset + match.end("entity") if "entity" in match.groupdict() else offset + match.end()
                entity = create_entity(
                    text=matched_text,
                    label=label,
                    start=start,
                    end=end,
                    confidence=confidence,
                )
                if entity is not None:
                    entities.append(entity)
    return entities


def deduplicate_entities(entities: list[Entity]) -> list[Entity]:
    sorted_entities = sorted(
        entities,
        key=lambda entity: (
            entity.start,
            -(entity.end - entity.start),
            -entity.confidence,
            entity.label,
        ),
    )

    deduplicated: list[Entity] = []
    for entity in sorted_entities:
        same_span = next(
            (
                existing
                for existing in deduplicated
                if existing.start == entity.start
                and existing.end == entity.end
                and existing.label == entity.label
            ),
            None,
        )
        if same_span is not None:
            if entity.confidence > same_span.confidence:
                deduplicated.remove(same_span)
                deduplicated.append(entity)
            continue

        overlaps = [
            existing
            for existing in deduplicated
            if existing.label == entity.label
            and not (entity.end <= existing.start or entity.start >= existing.end)
        ]
        if overlaps:
            strongest_overlap = max(overlaps, key=lambda existing: (existing.confidence, existing.end - existing.start))
            if (strongest_overlap.confidence, strongest_overlap.end - strongest_overlap.start) >= (
                entity.confidence,
                entity.end - entity.start,
            ):
                continue
            deduplicated.remove(strongest_overlap)

        deduplicated.append(entity)

    return sorted(deduplicated, key=lambda entity: (entity.start, entity.end, entity.label))


def extract_entities(text: str) -> list[Entity]:
    if not text or not text.strip():
        return []

    entities: list[Entity] = []
    for offset, window_text in split_text_into_windows(text):
        entities.extend(extract_transformer_entities(window_text, offset))
        entities.extend(extract_spacy_entities(window_text, offset))
        entities.extend(extract_pattern_entities(window_text, offset))

    return deduplicate_entities(entities)
