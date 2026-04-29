
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Triple:
    subject: str
    predicate: str
    object_: str
    source_span: str
