"""
API client for posting hardware authentication to the backend.

Sends the hardware bridge JWT to the backend's /api/auth/hardware
endpoint. The backend verifies the JWT (checks iss, finger_score,
expiry) and returns a session JWT if valid.

Endpoint: POST {API_URL}/api/auth/hardware
Headers:  Authorization: Bearer <hardware_jwt>
Timeout:  5 seconds
"""

import logging
from typing import Optional

import requests


logger = logging.getLogger(__name__)

# Request timeout in seconds
REQUEST_TIMEOUT: int = 5

# Auth endpoint path (appended to API_URL)
AUTH_ENDPOINT: str = "/api/auth/hardware"


class APIError(Exception):
    """Raised when the API returns an unexpected response."""

    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class APIConnectionError(APIError):
    """Raised when the API is unreachable."""
    pass


class APIAuthError(APIError):
    """Raised on 401/403 authentication failures."""
    pass


class APIServerError(APIError):
    """Raised on 5xx server errors."""
    pass


def post_hardware_auth(
    api_url: str,
    token: str,
    timeout: int = REQUEST_TIMEOUT,
) -> tuple[bool, int]:
    """
    POST the hardware JWT to the backend auth endpoint.

    Args:
        api_url: Backend base URL (e.g., "http://localhost:4000").
        token: Encoded hardware bridge JWT string.
        timeout: Request timeout in seconds (default: 5).

    Returns:
        Tuple of (success: bool, status_code: int).
        - (True, 200) on successful authentication
        - (False, status_code) on any failure

    Raises:
        APIConnectionError: If the backend is unreachable (connection refused,
                            DNS failure, timeout).
        APIAuthError: On 401 or 403 responses.
        APIServerError: On 5xx responses.
    """
    url = f"{api_url.rstrip('/')}{AUTH_ENDPOINT}"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    try:
        logger.debug("POST %s (timeout=%ds)", url, timeout)

        response = requests.post(
            url,
            headers=headers,
            timeout=timeout,
        )

        status = response.status_code
        logger.info(
            "API response: %d %s",
            status,
            response.reason,
        )

        # Success — backend accepted the hardware JWT
        if 200 <= status < 300:
            logger.debug("Authentication successful")
            return (True, status)

        # Authentication failure — bad JWT, expired, wrong issuer, low score
        if status in (401, 403):
            body = _safe_response_body(response)
            logger.warning(
                "Authentication rejected: %d — %s",
                status, body,
            )
            raise APIAuthError(
                f"Authentication failed: {status} — {body}",
                status_code=status,
            )

        # Server error — backend is broken
        if status >= 500:
            body = _safe_response_body(response)
            logger.error(
                "Server error: %d — %s",
                status, body,
            )
            raise APIServerError(
                f"Server error: {status} — {body}",
                status_code=status,
            )

        # Any other status (4xx not 401/403)
        body = _safe_response_body(response)
        logger.warning("Unexpected response: %d — %s", status, body)
        return (False, status)

    except requests.ConnectionError as exc:
        logger.error("Connection failed: %s", exc)
        raise APIConnectionError(
            f"Cannot reach backend at {url}: {exc}"
        ) from exc

    except requests.Timeout as exc:
        logger.error("Request timed out after %ds: %s", timeout, exc)
        raise APIConnectionError(
            f"Request to {url} timed out after {timeout}s"
        ) from exc

    except requests.RequestException as exc:
        logger.error("Request failed: %s", exc)
        raise APIError(
            f"Unexpected request error: {exc}"
        ) from exc


def _safe_response_body(response: requests.Response, max_len: int = 200) -> str:
    """
    Safely extract response body text for logging.

    Args:
        response: The requests Response object.
        max_len: Maximum characters to return.

    Returns:
        Truncated response body text.
    """
    try:
        body = response.text[:max_len]
        if len(response.text) > max_len:
            body += "..."
        return body
    except Exception:
        return "<unreadable>"
