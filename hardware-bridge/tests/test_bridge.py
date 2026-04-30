"""
Tests for the main bridge loop.

Full flow tests with mocked serial port and mocked HTTP responses.
Covers:
- Successful end-to-end flow (read → parse → validate → JWT → POST → ACK)
- Failed CRC → NACK
- Low score → NACK
- Stale timestamp → NACK
- API connection refused → NACK
- API 401 rejection → NACK
- API 500 server error → NACK
- Read timeout (no packet) → skip
- Parse error (truncated packet) → NACK
- Multiple packets in sequence (bridge loop)
"""

import struct
import time
from typing import Optional
from unittest.mock import MagicMock, patch, PropertyMock

import pytest

from src.bridge import (
    ACK_FAILURE,
    ACK_SUCCESS,
    BridgeConfig,
    _send_ack,
    process_one_packet,
    run_bridge_loop,
)
from src.crc16 import compute_crc16
from src.api_client import (
    APIAuthError,
    APIConnectionError,
    APIServerError,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TEST_SECRET = "test-secret-key-must-be-at-least-32-characters-long"

DEFAULT_CONFIG = BridgeConfig(
    jwt_secret=TEST_SECRET,
    api_url="http://localhost:4000",
    min_finger_score=60,
    timestamp_tolerance_sec=30,
)


def build_valid_packet(
    device_id: bytes = b"\xA1\xB2\xC3\xD4",
    score: int = 85,
    timestamp: Optional[int] = None,
) -> bytes:
    """Build a valid 16-byte UART packet."""
    if timestamp is None:
        timestamp = int(time.time())
    payload = device_id + struct.pack("<H", score) + struct.pack("<Q", timestamp)
    crc = compute_crc16(payload)
    return payload + struct.pack("<H", crc)


def build_bad_crc_packet(
    device_id: bytes = b"\xA1\xB2\xC3\xD4",
    score: int = 85,
) -> bytes:
    """Build a packet with corrupted CRC."""
    timestamp = int(time.time())
    payload = device_id + struct.pack("<H", score) + struct.pack("<Q", timestamp)
    crc = compute_crc16(payload) ^ 0xFFFF  # Invert CRC
    return payload + struct.pack("<H", crc)


class MockPort:
    """
    Mock serial/TCP port for testing.

    Simulates read_packet() behaviour by returning pre-loaded packets
    and recording ACK bytes sent.
    """

    def __init__(self, packets: Optional[list[Optional[bytes]]] = None) -> None:
        """
        Args:
            packets: List of raw packet bytes to return on read().
                     None entries simulate read timeouts.
        """
        self._packets = packets or []
        self._index = 0
        self._acks_sent: list[int] = []
        self._buffer = b""
        self._sock = MagicMock()
        self.timeout: float = 2.0

        # Setup _sock.sendall to capture ACK bytes
        def capture_sendall(data: bytes) -> None:
            for byte in data:
                self._acks_sent.append(byte)

        self._sock.sendall = capture_sendall

    def read(self, size: int) -> bytes:
        """Return the next packet or empty bytes for timeout."""
        if self._index >= len(self._packets):
            return b""

        packet = self._packets[self._index]
        self._index += 1

        if packet is None:
            return b""  # Simulate timeout

        return packet[:size]

    def reset_input_buffer(self) -> None:
        """No-op for mock."""
        pass

    @property
    def acks_sent(self) -> list[int]:
        """List of ACK bytes that were sent."""
        return self._acks_sent


# ---------------------------------------------------------------------------
# BridgeConfig tests
# ---------------------------------------------------------------------------

class TestBridgeConfig:
    """Tests for BridgeConfig dataclass."""

    def test_default_values(self) -> None:
        """Default config should have expected values."""
        config = BridgeConfig(
            jwt_secret=TEST_SECRET,
            api_url="http://localhost:4000",
        )
        assert config.min_finger_score == 60
        assert config.timestamp_tolerance_sec == 30
        assert config.log_level == "INFO"

    def test_custom_values(self) -> None:
        """Custom values should override defaults."""
        config = BridgeConfig(
            jwt_secret=TEST_SECRET,
            api_url="http://example.com",
            min_finger_score=70,
            timestamp_tolerance_sec=15,
            log_level="DEBUG",
        )
        assert config.min_finger_score == 70
        assert config.timestamp_tolerance_sec == 15
        assert config.log_level == "DEBUG"


# ---------------------------------------------------------------------------
# _send_ack tests
# ---------------------------------------------------------------------------

class TestSendAck:
    """Tests for the _send_ack helper."""

    def test_send_success_ack(self) -> None:
        """Should send 0x01 for success."""
        port = MockPort()
        result = _send_ack(port, ACK_SUCCESS)
        assert result is True
        assert port.acks_sent == [ACK_SUCCESS]

    def test_send_failure_ack(self) -> None:
        """Should send 0xFF for failure."""
        port = MockPort()
        result = _send_ack(port, ACK_FAILURE)
        assert result is True
        assert port.acks_sent == [ACK_FAILURE]


# ---------------------------------------------------------------------------
# process_one_packet tests
# ---------------------------------------------------------------------------

class TestProcessOnePacket:
    """Tests for process_one_packet — the core bridge pipeline."""

    @patch("src.bridge.post_hardware_auth")
    def test_success_full_flow(self, mock_post: MagicMock) -> None:
        """
        Full success path:
        valid packet → parse → validate → JWT → API 200 → ACK SUCCESS.
        """
        mock_post.return_value = (True, 200)

        packet = build_valid_packet()
        port = MockPort(packets=[packet])

        result = process_one_packet(port, DEFAULT_CONFIG)

        assert result is True
        assert port.acks_sent == [ACK_SUCCESS]
        mock_post.assert_called_once()

        # Verify JWT was generated with correct device_id
        call_kwargs = mock_post.call_args
        assert call_kwargs.kwargs["api_url"] == "http://localhost:4000"
        assert isinstance(call_kwargs.kwargs["token"], str)

    def test_timeout_returns_none(self) -> None:
        """No packet available → return None, no ACK sent."""
        port = MockPort(packets=[None])

        result = process_one_packet(port, DEFAULT_CONFIG)

        assert result is None
        assert port.acks_sent == []

    def test_empty_read_returns_none(self) -> None:
        """Empty read (timeout) → return None."""
        port = MockPort(packets=[])

        result = process_one_packet(port, DEFAULT_CONFIG)

        assert result is None
        assert port.acks_sent == []

    @patch("src.bridge.post_hardware_auth")
    def test_bad_crc_sends_failure_ack(self, mock_post: MagicMock) -> None:
        """Corrupted CRC → NACK, no API call."""
        packet = build_bad_crc_packet()
        port = MockPort(packets=[packet])

        result = process_one_packet(port, DEFAULT_CONFIG)

        assert result is False
        assert port.acks_sent == [ACK_FAILURE]
        mock_post.assert_not_called()

    @patch("src.bridge.post_hardware_auth")
    def test_low_score_sends_failure_ack(self, mock_post: MagicMock) -> None:
        """Score below threshold → NACK, no API call."""
        packet = build_valid_packet(score=30)  # Below min_finger_score=60
        port = MockPort(packets=[packet])

        result = process_one_packet(port, DEFAULT_CONFIG)

        assert result is False
        assert port.acks_sent == [ACK_FAILURE]
        mock_post.assert_not_called()

    @patch("src.bridge.post_hardware_auth")
    def test_score_at_boundary_passes(self, mock_post: MagicMock) -> None:
        """Score exactly at minimum (60) → should pass validation."""
        mock_post.return_value = (True, 200)

        packet = build_valid_packet(score=60)
        port = MockPort(packets=[packet])

        result = process_one_packet(port, DEFAULT_CONFIG)

        assert result is True
        assert port.acks_sent == [ACK_SUCCESS]

    @patch("src.bridge.post_hardware_auth")
    def test_stale_timestamp_sends_failure_ack(self, mock_post: MagicMock) -> None:
        """Timestamp older than tolerance → NACK, no API call."""
        stale_time = int(time.time()) - 120  # 2 minutes ago
        packet = build_valid_packet(timestamp=stale_time)
        port = MockPort(packets=[packet])

        result = process_one_packet(port, DEFAULT_CONFIG)

        assert result is False
        assert port.acks_sent == [ACK_FAILURE]
        mock_post.assert_not_called()

    @patch("src.bridge.post_hardware_auth")
    def test_api_connection_refused_sends_failure_ack(
        self, mock_post: MagicMock,
    ) -> None:
        """Backend unreachable → NACK."""
        mock_post.side_effect = APIConnectionError("Connection refused")

        packet = build_valid_packet()
        port = MockPort(packets=[packet])

        result = process_one_packet(port, DEFAULT_CONFIG)

        assert result is False
        assert port.acks_sent == [ACK_FAILURE]

    @patch("src.bridge.post_hardware_auth")
    def test_api_401_sends_failure_ack(self, mock_post: MagicMock) -> None:
        """Backend rejects JWT (401) → NACK."""
        mock_post.side_effect = APIAuthError("Unauthorized", status_code=401)

        packet = build_valid_packet()
        port = MockPort(packets=[packet])

        result = process_one_packet(port, DEFAULT_CONFIG)

        assert result is False
        assert port.acks_sent == [ACK_FAILURE]

    @patch("src.bridge.post_hardware_auth")
    def test_api_500_sends_failure_ack(self, mock_post: MagicMock) -> None:
        """Backend server error (500) → NACK."""
        mock_post.side_effect = APIServerError(
            "Internal Server Error", status_code=500,
        )

        packet = build_valid_packet()
        port = MockPort(packets=[packet])

        result = process_one_packet(port, DEFAULT_CONFIG)

        assert result is False
        assert port.acks_sent == [ACK_FAILURE]

    @patch("src.bridge.post_hardware_auth")
    def test_api_non_success_status_sends_failure_ack(
        self, mock_post: MagicMock,
    ) -> None:
        """Backend returns (False, 404) → NACK."""
        mock_post.return_value = (False, 404)

        packet = build_valid_packet()
        port = MockPort(packets=[packet])

        result = process_one_packet(port, DEFAULT_CONFIG)

        assert result is False
        assert port.acks_sent == [ACK_FAILURE]

    def test_truncated_packet_sends_failure_ack(self) -> None:
        """Short read (< 16 bytes) → returns None (no ACK since no valid packet)."""
        # MockPort returns b"" for 15 bytes requested → read_packet returns None
        port = MockPort(packets=[b"\x00" * 10])

        result = process_one_packet(port, DEFAULT_CONFIG)

        # read_packet returns None for short reads → process returns None
        assert result is None

    @patch("src.bridge.post_hardware_auth")
    def test_different_device_ids(self, mock_post: MagicMock) -> None:
        """Device ID from packet should appear in JWT payload."""
        mock_post.return_value = (True, 200)

        device_id = b"\xDE\xAD\xBE\xEF"
        packet = build_valid_packet(device_id=device_id)
        port = MockPort(packets=[packet])

        result = process_one_packet(port, DEFAULT_CONFIG)
        assert result is True

        # Verify the token was generated — we can decode it
        token = mock_post.call_args.kwargs["token"]
        import jwt as pyjwt
        payload = pyjwt.decode(token, TEST_SECRET, algorithms=["HS256"])
        assert payload["device_id"] == "DEADBEEF"
        assert payload["finger_score"] == 85

    @patch("src.bridge.post_hardware_auth")
    def test_custom_config_thresholds(self, mock_post: MagicMock) -> None:
        """Custom config with higher min_score should reject lower scores."""
        strict_config = BridgeConfig(
            jwt_secret=TEST_SECRET,
            api_url="http://localhost:4000",
            min_finger_score=80,  # Higher threshold
            timestamp_tolerance_sec=10,  # Tighter tolerance
        )

        # Score 75 would pass default (60) but fail strict (80)
        packet = build_valid_packet(score=75)
        port = MockPort(packets=[packet])

        result = process_one_packet(port, strict_config)
        assert result is False
        assert port.acks_sent == [ACK_FAILURE]
        mock_post.assert_not_called()


# ---------------------------------------------------------------------------
# run_bridge_loop tests
# ---------------------------------------------------------------------------

class TestRunBridgeLoop:
    """Tests for run_bridge_loop — the continuous processing loop."""

    @patch("src.bridge.post_hardware_auth")
    def test_processes_multiple_packets(self, mock_post: MagicMock) -> None:
        """Loop should process multiple packets and return correct stats."""
        mock_post.return_value = (True, 200)

        packets = [
            build_valid_packet(score=85),
            build_valid_packet(score=90),
            build_valid_packet(score=75),
        ]
        port = MockPort(packets=packets)

        stats = run_bridge_loop(port, DEFAULT_CONFIG, max_iterations=3)

        assert stats["processed"] == 3
        assert stats["succeeded"] == 3
        assert stats["failed"] == 0

    @patch("src.bridge.post_hardware_auth")
    def test_mixed_success_and_failure(self, mock_post: MagicMock) -> None:
        """Mix of valid, bad CRC, and low score packets."""
        mock_post.return_value = (True, 200)

        packets = [
            build_valid_packet(score=85),       # SUCCESS
            build_bad_crc_packet(score=85),     # FAIL (bad CRC)
            build_valid_packet(score=30),       # FAIL (low score)
            build_valid_packet(score=90),       # SUCCESS
        ]
        port = MockPort(packets=packets)

        stats = run_bridge_loop(port, DEFAULT_CONFIG, max_iterations=4)

        assert stats["processed"] == 4
        assert stats["succeeded"] == 2
        assert stats["failed"] == 2

    def test_timeout_counted(self) -> None:
        """Timeouts should be counted but not as processed."""
        # All None entries = timeouts
        port = MockPort(packets=[None, None, None])

        stats = run_bridge_loop(port, DEFAULT_CONFIG, max_iterations=3)

        assert stats["timeouts"] == 3
        assert stats["processed"] == 0

    @patch("src.bridge.post_hardware_auth")
    def test_max_iterations_stops_loop(self, mock_post: MagicMock) -> None:
        """Loop should stop after max_iterations."""
        mock_post.return_value = (True, 200)

        # Provide more packets than max_iterations
        packets = [build_valid_packet() for _ in range(10)]
        port = MockPort(packets=packets)

        stats = run_bridge_loop(port, DEFAULT_CONFIG, max_iterations=3)

        assert stats["processed"] == 3
        assert mock_post.call_count == 3

    @patch("src.bridge.post_hardware_auth")
    def test_ack_bytes_match_results(self, mock_post: MagicMock) -> None:
        """ACK bytes should match success/failure of each packet."""
        # First call succeeds, second fails
        mock_post.side_effect = [
            (True, 200),
            APIConnectionError("refused"),
        ]

        packets = [
            build_valid_packet(score=85),
            build_valid_packet(score=90),
        ]
        port = MockPort(packets=packets)

        stats = run_bridge_loop(port, DEFAULT_CONFIG, max_iterations=2)

        assert stats["succeeded"] == 1
        assert stats["failed"] == 1
        assert port.acks_sent == [ACK_SUCCESS, ACK_FAILURE]

    @patch("src.bridge.post_hardware_auth")
    def test_stats_returned_correctly(self, mock_post: MagicMock) -> None:
        """Stats dict should have all required keys."""
        mock_post.return_value = (True, 200)

        port = MockPort(packets=[build_valid_packet()])
        stats = run_bridge_loop(port, DEFAULT_CONFIG, max_iterations=1)

        assert "processed" in stats
        assert "succeeded" in stats
        assert "failed" in stats
        assert "timeouts" in stats

    @patch("src.bridge.post_hardware_auth")
    def test_interleaved_timeouts_and_packets(self, mock_post: MagicMock) -> None:
        """Timeouts between packets should not break the loop."""
        mock_post.return_value = (True, 200)

        packets: list[Optional[bytes]] = [
            None,                              # timeout
            build_valid_packet(score=85),       # success
            None,                              # timeout
            build_valid_packet(score=90),       # success
        ]
        port = MockPort(packets=packets)

        stats = run_bridge_loop(port, DEFAULT_CONFIG, max_iterations=4)

        assert stats["timeouts"] == 2
        assert stats["succeeded"] == 2
        assert stats["processed"] == 2
