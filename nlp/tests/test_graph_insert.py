
from __future__ import annotations

from typing import Any

import pytest

from src.models.triple import Triple
from src.pipeline import graph_insert


class FakeCounters:
    def __init__(self, nodes_created: int, relationships_created: int) -> None:
        self.nodes_created = nodes_created
        self.relationships_created = relationships_created


class FakeSummary:
    def __init__(self, counters: FakeCounters) -> None:
        self.counters = counters


class FakeResult:
    def __init__(self, nodes_created: int, relationships_created: int) -> None:
        self.counters = FakeCounters(nodes_created, relationships_created)

    def single(self) -> dict[str, int]:
        return {"touched": self.counters.nodes_created + self.counters.relationships_created}

    def consume(self) -> FakeSummary:
        return FakeSummary(self.counters)


class FakeTransaction:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def run(self, query: str, parameters: dict[str, Any]) -> FakeResult:
        self.calls.append((query, parameters))
        if "MERGE (s)-[r:" in query or "MERGE (d)-[r:" in query:
            return FakeResult(nodes_created=0, relationships_created=1)
        return FakeResult(nodes_created=1, relationships_created=0)


class FakeSession:
    def __init__(self) -> None:
        self.tx = FakeTransaction()

    def __enter__(self) -> FakeSession:
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        return None

    def execute_write(self, callback: object, *args: object) -> int:
        return callback(self.tx, *args)


class FakeDriver:
    def __init__(self) -> None:
        self.session_obj = FakeSession()

    def session(self) -> FakeSession:
        return self.session_obj


def test_insert_triples_returns_zero_for_empty_triples() -> None:
    assert graph_insert.insert_triples([], "abc123") == 0


def test_insert_triples_merges_nodes_and_relationships(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_driver = FakeDriver()
    monkeypatch.setattr(graph_insert, "get_driver", lambda: fake_driver)

    inserted = graph_insert.insert_triples(
        [
            Triple(
                subject="Ram Kumar",
                predicate="OWNS",
                object_="Sy.No.123/4",
                source_span="Ram Kumar owns property Sy.No.123/4.",
            )
        ],
        "doc-hash-1",
    )

    calls = fake_driver.session_obj.tx.calls
    queries = "\n".join(query for query, _parameters in calls)

    assert inserted == 6
    assert "MERGE (d:Document {hash: $docHash})" in queries
    assert "MERGE (n:Person {name: $name, id: $id})" in queries
    assert "MERGE (n:Property {id: $id})" in queries
    assert "MERGE (s)-[r:OWNS {sourceDoc: $docHash}]->(o)" in queries
    assert "MERGE (d)-[r:INVOLVES {sourceDoc: $docHash}]->(n)" in queries
    assert all("Ram Kumar" not in query for query, _parameters in calls)
    assert any(parameters.get("name") == "Ram Kumar" for _query, parameters in calls)
    assert any(parameters.get("id") == "Sy.No.123/4" for _query, parameters in calls)


def test_insert_triples_maps_legal_sections_to_legal_act(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_driver = FakeDriver()
    monkeypatch.setattr(graph_insert, "get_driver", lambda: fake_driver)

    graph_insert.insert_triples(
        [
            Triple(
                subject="Asha Rao",
                predicate="REFERENCES",
                object_="Section 17 of Registration Act",
                source_span="Asha Rao filed under Section 17 of Registration Act.",
            )
        ],
        "doc-hash-2",
    )

    calls = fake_driver.session_obj.tx.calls
    queries = "\n".join(query for query, _parameters in calls)

    assert "MERGE (n:LegalAct {name: $name, section: $section})" in queries
    assert "MERGE (s)-[r:REFERENCES {sourceDoc: $docHash}]->(o)" in queries
    assert any(
        parameters.get("name") == "Registration Act" and parameters.get("section") == "17"
        for _query, parameters in calls
    )


def test_insert_triples_rejects_unsupported_relationship(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_driver = FakeDriver()
    monkeypatch.setattr(graph_insert, "get_driver", lambda: fake_driver)

    with pytest.raises(ValueError, match="Unsupported relationship"):
        graph_insert.insert_triples(
            [Triple(subject="Ram Kumar", predicate="PAID", object_="Asha Rao", source_span="")],
            "doc-hash-3",
        )


def test_insert_triples_rejects_empty_doc_hash() -> None:
    with pytest.raises(ValueError, match="doc_hash"):
        graph_insert.insert_triples([], " ")
