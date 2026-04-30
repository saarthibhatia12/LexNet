
from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path

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

DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "conflict_training.csv"
DEFAULT_LABEL_NOISE_RATE = 0.08
DEFAULT_AMBIGUOUS_RATE = 0.25


def generate_row(
    rng: random.Random,
    profile: str,
    label_noise_rate: float = DEFAULT_LABEL_NOISE_RATE,
) -> dict[str, float | int]:
    doc_age_days = rng.randint(0, 3650)

    if profile == "risky":
        num_previous_transfers = rng.randint(2, 7)
        num_linked_disputes = rng.choices([0, 1, 2, 3], weights=[2, 4, 3, 1], k=1)[0]
        owner_change_frequency = round(rng.uniform(1.4, 4.8), 2)
        has_court_involvement = rng.choices([0, 1], weights=[35, 65], k=1)[0]
        monetary_value_normalized = round(rng.uniform(0.35, 1.0), 4)
        num_owners_last_year = rng.randint(2, 6)
        invalid_reference_count = rng.choices([0, 1, 2, 3], weights=[3, 4, 2, 1], k=1)[0]
    elif profile == "ambiguous":
        num_previous_transfers = rng.randint(1, 5)
        num_linked_disputes = rng.choices([0, 1, 2], weights=[5, 4, 1], k=1)[0]
        owner_change_frequency = round(rng.uniform(0.7, 3.4), 2)
        has_court_involvement = rng.choices([0, 1], weights=[55, 45], k=1)[0]
        monetary_value_normalized = round(rng.uniform(0.15, 0.9), 4)
        num_owners_last_year = rng.randint(1, 5)
        invalid_reference_count = rng.choices([0, 1, 2], weights=[6, 3, 1], k=1)[0]
    else:
        num_previous_transfers = rng.randint(0, 4)
        num_linked_disputes = rng.choices([0, 1, 2], weights=[8, 2, 1], k=1)[0]
        owner_change_frequency = round(rng.uniform(0, 2.6), 2)
        has_court_involvement = rng.choices([0, 1], weights=[75, 25], k=1)[0]
        monetary_value_normalized = round(rng.uniform(0.02, 0.75), 4)
        num_owners_last_year = rng.randint(1, 3)
        invalid_reference_count = rng.choices([0, 1], weights=[8, 2], k=1)[0]

    risk_points = 0
    risk_points += 3 if num_owners_last_year > 3 else 0
    risk_points += 2 if num_previous_transfers >= 4 else 0
    risk_points += 2 if owner_change_frequency >= 3 else 0
    risk_points += 3 if num_linked_disputes > 0 else 0
    risk_points += 3 if invalid_reference_count > 0 else 0
    risk_points += 2 if has_court_involvement else 0
    risk_points += 1 if monetary_value_normalized >= 0.9 else 0
    risk_points += 1 if doc_age_days < 30 and num_previous_transfers > 1 else 0

    risk_points += rng.uniform(-1.5, 1.5)
    fraud_probability = min(max((risk_points - 3.0) / 8.0, 0.05), 0.95)
    fraud = 1 if rng.random() < fraud_probability else 0
    if rng.random() < label_noise_rate:
        fraud = 1 - fraud

    return {
        "doc_age_days": doc_age_days,
        "num_previous_transfers": num_previous_transfers,
        "num_linked_disputes": num_linked_disputes,
        "owner_change_frequency": owner_change_frequency,
        "has_court_involvement": has_court_involvement,
        "monetary_value_normalized": monetary_value_normalized,
        "num_owners_last_year": num_owners_last_year,
        "invalid_reference_count": invalid_reference_count,
        "fraud": fraud,
    }


def generate_conflict_data(
    output_path: str | Path = DEFAULT_OUTPUT,
    rows: int = 500,
    seed: int = 42,
    label_noise_rate: float = DEFAULT_LABEL_NOISE_RATE,
    ambiguous_rate: float = DEFAULT_AMBIGUOUS_RATE,
) -> Path:
    if rows <= 0:
        raise ValueError("rows must be greater than 0.")
    if not 0 <= label_noise_rate <= 0.5:
        raise ValueError("label_noise_rate must be between 0 and 0.5.")
    if not 0 <= ambiguous_rate <= 0.8:
        raise ValueError("ambiguous_rate must be between 0 and 0.8.")

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    rng = random.Random(seed)
    risky_rate = (1.0 - ambiguous_rate) / 2.0
    normal_rate = 1.0 - ambiguous_rate - risky_rate

    with output.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=[*FEATURE_COLUMNS, "fraud"])
        writer.writeheader()
        profiles = rng.choices(
            ["normal", "ambiguous", "risky"],
            weights=[normal_rate, ambiguous_rate, risky_rate],
            k=rows,
        )
        for profile in profiles:
            writer.writerow(generate_row(rng, profile, label_noise_rate))

    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate LexNet synthetic conflict training data.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="CSV output path.")
    parser.add_argument("--rows", type=int, default=500, help="Number of rows to generate.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed.")
    parser.add_argument(
        "--label-noise-rate",
        type=float,
        default=DEFAULT_LABEL_NOISE_RATE,
        help="Fraction of labels to randomly flip for realistic imperfect data.",
    )
    parser.add_argument(
        "--ambiguous-rate",
        type=float,
        default=DEFAULT_AMBIGUOUS_RATE,
        help="Fraction of rows drawn from overlapping borderline cases.",
    )
    args = parser.parse_args()

    output = generate_conflict_data(
        args.output,
        args.rows,
        args.seed,
        args.label_noise_rate,
        args.ambiguous_rate,
    )
    print(f"Generated {args.rows} rows at {output}")


if __name__ == "__main__":
    main()
