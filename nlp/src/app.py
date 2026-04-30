from __future__ import annotations

import logging
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any

import spacy
import requests
from flask import Flask, jsonify, request
from pydantic import BaseModel, Field, ValidationError

from src.config import Settings, get_settings
from src.pipeline.conflict import compute_risk_score
from src.pipeline.graph_insert import insert_triples
from src.pipeline.ner import extract_entities, is_transformer_pipeline_ready
from src.pipeline.ocr import OCRError, extract_text_from_pdf
from src.pipeline.rel_extract import extract_relations
from src.utils.text_clean import clean_text

LOGGER = logging.getLogger(__name__)
IPFS_TIMEOUT_SECONDS = 30


def resolve_tesseract_command(command: str) -> str | None:
    candidate = Path(command)
    if candidate.is_absolute() or candidate.parent != Path("."):
        return str(candidate) if candidate.exists() else None

    return shutil.which(command)


class NLPProcessRequest(BaseModel):
    doc_hash: str = Field(alias="docHash", min_length=1)
    ipfs_cid: str = Field(alias="ipfsCID", min_length=1)
    metadata: dict[str, Any] = Field(default_factory=dict)


class IPFSFetchError(RuntimeError):
    """Raised when a document cannot be fetched from local IPFS."""


def fetch_ipfs_pdf_bytes(ipfs_api_url: str, ipfs_cid: str) -> bytes:
    base_url = ipfs_api_url.rstrip("/")
    try:
        response = requests.post(
            f"{base_url}/api/v0/cat",
            params={"arg": ipfs_cid},
            timeout=IPFS_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except requests.RequestException as error:
        raise IPFSFetchError(f"Could not fetch IPFS CID {ipfs_cid}") from error

    if not response.content:
        raise IPFSFetchError(f"IPFS CID {ipfs_cid} returned an empty document")
    return response.content


def build_graph_features(metadata: dict[str, Any], entities_count: int, triples_inserted: int) -> dict[str, Any]:
    graph_features = metadata.get("graphFeatures", {})
    if not isinstance(graph_features, dict):
        graph_features = {}

    return {
        **graph_features,
        "entitiesFound": entities_count,
        "triplesInserted": triples_inserted,
    }


def elapsed_ms(started_at: float) -> int:
    return int((time.perf_counter() - started_at) * 1000)


def failure_response(message: str, status_code: int, started_at: float) -> tuple[object, int]:
    LOGGER.warning("NLP processing failed: %s", message)
    return (
        jsonify(
            {
                "status": "failed",
                "riskScore": 0.0,
                "entitiesFound": 0,
                "triplesInserted": 0,
                "flags": [],
                "processingTimeMs": elapsed_ms(started_at),
                "error": message,
            }
        ),
        status_code,
    )


def create_app(settings: Settings | None = None) -> Flask:
    resolved_settings = settings or get_settings()
    app = Flask(__name__)

    @app.get("/nlp/health")
    def health() -> tuple[object, int]:
        tesseract_path = resolve_tesseract_command(resolved_settings.tesseract_cmd)
        legal_bert_path_exists = resolved_settings.ner_model_path.exists()
        legal_bert_runtime_ready = is_transformer_pipeline_ready()
        conflict_model_ready = resolved_settings.conflict_model_path.exists()
        try:
            spacy.load(resolved_settings.spacy_model)
            spacy_ready = True
        except OSError:
            spacy_ready = False

        runtime_ready = bool(tesseract_path) and legal_bert_runtime_ready and conflict_model_ready and spacy_ready

        payload = {
            "status": "ok" if runtime_ready else "degraded",
            "runtimeReady": runtime_ready,
            "checks": {
                "neo4jUri": resolved_settings.neo4j_uri,
                "ipfsApiUrl": resolved_settings.ipfs_api_url,
                "spacyModel": resolved_settings.spacy_model,
                "tesseract": {"configured": resolved_settings.tesseract_cmd, "resolved": tesseract_path},
                "legalBertModelPath": {
                    "path": str(resolved_settings.ner_model_path),
                    "exists": legal_bert_path_exists,
                    "loadedForTokenClassification": legal_bert_runtime_ready,
                },
                "conflictModelPath": {
                    "path": str(resolved_settings.conflict_model_path),
                    "exists": conflict_model_ready,
                },
                "spacyLoad": {"model": resolved_settings.spacy_model, "loaded": spacy_ready},
            },
        }
        return jsonify(payload), 200 if runtime_ready else 503

    @app.post("/nlp/process")
    def process_document() -> tuple[object, int]:
        started_at = time.perf_counter()

        try:
            payload = NLPProcessRequest.model_validate(request.get_json(silent=False))
        except ValidationError as error:
            return failure_response(error.errors()[0]["msg"], 400, started_at)
        except Exception:
            return failure_response("Request body must be valid JSON.", 400, started_at)

        temp_pdf_path: Path | None = None
        try:
            pdf_bytes = fetch_ipfs_pdf_bytes(resolved_settings.ipfs_api_url, payload.ipfs_cid)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
                temp_pdf.write(pdf_bytes)
                temp_pdf_path = Path(temp_pdf.name)

            raw_text = extract_text_from_pdf(str(temp_pdf_path))
            cleaned_text = clean_text(raw_text)
            entities = extract_entities(cleaned_text)
            triples = extract_relations(cleaned_text, entities)
            triples_inserted = insert_triples(triples, payload.doc_hash)
            graph_features = build_graph_features(payload.metadata, len(entities), triples_inserted)
            risk_result = compute_risk_score(payload.doc_hash, payload.metadata, graph_features)

            return (
                jsonify(
                    {
                        "status": "completed",
                        "riskScore": risk_result.score,
                        "entitiesFound": len(entities),
                        "triplesInserted": triples_inserted,
                        "flags": risk_result.flags,
                        "processingTimeMs": elapsed_ms(started_at),
                    }
                ),
                200,
            )
        except IPFSFetchError as error:
            return failure_response(str(error), 502, started_at)
        except OCRError as error:
            return failure_response(str(error), 422, started_at)
        except Exception:
            LOGGER.exception("Unexpected NLP processing error for docHash=%s", payload.doc_hash)
            return failure_response("NLP processing failed.", 500, started_at)
        finally:
            if temp_pdf_path is not None:
                temp_pdf_path.unlink(missing_ok=True)

    return app


app = create_app()


if __name__ == "__main__":
    settings = get_settings()
    app.run(host="0.0.0.0", port=settings.flask_port)
