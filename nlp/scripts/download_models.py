from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import spacy
from huggingface_hub import snapshot_download

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import get_settings

LEGAL_BERT_MODEL_ID = "nlpaueb/legal-bert-base-uncased"


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def download_legal_bert(target_directory: Path) -> None:
    ensure_directory(target_directory)
    snapshot_download(
        repo_id=LEGAL_BERT_MODEL_ID,
        local_dir=target_directory,
    )


def download_spacy_model(model_name: str) -> None:
    subprocess.run(
        [sys.executable, "-m", "spacy", "download", model_name],
        check=True,
    )


def validate_spacy_model(model_name: str) -> None:
    spacy.load(model_name)


def main() -> None:
    settings = get_settings()
    download_legal_bert(settings.ner_model_path)
    download_spacy_model(settings.spacy_model)
    validate_spacy_model(settings.spacy_model)
    print(f"LEGAL_BERT_OK={settings.ner_model_path}")
    print(f"SPACY_OK={settings.spacy_model}")


if __name__ == "__main__":
    main()
