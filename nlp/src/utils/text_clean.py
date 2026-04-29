
from __future__ import annotations

import re
import unicodedata
from collections import Counter

OCR_REPLACEMENTS = {
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2013": "-",
    "\u2014": "-",
    "\u00a0": " ",
}

HEADER_FOOTER_MIN_REPEATS = 2
HEADER_FOOTER_MAX_LENGTH = 90


def normalize_unicode(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    for source, replacement in OCR_REPLACEMENTS.items():
        normalized = normalized.replace(source, replacement)
    return normalized


def fix_ocr_artifacts(text: str) -> str:
    cleaned = normalize_unicode(text)
    cleaned = re.sub(r"(?<=\w)-\s*\n\s*(?=\w)", "", cleaned)
    cleaned = re.sub(r"(?<=\w)\s*\n\s*(?=\w)", " ", cleaned)
    cleaned = re.sub(r"\b(?:Sy|Svy)\.?\s*N[o0]\.?", "Sy.No.", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bSurvey\s+N[o0]\.?", "Survey No.", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bRs\s*[\.:]?\s*", "Rs. ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _is_page_marker(line: str) -> bool:
    return bool(
        re.fullmatch(r"(?:page\s*)?\d+(?:\s+of\s+\d+)?", line, flags=re.IGNORECASE)
        or re.fullmatch(r"-+\s*\d+\s*-+", line)
    )


def strip_headers_footers(text: str) -> str:
    lines = [line.strip() for line in normalize_unicode(text).splitlines()]
    candidates = [
        line
        for line in lines
        if line and len(line) <= HEADER_FOOTER_MAX_LENGTH and not _is_page_marker(line)
    ]
    repeated_lines = {
        line
        for line, count in Counter(candidates).items()
        if count >= HEADER_FOOTER_MIN_REPEATS
    }

    kept_lines = [
        line
        for line in lines
        if line and line not in repeated_lines and not _is_page_marker(line)
    ]
    return "\n".join(kept_lines).strip()


def clean_text(text: str) -> str:
    without_headers = strip_headers_footers(text)
    return fix_ocr_artifacts(without_headers)


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()
