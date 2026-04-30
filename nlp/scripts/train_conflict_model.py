
from __future__ import annotations

import argparse
import csv
import pickle
from collections import Counter
from pathlib import Path
from typing import Any

from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

FEATURE_COLUMNS = [
    "doc_age_days",
    "num_previous_transfers",
    "num_linked_disputes",
    "owner_change_frequency",
    "has_court_involvement",
    "monetary_value_normalized",
    "num_owners_last_year",
    "invalid_reference_count",
]

NLP_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = NLP_ROOT.parent
DEFAULT_DATA_PATH = REPO_ROOT / "data" / "conflict_training.csv"
DEFAULT_OUTPUT_PATH = NLP_ROOT / "data" / "conflict_model.pkl"


def load_dataset(data_path: str | Path) -> tuple[list[list[float]], list[int]]:
    path = Path(data_path)
    if not path.exists():
        raise FileNotFoundError(f"Conflict training CSV not found: {path}")

    features: list[list[float]] = []
    labels: list[int] = []
    with path.open("r", newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        missing_columns = [column for column in [*FEATURE_COLUMNS, "fraud"] if column not in (reader.fieldnames or [])]
        if missing_columns:
            raise ValueError(f"Conflict CSV missing columns: {', '.join(missing_columns)}")

        for row in reader:
            features.append([float(row[column]) for column in FEATURE_COLUMNS])
            labels.append(int(float(row["fraud"])))

    if len(features) < 10:
        raise ValueError("Conflict training CSV must contain at least 10 rows.")
    if len(set(labels)) < 2:
        raise ValueError("Conflict training CSV must include both fraud and legitimate examples.")
    return features, labels


def train_model(data_path: str | Path = DEFAULT_DATA_PATH, output_path: str | Path = DEFAULT_OUTPUT_PATH) -> dict[str, float]:
    features, labels = load_dataset(data_path)
    class_counts = Counter(labels)
    stratify_labels = labels if min(class_counts.values()) >= 2 else None
    x_train, x_test, y_train, y_test = train_test_split(
        features,
        labels,
        test_size=0.2,
        random_state=42,
        stratify=stratify_labels,
    )

    model = XGBClassifier(
        max_depth=3,
        n_estimators=60,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.85,
        reg_lambda=2.0,
        objective="binary:logistic",
        eval_metric="logloss",
        random_state=42,
    )
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("wb") as model_file:
        pickle.dump(model, model_file)

    return {
        "accuracy": round(float(accuracy_score(y_test, predictions)), 4),
        "precision": round(float(precision_score(y_test, predictions, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, predictions, zero_division=0)), 4),
        "f1": round(float(f1_score(y_test, predictions, zero_division=0)), 4),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the LexNet conflict detection model.")
    parser.add_argument("--data", default=str(DEFAULT_DATA_PATH), help="Synthetic conflict CSV path.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT_PATH), help="Model pickle output path.")
    args = parser.parse_args()

    metrics = train_model(args.data, args.output)
    print(metrics)


if __name__ == "__main__":
    main()
