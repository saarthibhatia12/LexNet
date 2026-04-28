from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Entity:
    text: str
    label: str
    start: int
    end: int
    confidence: float
