"""
Hardware Bridge configuration loader.

Loads environment variables from .env file using python-dotenv.
All config values are validated and typed.
"""

import os
import logging
from pathlib import Path
from dotenv import load_dotenv


# Load .env from the hardware-bridge root directory
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)


def _get_required_env(key: str) -> str:
    """Get a required environment variable or raise an error."""
    value = os.getenv(key)
    if value is None or value.strip() == "":
        raise EnvironmentError(
            f"Missing required environment variable: {key}. "
            f"Check your .env file at {_env_path}"
        )
    return value.strip()


def _get_env_int(key: str, default: int) -> int:
    """Get an environment variable as an integer with a default."""
    raw = os.getenv(key)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw.strip())
    except ValueError as exc:
        raise EnvironmentError(
            f"Environment variable {key} must be an integer, got: {raw!r}"
        ) from exc


# --- Serial / UART Configuration ---
SERIAL_PORT: str = _get_required_env("SERIAL_PORT")
BAUD_RATE: int = _get_env_int("BAUD_RATE", 57600)

# --- Authentication ---
JWT_SECRET: str = _get_required_env("JWT_SECRET")

# --- Backend API ---
API_URL: str = _get_required_env("API_URL")

# --- Logging ---
BRIDGE_LOG_LEVEL: str = os.getenv("BRIDGE_LOG_LEVEL", "INFO").strip().upper()

# --- Validation Thresholds ---
TIMESTAMP_TOLERANCE_SEC: int = _get_env_int("TIMESTAMP_TOLERANCE_SEC", 30)
MIN_FINGER_SCORE: int = _get_env_int("MIN_FINGER_SCORE", 60)


def _validate_config() -> None:
    """Validate configuration values at import time."""
    if len(JWT_SECRET) < 32:
        raise EnvironmentError(
            f"JWT_SECRET must be at least 32 characters long, got {len(JWT_SECRET)}"
        )

    if BAUD_RATE != 57600:
        logging.warning(
            "BAUD_RATE is %d — expected 57600 per UART protocol spec", BAUD_RATE
        )

    if TIMESTAMP_TOLERANCE_SEC <= 0:
        raise EnvironmentError(
            f"TIMESTAMP_TOLERANCE_SEC must be positive, got {TIMESTAMP_TOLERANCE_SEC}"
        )

    if MIN_FINGER_SCORE < 0 or MIN_FINGER_SCORE > 100:
        raise EnvironmentError(
            f"MIN_FINGER_SCORE must be 0-100, got {MIN_FINGER_SCORE}"
        )

    valid_levels = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
    if BRIDGE_LOG_LEVEL not in valid_levels:
        raise EnvironmentError(
            f"BRIDGE_LOG_LEVEL must be one of {valid_levels}, got {BRIDGE_LOG_LEVEL!r}"
        )


_validate_config()
