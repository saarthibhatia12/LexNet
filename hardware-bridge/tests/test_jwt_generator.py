"""
Tests for JWT generator and API client.

Validates:
- JWT payload fields (device_id, finger_score, iat, exp, iss)
- Expiry is exactly 5 minutes (300 seconds)
- HS256 algorithm
- Issuer claim is "lexnet-bridge"
- Decode round-trip
- Expired token rejection
- Wrong secret rejection
- Input validation (empty device_id, short secret)
- API client handles connection refused, 401, 5xx gracefully
"""

import time
from unittest.mock import MagicMock, patch

import jwt as pyjwt
import pytest
import requests

from src.jwt_generator import (
    ISSUER,
    TOKEN_EXPIRY_SECONDS,
    decode_hardware_jwt,
    generate_hardware_jwt,
)
from src.api_client import (
    APIAuthError,
    APIConnectionError,
    APIServerError,
    post_hardware_auth,
)


# Consistent test secret (≥ 32 chars)
TEST_SECRET = "test-secret-key-must-be-at-least-32-characters-long"


# ---------------------------------------------------------------------------
# JWT Generator tests
# ---------------------------------------------------------------------------

class TestGenerateHardwareJWT:
    """Tests for generate_hardware_jwt."""

    def test_returns_string(self) -> None:
        """JWT should be a non-empty string."""
        token = generate_hardware_jwt("A1B2C3D4", 85, TEST_SECRET)
        assert isinstance(token, str)
        assert len(token) > 0

    def test_payload_device_id(self) -> None:
        """Payload must contain the device_id."""
        token = generate_hardware_jwt("A1B2C3D4", 85, TEST_SECRET)
        payload = pyjwt.decode(token, TEST_SECRET, algorithms=["HS256"])
        assert payload["device_id"] == "A1B2C3D4"

    def test_payload_finger_score(self) -> None:
        """Payload must contain the finger_score as integer."""
        token = generate_hardware_jwt("DEADBEEF", 92, TEST_SECRET)
        payload = pyjwt.decode(token, TEST_SECRET, algorithms=["HS256"])
        assert payload["finger_score"] == 92

    def test_payload_issuer(self) -> None:
        """Payload iss must be 'lexnet-bridge'."""
        token = generate_hardware_jwt("A1B2C3D4", 85, TEST_SECRET)
        payload = pyjwt.decode(token, TEST_SECRET, algorithms=["HS256"])
        assert payload["iss"] == "lexnet-bridge"

    def test_expiry_is_5_minutes(self) -> None:
        """exp must be exactly iat + 300 seconds."""
        now = int(time.time())
        token = generate_hardware_jwt("A1B2C3D4", 85, TEST_SECRET, issued_at=now)
        payload = pyjwt.decode(
            token, TEST_SECRET, algorithms=["HS256"],
            options={"verify_exp": False},
        )
        assert payload["iat"] == now
        assert payload["exp"] == now + 300

    def test_expiry_constant_matches(self) -> None:
        """TOKEN_EXPIRY_SECONDS should be 300."""
        assert TOKEN_EXPIRY_SECONDS == 300

    def test_hs256_algorithm(self) -> None:
        """Token must use HS256 algorithm."""
        token = generate_hardware_jwt("A1B2C3D4", 85, TEST_SECRET)
        # Decode header without verification to check algorithm
        header = pyjwt.get_unverified_header(token)
        assert header["alg"] == "HS256"

    def test_issuer_constant(self) -> None:
        """ISSUER constant should be 'lexnet-bridge'."""
        assert ISSUER == "lexnet-bridge"

    def test_custom_issued_at(self) -> None:
        """issued_at parameter should override the iat claim."""
        fixed_time = 1710500000
        token = generate_hardware_jwt(
            "A1B2C3D4", 85, TEST_SECRET, issued_at=fixed_time,
        )
        payload = pyjwt.decode(
            token, TEST_SECRET, algorithms=["HS256"],
            options={"verify_exp": False},
        )
        assert payload["iat"] == 1710500000
        assert payload["exp"] == 1710500300

    def test_zero_score(self) -> None:
        """Score of 0 should be encoded (validation is at packet level)."""
        token = generate_hardware_jwt("A1B2C3D4", 0, TEST_SECRET)
        payload = pyjwt.decode(token, TEST_SECRET, algorithms=["HS256"])
        assert payload["finger_score"] == 0

    def test_max_score(self) -> None:
        """Score of 100 should be encoded correctly."""
        token = generate_hardware_jwt("A1B2C3D4", 100, TEST_SECRET)
        payload = pyjwt.decode(token, TEST_SECRET, algorithms=["HS256"])
        assert payload["finger_score"] == 100

    def test_strips_whitespace_device_id(self) -> None:
        """Leading/trailing whitespace in device_id should be stripped."""
        token = generate_hardware_jwt("  A1B2C3D4  ", 85, TEST_SECRET)
        payload = pyjwt.decode(token, TEST_SECRET, algorithms=["HS256"])
        assert payload["device_id"] == "A1B2C3D4"

    def test_empty_device_id_raises(self) -> None:
        """Empty device_id should raise ValueError."""
        with pytest.raises(ValueError, match="device_id must not be empty"):
            generate_hardware_jwt("", 85, TEST_SECRET)

    def test_whitespace_only_device_id_raises(self) -> None:
        """Whitespace-only device_id should raise ValueError."""
        with pytest.raises(ValueError, match="device_id must not be empty"):
            generate_hardware_jwt("   ", 85, TEST_SECRET)

    def test_short_secret_raises(self) -> None:
        """Secret shorter than 32 chars should raise ValueError."""
        with pytest.raises(ValueError, match="at least 32 characters"):
            generate_hardware_jwt("A1B2C3D4", 85, "too-short")

    def test_empty_secret_raises(self) -> None:
        """Empty secret should raise ValueError."""
        with pytest.raises(ValueError, match="at least 32 characters"):
            generate_hardware_jwt("A1B2C3D4", 85, "")

    def test_all_payload_fields_present(self) -> None:
        """JWT must contain exactly these 5 fields."""
        token = generate_hardware_jwt("A1B2C3D4", 85, TEST_SECRET)
        payload = pyjwt.decode(token, TEST_SECRET, algorithms=["HS256"])
        expected_keys = {"device_id", "finger_score", "iat", "exp", "iss"}
        assert set(payload.keys()) == expected_keys


# ---------------------------------------------------------------------------
# JWT Decode / Round-trip tests
# ---------------------------------------------------------------------------

class TestDecodeHardwareJWT:
    """Tests for decode_hardware_jwt."""

    def test_roundtrip(self) -> None:
        """Encode → decode should preserve all fields."""
        now = int(time.time())
        token = generate_hardware_jwt("CAFEBABE", 77, TEST_SECRET, issued_at=now)
        payload = decode_hardware_jwt(token, TEST_SECRET)

        assert payload["device_id"] == "CAFEBABE"
        assert payload["finger_score"] == 77
        assert payload["iat"] == now
        assert payload["exp"] == now + 300
        assert payload["iss"] == "lexnet-bridge"

    def test_wrong_secret_rejected(self) -> None:
        """Decoding with wrong secret should raise InvalidSignatureError."""
        token = generate_hardware_jwt("A1B2C3D4", 85, TEST_SECRET)
        wrong_secret = "wrong-secret-that-is-at-least-32-chars-long!!"

        with pytest.raises(pyjwt.InvalidSignatureError):
            decode_hardware_jwt(token, wrong_secret)

    def test_expired_token_rejected(self) -> None:
        """Expired token should raise ExpiredSignatureError."""
        # Issue a token 10 minutes in the past → already expired
        old_time = int(time.time()) - 600
        token = generate_hardware_jwt(
            "A1B2C3D4", 85, TEST_SECRET, issued_at=old_time,
        )

        with pytest.raises(pyjwt.ExpiredSignatureError):
            decode_hardware_jwt(token, TEST_SECRET, verify_exp=True)

    def test_expired_token_accepted_when_verify_off(self) -> None:
        """Expired token should decode when verify_exp=False."""
        old_time = int(time.time()) - 600
        token = generate_hardware_jwt(
            "A1B2C3D4", 85, TEST_SECRET, issued_at=old_time,
        )

        payload = decode_hardware_jwt(token, TEST_SECRET, verify_exp=False)
        assert payload["device_id"] == "A1B2C3D4"

    def test_tampered_token_rejected(self) -> None:
        """A token with a modified payload should fail verification."""
        token = generate_hardware_jwt("A1B2C3D4", 85, TEST_SECRET)
        # Tamper: replace a character in the payload section
        parts = token.split(".")
        tampered_payload = parts[1][:-1] + ("A" if parts[1][-1] != "A" else "B")
        tampered_token = f"{parts[0]}.{tampered_payload}.{parts[2]}"

        with pytest.raises(pyjwt.InvalidTokenError):
            decode_hardware_jwt(tampered_token, TEST_SECRET)

    def test_wrong_issuer_rejected(self) -> None:
        """Token with wrong issuer should be rejected."""
        # Manually create a token with wrong issuer
        payload = {
            "device_id": "A1B2C3D4",
            "finger_score": 85,
            "iat": int(time.time()),
            "exp": int(time.time()) + 300,
            "iss": "wrong-issuer",
        }
        token = pyjwt.encode(payload, TEST_SECRET, algorithm="HS256")

        with pytest.raises(pyjwt.InvalidIssuerError):
            decode_hardware_jwt(token, TEST_SECRET)


# ---------------------------------------------------------------------------
# API Client tests
# ---------------------------------------------------------------------------

class TestPostHardwareAuth:
    """Tests for post_hardware_auth."""

    def test_success_200(self) -> None:
        """200 response should return (True, 200)."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.reason = "OK"

        with patch("src.api_client.requests.post", return_value=mock_response):
            success, status = post_hardware_auth(
                "http://localhost:4000", "fake-token",
            )

        assert success is True
        assert status == 200

    def test_success_201(self) -> None:
        """201 response should also return (True, 201)."""
        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_response.reason = "Created"

        with patch("src.api_client.requests.post", return_value=mock_response):
            success, status = post_hardware_auth(
                "http://localhost:4000", "fake-token",
            )

        assert success is True
        assert status == 201

    def test_auth_failure_401(self) -> None:
        """401 response should raise APIAuthError."""
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.reason = "Unauthorized"
        mock_response.text = "Invalid token"

        with patch("src.api_client.requests.post", return_value=mock_response):
            with pytest.raises(APIAuthError) as exc_info:
                post_hardware_auth("http://localhost:4000", "bad-token")

        assert exc_info.value.status_code == 401

    def test_auth_failure_403(self) -> None:
        """403 response should raise APIAuthError."""
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.reason = "Forbidden"
        mock_response.text = "Insufficient score"

        with patch("src.api_client.requests.post", return_value=mock_response):
            with pytest.raises(APIAuthError) as exc_info:
                post_hardware_auth("http://localhost:4000", "bad-token")

        assert exc_info.value.status_code == 403

    def test_server_error_500(self) -> None:
        """500 response should raise APIServerError."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.reason = "Internal Server Error"
        mock_response.text = "Something broke"

        with patch("src.api_client.requests.post", return_value=mock_response):
            with pytest.raises(APIServerError) as exc_info:
                post_hardware_auth("http://localhost:4000", "token")

        assert exc_info.value.status_code == 500

    def test_server_error_503(self) -> None:
        """503 response should raise APIServerError."""
        mock_response = MagicMock()
        mock_response.status_code = 503
        mock_response.reason = "Service Unavailable"
        mock_response.text = "Backend overloaded"

        with patch("src.api_client.requests.post", return_value=mock_response):
            with pytest.raises(APIServerError) as exc_info:
                post_hardware_auth("http://localhost:4000", "token")

        assert exc_info.value.status_code == 503

    def test_connection_refused(self) -> None:
        """Connection refused should raise APIConnectionError."""
        with patch(
            "src.api_client.requests.post",
            side_effect=requests.ConnectionError("Connection refused"),
        ):
            with pytest.raises(APIConnectionError, match="Cannot reach backend"):
                post_hardware_auth("http://localhost:4000", "token")

    def test_timeout(self) -> None:
        """Request timeout should raise APIConnectionError."""
        with patch(
            "src.api_client.requests.post",
            side_effect=requests.Timeout("Request timed out"),
        ):
            with pytest.raises(APIConnectionError, match="timed out"):
                post_hardware_auth("http://localhost:4000", "token")

    def test_unexpected_4xx(self) -> None:
        """404 or other 4xx (not 401/403) should return (False, status)."""
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.reason = "Not Found"
        mock_response.text = "Endpoint not found"

        with patch("src.api_client.requests.post", return_value=mock_response):
            success, status = post_hardware_auth(
                "http://localhost:4000", "token",
            )

        assert success is False
        assert status == 404

    def test_bearer_header_sent(self) -> None:
        """Request must include Authorization: Bearer <token> header."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.reason = "OK"

        with patch("src.api_client.requests.post", return_value=mock_response) as mock_post:
            post_hardware_auth("http://localhost:4000", "my-jwt-token")

        call_kwargs = mock_post.call_args
        headers = call_kwargs.kwargs.get("headers") or call_kwargs[1].get("headers")
        assert headers["Authorization"] == "Bearer my-jwt-token"

    def test_correct_url_constructed(self) -> None:
        """URL should be {api_url}/api/auth/hardware."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.reason = "OK"

        with patch("src.api_client.requests.post", return_value=mock_response) as mock_post:
            post_hardware_auth("http://localhost:4000", "token")

        call_args = mock_post.call_args
        url = call_args.args[0] if call_args.args else call_args[0][0]
        assert url == "http://localhost:4000/api/auth/hardware"

    def test_trailing_slash_stripped(self) -> None:
        """Trailing slash on api_url should not cause double-slash."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.reason = "OK"

        with patch("src.api_client.requests.post", return_value=mock_response) as mock_post:
            post_hardware_auth("http://localhost:4000/", "token")

        call_args = mock_post.call_args
        url = call_args.args[0] if call_args.args else call_args[0][0]
        assert url == "http://localhost:4000/api/auth/hardware"

    def test_timeout_parameter_passed(self) -> None:
        """Custom timeout should be passed to requests.post."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.reason = "OK"

        with patch("src.api_client.requests.post", return_value=mock_response) as mock_post:
            post_hardware_auth("http://localhost:4000", "token", timeout=10)

        call_kwargs = mock_post.call_args
        timeout = call_kwargs.kwargs.get("timeout") or call_kwargs[1].get("timeout")
        assert timeout == 10
