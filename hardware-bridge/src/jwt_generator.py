"""
JWT generator for hardware bridge authentication.

Creates HS256-signed JWTs that the backend verifies to authenticate
fingerprint-based hardware logins. The JWT contract is:

    {
        "device_id": "A1B2C3D4",     # Hex string from packet
        "finger_score": 85,           # uint16 from packet
        "iat": 1710500000,            # Issued-at (Unix epoch)
        "exp": 1710500300,            # Expires in 5 minutes (iat + 300)
        "iss": "lexnet-bridge"        # Issuer — backend MUST check this
    }

Algorithm: HS256 (per AGENTS.md — never RS256, no PKI infrastructure)
"""

import logging
import time
from typing import Any

import jwt


logger = logging.getLogger(__name__)

# JWT issuer claim — backend MUST verify iss === "lexnet-bridge"
ISSUER: str = "lexnet-bridge"

# Token lifetime in seconds (5 minutes per contract)
TOKEN_EXPIRY_SECONDS: int = 300


def generate_hardware_jwt(
    device_id: str,
    finger_score: int,
    secret: str,
    issued_at: float | None = None,
) -> str:
    """
    Generate an HS256 JWT for hardware bridge authentication.

    Args:
        device_id: Device identifier as hex string (e.g., "A1B2C3D4").
        finger_score: Fingerprint match score from the packet (0–100).
        secret: HS256 signing key (must match backend JWT_SECRET).
        issued_at: Override issued-at timestamp for testing (Unix epoch float).
                   Defaults to current time.

    Returns:
        Encoded JWT string.

    Raises:
        ValueError: If device_id is empty or secret is too short.
        jwt.PyJWTError: On encoding failures.
    """
    if not device_id or not device_id.strip():
        raise ValueError("device_id must not be empty")

    if not secret or len(secret) < 32:
        raise ValueError(
            f"JWT secret must be at least 32 characters, got {len(secret) if secret else 0}"
        )

    iat = int(issued_at if issued_at is not None else time.time())
    exp = iat + TOKEN_EXPIRY_SECONDS

    payload: dict[str, Any] = {
        "device_id": device_id.strip(),
        "finger_score": finger_score,
        "iat": iat,
        "exp": exp,
        "iss": ISSUER,
    }

    token: str = jwt.encode(payload, secret, algorithm="HS256")

    logger.debug(
        "Generated JWT for device=%s score=%d exp=%d",
        device_id, finger_score, exp,
    )

    return token


def decode_hardware_jwt(
    token: str,
    secret: str,
    verify_exp: bool = True,
) -> dict[str, Any]:
    """
    Decode and verify a hardware bridge JWT.

    Useful for testing and debugging. The backend performs its own
    verification — this is NOT used in the bridge's main loop.

    Args:
        token: Encoded JWT string.
        secret: HS256 signing key.
        verify_exp: Whether to enforce expiry check (disable for testing).

    Returns:
        Decoded payload dictionary.

    Raises:
        jwt.ExpiredSignatureError: If token has expired (and verify_exp=True).
        jwt.InvalidTokenError: On any other verification failure.
    """
    options: dict[str, bool] = {}
    if not verify_exp:
        options["verify_exp"] = False

    decoded: dict[str, Any] = jwt.decode(
        token,
        secret,
        algorithms=["HS256"],
        options=options,
        issuer=ISSUER,
    )

    return decoded
