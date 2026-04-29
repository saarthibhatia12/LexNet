
from __future__ import annotations

from functools import lru_cache
from typing import Any

from neo4j import Driver, GraphDatabase
from neo4j.exceptions import Neo4jError

from src.config import get_settings


class Neo4jQueryError(RuntimeError):
    """Raised when a Neo4j query cannot be completed."""


@lru_cache(maxsize=1)
def get_driver() -> Driver:
    settings = get_settings()
    return GraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_user, settings.neo4j_password),
    )


def run_query(query: str, parameters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    if not query.strip():
        raise ValueError("Cypher query must not be empty.")

    try:
        with get_driver().session() as session:
            result = session.run(query, parameters or {})
            return [record.data() for record in result]
    except Neo4jError as error:
        raise Neo4jQueryError(f"Neo4j query failed: {error}") from error


def close_driver() -> None:
    if get_driver.cache_info().currsize:
        get_driver().close()
        get_driver.cache_clear()
