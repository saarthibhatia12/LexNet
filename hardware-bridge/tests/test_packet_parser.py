"""
Tests for UART packet parser and validator.

Validates:
- Correct parsing of valid packets
- Truncated / oversized packets
- Bad CRC rejection
- Stale timestamp rejection
- Low finger score rejection
- Future timestamp rejection
- Edge cases (boundary scores, exact tolerance)
"""

import struct
import time

import pytest

from src.crc16 import compute_crc16
from src.packet_parser import (
    PACKET_SIZE,
    ParsedPacket,
    PacketCRCError,
    PacketScoreError,
    PacketSizeError,
    PacketTimestampError,
    parse_packet,
    validate_packet,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def build_packet(
    device_id: bytes = b"\xA1\xB2\xC3\xD4",
    score: int = 85,
    timestamp: int | None = None,
) -> bytes:
    """
    Build a valid 16-byte UART packet with correct CRC.

    Args:
        device_id: 4-byte device identifier.
        score: Fingerprint match score (uint16).
        timestamp: Unix epoch seconds (uint64). Defaults to current time.

    Returns:
        A 16-byte packet with valid CRC.
    """
    if timestamp is None:
        timestamp = int(time.time())

    payload = device_id + struct.pack("<H", score) + struct.pack("<Q", timestamp)
    assert len(payload) == 14
    crc = compute_crc16(payload)
    return payload + struct.pack("<H", crc)


def corrupt_crc(packet: bytes) -> bytes:
    """Flip bits in the CRC field to make it invalid."""
    packet_arr = bytearray(packet)
    packet_arr[14] ^= 0xFF
    packet_arr[15] ^= 0xFF
    return bytes(packet_arr)


# ---------------------------------------------------------------------------
# ParsedPacket dataclass tests
# ---------------------------------------------------------------------------

class TestParsedPacket:
    """Tests for the ParsedPacket dataclass."""

    def test_device_id_hex(self) -> None:
        """device_id_hex should return uppercase hex string."""
        pkt = ParsedPacket(
            device_id=b"\xA1\xB2\xC3\xD4",
            finger_score=85,
            timestamp=1710500000,
            crc16=0x1234,
        )
        assert pkt.device_id_hex == "A1B2C3D4"

    def test_frozen_immutable(self) -> None:
        """ParsedPacket should be immutable (frozen=True)."""
        pkt = ParsedPacket(
            device_id=b"\xA1\xB2\xC3\xD4",
            finger_score=85,
            timestamp=1710500000,
            crc16=0x1234,
        )
        with pytest.raises(AttributeError):
            pkt.finger_score = 90  # type: ignore[misc]


# ---------------------------------------------------------------------------
# parse_packet tests
# ---------------------------------------------------------------------------

class TestParsePacket:
    """Tests for the parse_packet function."""

    def test_valid_packet(self) -> None:
        """A valid 16-byte packet should parse correctly."""
        now = int(time.time())
        raw = build_packet(
            device_id=b"\xA1\xB2\xC3\xD4",
            score=85,
            timestamp=now,
        )
        pkt = parse_packet(raw)

        assert pkt.device_id == b"\xA1\xB2\xC3\xD4"
        assert pkt.finger_score == 85
        assert pkt.timestamp == now
        assert isinstance(pkt.crc16, int)
        assert 0 <= pkt.crc16 <= 0xFFFF

    def test_device_id_preserved(self) -> None:
        """Device ID bytes should be preserved exactly as received."""
        raw = build_packet(device_id=b"\x00\x00\x00\x00")
        pkt = parse_packet(raw)
        assert pkt.device_id == b"\x00\x00\x00\x00"

    def test_max_score(self) -> None:
        """Score of 100 should parse correctly."""
        raw = build_packet(score=100)
        pkt = parse_packet(raw)
        assert pkt.finger_score == 100

    def test_zero_score(self) -> None:
        """Score of 0 should parse correctly (validation is separate)."""
        raw = build_packet(score=0)
        pkt = parse_packet(raw)
        assert pkt.finger_score == 0

    def test_max_uint16_score(self) -> None:
        """Score can technically be any uint16 value."""
        raw = build_packet(score=65535)
        pkt = parse_packet(raw)
        assert pkt.finger_score == 65535

    def test_truncated_15_bytes(self) -> None:
        """15-byte input should raise PacketSizeError."""
        with pytest.raises(PacketSizeError, match="Expected 16 bytes"):
            parse_packet(b"\x00" * 15)

    def test_truncated_1_byte(self) -> None:
        """1-byte input should raise PacketSizeError."""
        with pytest.raises(PacketSizeError, match="Expected 16 bytes"):
            parse_packet(b"\x00")

    def test_oversized_17_bytes(self) -> None:
        """17-byte input should raise PacketSizeError."""
        with pytest.raises(PacketSizeError, match="Expected 16 bytes"):
            parse_packet(b"\x00" * 17)

    def test_empty_input(self) -> None:
        """Empty input should raise PacketSizeError."""
        with pytest.raises(PacketSizeError, match="Expected 16 bytes"):
            parse_packet(b"")

    def test_type_error_string(self) -> None:
        """String input should raise TypeError."""
        with pytest.raises(TypeError, match="Expected bytes or bytearray"):
            parse_packet("not bytes")  # type: ignore[arg-type]

    def test_bytearray_input(self) -> None:
        """bytearray input should work identically to bytes."""
        raw = build_packet()
        pkt = parse_packet(bytearray(raw))
        assert pkt.device_id == b"\xA1\xB2\xC3\xD4"


# ---------------------------------------------------------------------------
# validate_packet tests
# ---------------------------------------------------------------------------

class TestValidatePacket:
    """Tests for the validate_packet function."""

    def test_valid_packet_passes(self) -> None:
        """A fully valid packet should pass all validation checks."""
        now = time.time()
        raw = build_packet(score=85, timestamp=int(now))
        pkt = parse_packet(raw)
        result = validate_packet(pkt, raw, current_time=now)
        assert result is pkt  # Returns the same packet

    def test_bad_crc_rejected(self) -> None:
        """Corrupted CRC should raise PacketCRCError."""
        raw = build_packet(score=85)
        corrupted = corrupt_crc(raw)
        pkt = parse_packet(corrupted)

        with pytest.raises(PacketCRCError, match="CRC mismatch"):
            validate_packet(pkt, corrupted, current_time=time.time())

    def test_low_score_rejected(self) -> None:
        """Score below minimum should raise PacketScoreError."""
        now = time.time()
        raw = build_packet(score=59, timestamp=int(now))
        pkt = parse_packet(raw)

        with pytest.raises(PacketScoreError, match="below minimum"):
            validate_packet(pkt, raw, min_score=60, current_time=now)

    def test_score_exactly_at_minimum(self) -> None:
        """Score exactly at minimum should pass."""
        now = time.time()
        raw = build_packet(score=60, timestamp=int(now))
        pkt = parse_packet(raw)
        result = validate_packet(pkt, raw, min_score=60, current_time=now)
        assert result is pkt

    def test_score_one_below_minimum(self) -> None:
        """Score one below minimum should fail."""
        now = time.time()
        raw = build_packet(score=59, timestamp=int(now))
        pkt = parse_packet(raw)

        with pytest.raises(PacketScoreError):
            validate_packet(pkt, raw, min_score=60, current_time=now)

    def test_stale_timestamp_rejected(self) -> None:
        """Timestamp older than tolerance should raise PacketTimestampError."""
        stale_time = int(time.time()) - 60  # 60 seconds ago
        raw = build_packet(score=85, timestamp=stale_time)
        pkt = parse_packet(raw)

        with pytest.raises(PacketTimestampError, match="exceeds tolerance"):
            validate_packet(
                pkt, raw,
                timestamp_tolerance_sec=30,
                current_time=time.time(),
            )

    def test_future_timestamp_rejected(self) -> None:
        """Timestamp far in the future should raise PacketTimestampError."""
        future_time = int(time.time()) + 60  # 60 seconds in the future
        raw = build_packet(score=85, timestamp=future_time)
        pkt = parse_packet(raw)

        with pytest.raises(PacketTimestampError, match="exceeds tolerance"):
            validate_packet(
                pkt, raw,
                timestamp_tolerance_sec=30,
                current_time=time.time(),
            )

    def test_timestamp_at_tolerance_boundary(self) -> None:
        """Timestamp exactly at tolerance should pass (age == tolerance)."""
        now = 1710500030.0
        raw = build_packet(score=85, timestamp=1710500000)
        pkt = parse_packet(raw)

        # age = abs(1710500030 - 1710500000) = 30, tolerance = 30
        result = validate_packet(
            pkt, raw,
            timestamp_tolerance_sec=30,
            current_time=now,
        )
        assert result is pkt

    def test_timestamp_just_over_tolerance(self) -> None:
        """Timestamp 1 second over tolerance should fail."""
        now = 1710500031.0
        raw = build_packet(score=85, timestamp=1710500000)
        pkt = parse_packet(raw)

        # age = 31, tolerance = 30
        with pytest.raises(PacketTimestampError):
            validate_packet(
                pkt, raw,
                timestamp_tolerance_sec=30,
                current_time=now,
            )

    def test_custom_min_score(self) -> None:
        """Custom min_score should override default."""
        now = time.time()
        raw = build_packet(score=50, timestamp=int(now))
        pkt = parse_packet(raw)

        # With default min_score=60, score 50 would fail
        # But with min_score=40, it should pass
        result = validate_packet(pkt, raw, min_score=40, current_time=now)
        assert result is pkt

    def test_custom_timestamp_tolerance(self) -> None:
        """Custom tolerance should override default."""
        old_time = int(time.time()) - 50  # 50 seconds ago
        raw = build_packet(score=85, timestamp=old_time)
        pkt = parse_packet(raw)

        # With default tolerance=30, this would fail
        # But with tolerance=60, it should pass
        result = validate_packet(
            pkt, raw,
            timestamp_tolerance_sec=60,
            current_time=time.time(),
        )
        assert result is pkt

    def test_validation_order_crc_first(self) -> None:
        """
        CRC check should happen BEFORE score/timestamp checks.
        Even if score and timestamp are valid, bad CRC should fail with CRCError.
        """
        now = time.time()
        raw = build_packet(score=85, timestamp=int(now))
        corrupted = corrupt_crc(raw)
        pkt = parse_packet(corrupted)

        # CRC is bad, but score and timestamp are fine
        with pytest.raises(PacketCRCError):
            validate_packet(pkt, corrupted, current_time=now)

    def test_zero_device_id(self) -> None:
        """Packet with all-zero device ID should still parse and validate."""
        now = time.time()
        raw = build_packet(
            device_id=b"\x00\x00\x00\x00",
            score=85,
            timestamp=int(now),
        )
        pkt = parse_packet(raw)
        result = validate_packet(pkt, raw, current_time=now)
        assert result.device_id == b"\x00\x00\x00\x00"

    def test_max_device_id(self) -> None:
        """Packet with all-0xFF device ID should still parse and validate."""
        now = time.time()
        raw = build_packet(
            device_id=b"\xFF\xFF\xFF\xFF",
            score=85,
            timestamp=int(now),
        )
        pkt = parse_packet(raw)
        result = validate_packet(pkt, raw, current_time=now)
        assert result.device_id == b"\xFF\xFF\xFF\xFF"
