
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class RiskResult:
    score: float
    flags: list[str] = field(default_factory=list)
    explanation: str = ""

    def __post_init__(self) -> None:
        if not 0 <= self.score <= 100:
            raise ValueError("Risk score must be between 0 and 100.")
