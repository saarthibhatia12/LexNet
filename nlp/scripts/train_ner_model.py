from __future__ import annotations

import argparse
import inspect
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from statistics import mean
from typing import Any

import evaluate
import numpy as np
from datasets import Dataset
from seqeval.metrics import classification_report, f1_score, precision_score, recall_score
from transformers import (
    AutoConfig,
    AutoModelForTokenClassification,
    AutoTokenizer,
    DataCollatorForTokenClassification,
    Trainer,
    TrainingArguments,
    set_seed,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import NLP_ROOT

MAX_LENGTH = 512
WINDOW_STRIDE = 128
LEARNING_RATE = 3e-5
BATCH_SIZE = 8
EPOCHS = 5
SEED = 42
MIN_OVERALL_F1 = 0.75
MIN_CRITICAL_RECALL = 0.60
CRITICAL_LABELS = ("PROPERTY_ID", "SURVEY_NUMBER", "LEGAL_SECTION")


@dataclass(frozen=True, slots=True)
class EntitySpan:
    start: int
    end: int
    label: str


@dataclass(frozen=True, slots=True)
class NERRecord:
    id: str
    source_type: str
    text: str
    entities: tuple[EntitySpan, ...]


@dataclass(frozen=True, slots=True)
class LabelContract:
    canonical_labels: tuple[str, ...]
    aliases: dict[str, str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fine-tune and export the LexNet Legal-BERT NER model.")
    parser.add_argument(
        "--dataset-dir",
        type=Path,
        default=NLP_ROOT / "data" / "ner_training",
        help="Directory containing train.jsonl, validation.jsonl, test.jsonl, and label_contract.json.",
    )
    parser.add_argument(
        "--base-model",
        default="nlpaueb/legal-bert-base-uncased",
        help="Base Hugging Face model id or local path.",
    )
    parser.add_argument(
        "--artifacts-dir",
        type=Path,
        default=NLP_ROOT / "models" / "legal-bert-training",
        help="Directory for checkpoints, trainer state, and metric outputs.",
    )
    parser.add_argument(
        "--export-dir",
        type=Path,
        default=NLP_ROOT / "models" / "legal-bert",
        help="Directory for the final save_pretrained() export consumed by NER_MODEL_PATH.",
    )
    parser.add_argument("--max-length", type=int, default=MAX_LENGTH)
    parser.add_argument("--stride", type=int, default=WINDOW_STRIDE)
    parser.add_argument("--learning-rate", type=float, default=LEARNING_RATE)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--epochs", type=int, default=EPOCHS)
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument(
        "--min-overall-f1",
        type=float,
        default=MIN_OVERALL_F1,
        help="Minimum validation F1 required for export.",
    )
    parser.add_argument(
        "--min-critical-recall",
        type=float,
        default=MIN_CRITICAL_RECALL,
        help="Minimum validation recall required for PROPERTY_ID, SURVEY_NUMBER, and LEGAL_SECTION.",
    )
    return parser.parse_args()


def resolve_path(path: Path) -> Path:
    return path if path.is_absolute() else (PROJECT_ROOT / path).resolve()


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True, allow_nan=False), encoding="utf-8")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def load_supported_labels(path: Path) -> tuple[str, ...]:
    payload = read_json(path)
    labels = payload.get("labels")
    if not isinstance(labels, list) or not all(isinstance(label, str) for label in labels):
        raise ValueError(f"Invalid LexNet label file: {path}")
    return tuple(labels)


def load_label_contract(path: Path, expected_labels: tuple[str, ...]) -> LabelContract:
    payload = read_json(path)
    canonical_labels = payload.get("canonicalLabels")
    aliases = payload.get("aliases", {})

    if canonical_labels != list(expected_labels):
        raise ValueError(
            "label_contract.json canonicalLabels must exactly match nlp/data/ner_labels.json.",
        )
    if not isinstance(aliases, dict) or not all(isinstance(key, str) and isinstance(value, str) for key, value in aliases.items()):
        raise ValueError("label_contract.json aliases must be a string-to-string mapping.")
    return LabelContract(canonical_labels=tuple(canonical_labels), aliases=aliases)


def normalize_annotation_label(label: str, contract: LabelContract) -> str:
    normalized = label.strip().upper()
    if normalized in contract.canonical_labels:
        return normalized
    if normalized in contract.aliases:
        mapped = contract.aliases[normalized]
        if mapped in contract.canonical_labels:
            return mapped
    raise ValueError(f"Unsupported annotation label: {label}")


def validate_entities(text: str, entities: list[EntitySpan]) -> tuple[EntitySpan, ...]:
    ordered = sorted(entities, key=lambda entity: (entity.start, entity.end))
    for index, entity in enumerate(ordered):
        if entity.start < 0 or entity.end > len(text) or entity.start >= entity.end:
            raise ValueError(f"Invalid span {entity} for text length {len(text)}.")
        if not text[entity.start : entity.end].strip():
            raise ValueError(f"Entity span maps to blank text: {entity}")
        if index > 0 and entity.start < ordered[index - 1].end:
            raise ValueError("Overlapping entity spans are not allowed.")
    return tuple(ordered)


def load_split(path: Path, contract: LabelContract) -> list[NERRecord]:
    records: list[NERRecord] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), start=1):
        if not line.strip():
            continue
        payload = json.loads(line)
        record_id = payload.get("id")
        source_type = payload.get("source_type")
        text = payload.get("text")
        raw_entities = payload.get("entities", [])
        if not all(isinstance(value, str) for value in (record_id, source_type, text)):
            raise ValueError(f"{path}:{line_number} must contain string id, source_type, and text fields.")
        entities = [
            EntitySpan(
                start=int(entity["start"]),
                end=int(entity["end"]),
                label=normalize_annotation_label(str(entity["label"]), contract),
            )
            for entity in raw_entities
        ]
        records.append(
            NERRecord(
                id=record_id,
                source_type=source_type,
                text=text,
                entities=validate_entities(text, entities),
            ),
        )
    if not records:
        raise ValueError(f"Dataset split is empty: {path}")
    return records


def ensure_label_coverage(records: list[NERRecord], labels: tuple[str, ...], split_name: str) -> None:
    observed = {entity.label for record in records for entity in record.entities}
    missing = sorted(set(labels) - observed)
    if missing:
        raise ValueError(f"{split_name} split is missing labels: {', '.join(missing)}")


def build_bio_labels(canonical_labels: tuple[str, ...]) -> list[str]:
    labels = ["O"]
    for label in canonical_labels:
        labels.extend([f"B-{label}", f"I-{label}"])
    return labels


def find_span_for_token(token_start: int, token_end: int, entities: tuple[EntitySpan, ...]) -> EntitySpan | None:
    for entity in entities:
        if token_end <= entity.start:
            break
        if token_start < entity.end and token_end > entity.start:
            return entity
    return None


def build_feature_rows(
    records: list[NERRecord],
    tokenizer: Any,
    label2id: dict[str, int],
    max_length: int,
    stride: int,
) -> list[dict[str, list[int]]]:
    features: list[dict[str, list[int]]] = []
    for record in records:
        encoded = tokenizer(
            record.text,
            truncation=True,
            max_length=max_length,
            stride=stride,
            return_overflowing_tokens=True,
            return_offsets_mapping=True,
        )
        window_count = len(encoded["input_ids"])
        for index in range(window_count):
            offsets = encoded["offset_mapping"][index]
            labels: list[int] = []
            for token_start, token_end in offsets:
                if token_end <= token_start:
                    labels.append(-100)
                    continue

                entity = find_span_for_token(token_start, token_end, record.entities)
                if entity is None:
                    labels.append(label2id["O"])
                    continue

                prefix = "B" if token_start <= entity.start < token_end else "I"
                labels.append(label2id[f"{prefix}-{entity.label}"])

            feature = {
                "input_ids": list(encoded["input_ids"][index]),
                "attention_mask": list(encoded["attention_mask"][index]),
                "labels": labels,
            }
            if "token_type_ids" in encoded:
                feature["token_type_ids"] = list(encoded["token_type_ids"][index])
            features.append(feature)
    return features


def load_seqeval_metric() -> Any | None:
    try:
        return evaluate.load("seqeval")
    except Exception:
        return None


def extract_prediction_labels(
    logits: np.ndarray,
    label_ids: np.ndarray,
    id2label: dict[int, str],
) -> tuple[list[list[str]], list[list[str]]]:
    predictions = np.argmax(logits, axis=2)
    true_predictions: list[list[str]] = []
    true_labels: list[list[str]] = []

    for prediction_row, label_row in zip(predictions, label_ids):
        filtered_predictions: list[str] = []
        filtered_labels: list[str] = []
        for prediction_id, label_id in zip(prediction_row, label_row):
            if int(label_id) == -100:
                continue
            filtered_predictions.append(id2label[int(prediction_id)])
            filtered_labels.append(id2label[int(label_id)])
        true_predictions.append(filtered_predictions)
        true_labels.append(filtered_labels)

    return true_predictions, true_labels


def build_label_report(
    predictions: list[list[str]],
    references: list[list[str]],
    canonical_labels: tuple[str, ...],
) -> dict[str, dict[str, float]]:
    report = classification_report(references, predictions, output_dict=True, zero_division=0)
    summary: dict[str, dict[str, float]] = {}
    for label in canonical_labels:
        metrics = report.get(label, {})
        summary[label] = {
            "precision": float(metrics.get("precision", 0.0)),
            "recall": float(metrics.get("recall", 0.0)),
            "f1": float(metrics.get("f1-score", 0.0)),
            "support": float(metrics.get("support", 0.0)),
        }
    return summary


def calculate_metric_bundle(
    predictions: list[list[str]],
    references: list[list[str]],
    canonical_labels: tuple[str, ...],
) -> dict[str, Any]:
    metric = load_seqeval_metric()
    if metric is not None:
        try:
            metric.compute(predictions=predictions, references=references, zero_division=0)
        except Exception:
            pass

    label_report = build_label_report(predictions, references, canonical_labels)
    label_f1_values = [metrics["f1"] for metrics in label_report.values()]
    macro_f1 = mean(label_f1_values) if label_f1_values else 0.0
    return {
        "precision": float(precision_score(references, predictions, zero_division=0)),
        "recall": float(recall_score(references, predictions, zero_division=0)),
        "f1": float(f1_score(references, predictions, zero_division=0)),
        "macro_f1": float(macro_f1),
        "label_report": label_report,
    }


def compute_metrics_factory(id2label: dict[int, str], canonical_labels: tuple[str, ...]):
    def compute_metrics(eval_predictions: tuple[np.ndarray, np.ndarray]) -> dict[str, float]:
        logits, label_ids = eval_predictions
        predictions, references = extract_prediction_labels(logits, label_ids, id2label)
        metrics = calculate_metric_bundle(predictions, references, canonical_labels)
        return {
            "precision": metrics["precision"],
            "recall": metrics["recall"],
            "f1": metrics["f1"],
            "macro_f1": metrics["macro_f1"],
        }

    return compute_metrics


def evaluate_split(
    trainer: Trainer,
    dataset: Dataset,
    split_name: str,
    id2label: dict[int, str],
    canonical_labels: tuple[str, ...],
) -> dict[str, Any]:
    prediction_output = trainer.predict(dataset, metric_key_prefix=split_name)
    predictions, references = extract_prediction_labels(
        np.asarray(prediction_output.predictions),
        np.asarray(prediction_output.label_ids),
        id2label,
    )
    metrics = calculate_metric_bundle(predictions, references, canonical_labels)
    loss_value = prediction_output.metrics.get(f"{split_name}_loss")
    metrics["loss"] = float(loss_value) if loss_value is not None else None
    return metrics


def validate_thresholds(
    validation_metrics: dict[str, Any],
    min_overall_f1: float,
    min_critical_recall: float,
) -> None:
    if float(validation_metrics["f1"]) < min_overall_f1:
        raise ValueError(
            f"Validation F1 {validation_metrics['f1']:.3f} is below the required {min_overall_f1:.3f}.",
        )

    label_report = validation_metrics["label_report"]
    failing = [
        label
        for label in CRITICAL_LABELS
        if float(label_report.get(label, {}).get("recall", 0.0)) < min_critical_recall
    ]
    if failing:
        raise ValueError(
            "Critical label recall fell below the required threshold: "
            + ", ".join(failing),
        )


def validate_export_directory(
    export_dir: Path,
    canonical_labels: tuple[str, ...],
) -> None:
    config = AutoConfig.from_pretrained(str(export_dir), local_files_only=True)
    AutoTokenizer.from_pretrained(str(export_dir), local_files_only=True, use_fast=True)
    AutoModelForTokenClassification.from_pretrained(str(export_dir), local_files_only=True)

    id2label = getattr(config, "id2label", {}) or {}
    exported_labels = {str(label) for label in id2label.values()}
    if not exported_labels:
        raise ValueError("Exported config.json does not contain id2label entries.")
    if any(label.startswith("LABEL_") for label in exported_labels):
        raise ValueError("Exported config.json still contains generic LABEL_n ids.")
    if not all(any(exported == f"B-{label}" or exported == f"I-{label}" for exported in exported_labels) for label in canonical_labels):
        raise ValueError("Exported config.json is missing one or more canonical BIO labels.")


def build_dataset(path: Path, tokenizer: Any, label2id: dict[str, int], max_length: int, stride: int, contract: LabelContract) -> tuple[Dataset, dict[str, int]]:
    records = load_split(path, contract)
    ensure_label_coverage(records, contract.canonical_labels, path.stem)
    features = build_feature_rows(records, tokenizer, label2id, max_length, stride)
    if not features:
        raise ValueError(f"No token-classification features were produced for {path}.")
    return Dataset.from_list(features), {"records": len(records), "features": len(features)}


def main() -> None:
    args = parse_args()
    dataset_dir = resolve_path(args.dataset_dir)
    artifacts_dir = resolve_path(args.artifacts_dir)
    export_dir = resolve_path(args.export_dir)
    ensure_directory(artifacts_dir)
    ensure_directory(export_dir)

    lexnet_labels = load_supported_labels(NLP_ROOT / "data" / "ner_labels.json")
    contract = load_label_contract(dataset_dir / "label_contract.json", lexnet_labels)
    bio_labels = build_bio_labels(contract.canonical_labels)
    label2id = {label: index for index, label in enumerate(bio_labels)}
    id2label = {index: label for label, index in label2id.items()}

    set_seed(args.seed)
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, use_fast=True)
    model = AutoModelForTokenClassification.from_pretrained(
        args.base_model,
        num_labels=len(bio_labels),
        id2label=id2label,
        label2id=label2id,
    )

    train_dataset, train_stats = build_dataset(
        dataset_dir / "train.jsonl",
        tokenizer,
        label2id,
        args.max_length,
        args.stride,
        contract,
    )
    validation_dataset, validation_stats = build_dataset(
        dataset_dir / "validation.jsonl",
        tokenizer,
        label2id,
        args.max_length,
        args.stride,
        contract,
    )
    test_dataset, test_stats = build_dataset(
        dataset_dir / "test.jsonl",
        tokenizer,
        label2id,
        args.max_length,
        args.stride,
        contract,
    )

    training_argument_fields = inspect.signature(TrainingArguments.__init__).parameters
    training_argument_kwargs: dict[str, Any] = {
        "output_dir": str(artifacts_dir),
        "save_strategy": "epoch",
        "learning_rate": args.learning_rate,
        "per_device_train_batch_size": args.batch_size,
        "per_device_eval_batch_size": args.batch_size,
        "num_train_epochs": args.epochs,
        "weight_decay": 0.01,
        "logging_strategy": "steps",
        "logging_steps": 10,
        "save_total_limit": 2,
        "load_best_model_at_end": True,
        "metric_for_best_model": "macro_f1",
        "greater_is_better": True,
        "report_to": [],
        "seed": args.seed,
        "data_seed": args.seed,
        "save_safetensors": True,
    }
    if "eval_strategy" in training_argument_fields:
        training_argument_kwargs["eval_strategy"] = "epoch"
    else:
        training_argument_kwargs["evaluation_strategy"] = "epoch"

    training_arguments = TrainingArguments(**training_argument_kwargs)

    trainer = Trainer(
        model=model,
        args=training_arguments,
        train_dataset=train_dataset,
        eval_dataset=validation_dataset,
        tokenizer=tokenizer,
        data_collator=DataCollatorForTokenClassification(tokenizer=tokenizer),
        compute_metrics=compute_metrics_factory(id2label, contract.canonical_labels),
    )

    trainer.train()

    validation_metrics = evaluate_split(
        trainer,
        validation_dataset,
        "validation",
        id2label,
        contract.canonical_labels,
    )
    test_metrics = evaluate_split(
        trainer,
        test_dataset,
        "test",
        id2label,
        contract.canonical_labels,
    )

    validate_thresholds(validation_metrics, args.min_overall_f1, args.min_critical_recall)

    best_checkpoint = trainer.state.best_model_checkpoint or str(artifacts_dir)
    best_model = AutoModelForTokenClassification.from_pretrained(best_checkpoint)
    best_model.save_pretrained(str(export_dir))
    tokenizer.save_pretrained(str(export_dir))

    metadata = {
        "base_model": args.base_model,
        "best_checkpoint": best_checkpoint,
        "export_dir": str(export_dir),
        "dataset_dir": str(dataset_dir),
        "seed": args.seed,
        "max_length": args.max_length,
        "stride": args.stride,
        "learning_rate": args.learning_rate,
        "batch_size": args.batch_size,
        "epochs": args.epochs,
        "bio_labels": bio_labels,
        "dataset_counts": {
            "train": train_stats,
            "validation": validation_stats,
            "test": test_stats,
        },
    }

    write_json(
        artifacts_dir / "metrics.json",
        {
            "validation": validation_metrics,
            "test": test_metrics,
        },
    )
    write_json(
        artifacts_dir / "label_report.json",
        {
            "validation": validation_metrics["label_report"],
            "test": test_metrics["label_report"],
        },
    )
    write_json(artifacts_dir / "export_metadata.json", metadata)
    write_json(export_dir / "export_metadata.json", metadata)

    validate_export_directory(export_dir, contract.canonical_labels)

    print(f"TRAIN_METRICS_OK={artifacts_dir / 'metrics.json'}")
    print(f"LEGAL_BERT_EXPORT_OK={export_dir}")


if __name__ == "__main__":
    main()
