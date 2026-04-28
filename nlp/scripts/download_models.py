from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import spacy
from huggingface_hub import snapshot_download

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

LEGAL_BERT_MODEL_ID = "nlpaueb/legal-bert-base-uncased"
DEFAULT_BASE_MODEL_CACHE = PROJECT_ROOT / "models" / "legal-bert-base-cache"
DEFAULT_RUNTIME_MODEL_PATH = (PROJECT_ROOT / "models" / "legal-bert").resolve()


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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Bootstrap NLP runtime dependencies without overwriting the Legal-BERT export path.",
    )
    parser.add_argument(
        "--spacy-model",
        default="en_core_web_sm",
        help="spaCy model to download and validate. Defaults to en_core_web_sm.",
    )
    parser.add_argument(
        "--download-base-model",
        action="store_true",
        help="Download the raw Legal-BERT base checkpoint into a cache directory separate from NER_MODEL_PATH.",
    )
    parser.add_argument(
        "--base-model-output",
        type=Path,
        default=DEFAULT_BASE_MODEL_CACHE,
        help=f"Directory for the raw base checkpoint. Defaults to {DEFAULT_BASE_MODEL_CACHE}.",
    )
    return parser.parse_args()


def resolve_output_path(path: Path) -> Path:
    return path if path.is_absolute() else (PROJECT_ROOT / path).resolve()


def validate_base_model_output(target_directory: Path) -> Path:
    resolved = resolve_output_path(target_directory)
    if resolved == DEFAULT_RUNTIME_MODEL_PATH:
        raise ValueError(
            "Refusing to download the raw Legal-BERT base checkpoint into NER_MODEL_PATH. "
            "Use a separate cache path such as ./models/legal-bert-base-cache.",
        )
    return resolved


def main() -> None:
    args = parse_args()

    download_spacy_model(args.spacy_model)
    validate_spacy_model(args.spacy_model)
    print(f"SPACY_OK={args.spacy_model}")

    if args.download_base_model:
        target_directory = validate_base_model_output(args.base_model_output)
        download_legal_bert(target_directory)
        print(f"LEGAL_BERT_BASE_CACHE_OK={target_directory}")
    else:
        print("LEGAL_BERT_BASE_CACHE_SKIPPED=true")


if __name__ == "__main__":
    main()
