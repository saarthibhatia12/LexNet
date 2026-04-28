from __future__ import annotations

from src.pipeline.ner import create_entity, extract_entities, normalize_label


def test_extract_entities_returns_person_property_and_date() -> None:
    text = (
        "Ram Kumar sold property Sy.No.123/4 in Bengaluru Urban on 2026-04-05 "
        "for Rs. 500000 to Asha Rao."
    )

    entities = extract_entities(text)

    assert any(entity.label == "PERSON" and entity.text == "Ram Kumar" for entity in entities)
    assert any(entity.label == "PROPERTY_ID" and "Sy.No.123/4" in entity.text for entity in entities)
    assert any(entity.label == "DATE" and entity.text == "2026-04-05" for entity in entities)
    assert all(entity.confidence >= 0.5 for entity in entities)


def test_extract_entities_detects_property_identifier() -> None:
    entities = extract_entities("The land parcel is recorded as Sy.No.123/4 in the deed.")

    assert any(entity.label == "PROPERTY_ID" and entity.text == "Sy.No.123/4" for entity in entities)


def test_extract_entities_sliding_window_for_long_text() -> None:
    filler = " ".join(f"token{i}" for i in range(700))
    text = f"{filler} Buyer: Megha Sharma executed sale deed on 05 April 2026."

    entities = extract_entities(text)

    assert any(entity.label == "PERSON" and entity.text == "Megha Sharma" for entity in entities)
    assert any(entity.label == "DATE" and entity.text == "05 April 2026" for entity in entities)


def test_extract_entities_empty_text_returns_empty_list() -> None:
    assert extract_entities("") == []


def test_normalize_label_maps_per_alias_to_person() -> None:
    assert normalize_label("PER") == "PERSON"


def test_create_entity_supports_bio_prefixed_labels() -> None:
    entity = create_entity(
        text="Asha Rao",
        label="B-PERSON",
        start=0,
        end=8,
        confidence=0.93,
    )

    assert entity is not None
    assert entity.label == "PERSON"
