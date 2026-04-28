from __future__ import annotations

import shutil
from pathlib import Path

import spacy
from flask import Flask, jsonify

from src.config import Settings, get_settings
from src.pipeline.ner import is_transformer_pipeline_ready


def resolve_tesseract_command(command: str) -> str | None:
    candidate = Path(command)
    if candidate.is_absolute() or candidate.parent != Path("."):
        return str(candidate) if candidate.exists() else None

    return shutil.which(command)


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

    return app


app = create_app()


if __name__ == "__main__":
    settings = get_settings()
    app.run(host="0.0.0.0", port=settings.flask_port)
