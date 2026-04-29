from __future__ import annotations

__all__ = ["extract_entities", "extract_relations", "extract_text_from_pdf"]


def __getattr__(name: str) -> object:
    if name == "extract_entities":
        from src.pipeline.ner import extract_entities

        return extract_entities
    if name == "extract_relations":
        from src.pipeline.rel_extract import extract_relations

        return extract_relations
    if name == "extract_text_from_pdf":
        from src.pipeline.ocr import extract_text_from_pdf

        return extract_text_from_pdf
    raise AttributeError(f"module 'src.pipeline' has no attribute {name!r}")
