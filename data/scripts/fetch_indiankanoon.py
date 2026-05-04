from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "https://api.indiankanoon.org"
DEFAULT_QUERY = '"property dispute" ANDD registration'
DEFAULT_TIMEOUT_SECONDS = 20
DEFAULT_RESULT_LIMIT = 3
TOKEN_ENV_VAR = "INDIANKANOON_API_TOKEN"


class IndianKanoonError(RuntimeError):
    """Raised when the Indian Kanoon API returns an error or unusable payload."""


@dataclass(frozen=True)
class FetchConfig:
    token: str
    base_url: str = DEFAULT_BASE_URL
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS


def build_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Token {token}",
        "Accept": "application/json",
        "User-Agent": "LexNet-INF3/1.0",
    }


def request_json(
    config: FetchConfig,
    endpoint: str,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    url = f"{config.base_url.rstrip('/')}{endpoint}"
    if params:
        url = f"{url}?{urlencode(params)}"

    request = Request(
        url,
        headers=build_headers(config.token),
        method="GET",
    )
    try:
        with urlopen(request, timeout=config.timeout_seconds) as response:
            raw_body = response.read()
            status_code = response.getcode()
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        if error.code == 403:
            raise IndianKanoonError(
                "Indian Kanoon rejected the request with HTTP 403. Check the API token and account permissions."
            ) from error
        raise IndianKanoonError(
            f"Indian Kanoon returned HTTP {error.code} for {url}: {body[:300]}"
        ) from error
    except URLError as error:
        raise IndianKanoonError(f"Failed to reach Indian Kanoon API at {url}") from error

    if status_code >= 400:
        raise IndianKanoonError(
            f"Indian Kanoon returned HTTP {status_code} for {url}."
        )

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError as error:
        raise IndianKanoonError(f"Indian Kanoon response from {url} was not valid JSON.") from error

    if not isinstance(payload, dict):
        raise IndianKanoonError(f"Unexpected response shape from {url}: expected JSON object.")
    return payload


def search_documents(
    config: FetchConfig,
    query: str,
    page: int,
) -> dict[str, Any]:
    return request_json(
        config,
        "/search/",
        params={"formInput": query, "pagenum": page},
    )


def fetch_document_meta(
    config: FetchConfig,
    doc_id: str | int,
) -> dict[str, Any]:
    return request_json(config, f"/docmeta/{doc_id}/")


def fetch_document(
    config: FetchConfig,
    doc_id: str | int,
) -> dict[str, Any]:
    return request_json(config, f"/doc/{doc_id}/")


def normalize_search_results(
    search_payload: dict[str, Any],
    limit: int,
) -> list[dict[str, Any]]:
    docs = search_payload.get("docs", [])
    if not isinstance(docs, list):
        raise IndianKanoonError('Search response did not contain a "docs" array.')
    return [doc for doc in docs[:limit] if isinstance(doc, dict)]


def build_bundle(
    query: str,
    page: int,
    search_payload: dict[str, Any],
    results: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "query": query,
        "page": page,
        "found": search_payload.get("found"),
        "categories": search_payload.get("categories", []),
        "results": results,
    }


def write_bundle(bundle: dict[str, Any], output_path: str | Path) -> Path:
    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(bundle, indent=2, ensure_ascii=True), encoding="utf-8")
    return destination


def resolve_token(cli_token: str | None) -> str:
    token = cli_token or os.getenv(TOKEN_ENV_VAR)
    if not token or not token.strip():
        raise IndianKanoonError(
            f"Missing API token. Pass --token or set the {TOKEN_ENV_VAR} environment variable."
        )
    return token.strip()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch sample Indian Kanoon search results and document metadata for LexNet."
    )
    parser.add_argument("--token", help="Indian Kanoon shared API token.")
    parser.add_argument("--query", default=DEFAULT_QUERY, help="Search query sent as formInput.")
    parser.add_argument("--page", type=int, default=0, help="Zero-based page number for search results.")
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_RESULT_LIMIT,
        help="Number of search results to enrich with docmeta calls.",
    )
    parser.add_argument(
        "--include-document",
        action="store_true",
        help="Fetch /doc/<docid>/ and include the returned document payload in the JSON bundle.",
    )
    parser.add_argument("--output", help="Optional JSON output path. When omitted, prints a summary only.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Override API base URL.")
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="HTTP timeout in seconds for each request.",
    )
    args = parser.parse_args()

    if args.page < 0:
        raise SystemExit("--page must be 0 or greater.")
    if args.limit <= 0:
        raise SystemExit("--limit must be greater than 0.")
    if args.timeout <= 0:
        raise SystemExit("--timeout must be greater than 0.")

    config = FetchConfig(
        token=resolve_token(args.token),
        base_url=args.base_url,
        timeout_seconds=args.timeout,
    )

    search_payload = search_documents(config, args.query, args.page)
    docs = normalize_search_results(search_payload, args.limit)

    enriched_results: list[dict[str, Any]] = []
    for doc in docs:
        doc_id = doc.get("tid")
        if doc_id in (None, ""):
            continue

        entry: dict[str, Any] = {
            "searchResult": doc,
            "docmeta": fetch_document_meta(config, doc_id),
        }
        if args.include_document:
            entry["document"] = fetch_document(config, doc_id)
        enriched_results.append(entry)

    bundle = build_bundle(args.query, args.page, search_payload, enriched_results)

    if args.output:
        written_path = write_bundle(bundle, args.output)
        print(f"Wrote Indian Kanoon results to {written_path}")
        return

    summary = {
        "query": bundle["query"],
        "page": bundle["page"],
        "found": bundle["found"],
        "resultsFetched": len(enriched_results),
        "docIds": [
            result.get("searchResult", {}).get("tid")
            for result in enriched_results
            if isinstance(result.get("searchResult"), dict)
        ],
    }
    print(json.dumps(summary, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
