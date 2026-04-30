"""
UART packet parser for the STM32 → Python bridge.

Packet format (16 bytes, little-endian):
    Offset  Size  Field         Encoding
    0       4     DEVICE_ID     4 raw bytes, little-endian
    4       2     FINGER_SCORE  uint16_t, little-endian
    6       8     TIMESTAMP     uint64_t, little-endian (Unix epoch seconds)
    14      2     CRC16         CRC-16/CCITT of bytes [0..13]

Python decode: struct.unpack('<4sHQH', raw_bytes)
"""

import struct
import time
from dataclasses import dataclass

from .crc16 import compute_crc16, validate_crc16


# Expected packet size in bytes
PACKET_SIZE: int = 16

# struct format: 4-byte device_id, uint16 score, uint64 timestamp, uint16 crc
PACKET_FORMAT: str = "<4sHQH"


@dataclass(frozen=True)
class ParsedPacket:
    """Parsed representation of a 16-byte UART authentication packet."""

    device_id: bytes
    """4-byte raw device identifier."""

    finger_score: int
    """Fingerprint match score (0–100)."""

    timestamp: int
    """Unix epoch timestamp in seconds."""

    crc16: int
    """CRC-16/CCITT checksum from the packet."""

    @property
    def device_id_hex(self) -> str:
        """Return device ID as uppercase hex string (e.g., 'A1B2C3D4')."""
        return self.device_id.hex().upper()


class PacketError(Exception):
    """Base exception for packet parsing and validation errors."""
    pass


class PacketSizeError(PacketError):
    """Raised when raw data is not exactly 16 bytes."""
    pass


class PacketCRCError(PacketError):
    """Raised when CRC validation fails."""
    pass


class PacketScoreError(PacketError):
    """Raised when finger score is below minimum threshold."""
    pass


class PacketTimestampError(PacketError):
    """Raised when timestamp is stale or in the future."""
    pass


def parse_packet(raw: bytes) -> ParsedPacket:
    """
    Parse raw 16-byte UART data into a ParsedPacket.

    This only unpacks the binary data — it does NOT validate CRC,
    score, or timestamp. Use validate_packet() for full validation.

    Args:
        raw: Exactly 16 bytes of raw UART data.

    Returns:
        A ParsedPacket with all fields populated.

    Raises:
        PacketSizeError: If raw is not exactly 16 bytes.
    """
    if not isinstance(raw, (bytes, bytearray)):
        raise TypeError(f"Expected bytes or bytearray, got {type(raw).__name__}")

    if len(raw) != PACKET_SIZE:
        raise PacketSizeError(
            f"Expected {PACKET_SIZE} bytes, got {len(raw)}"
        )

    device_id, finger_score, timestamp, crc16 = struct.unpack(PACKET_FORMAT, raw)

    return ParsedPacket(
        device_id=device_id,
        finger_score=finger_score,
        timestamp=timestamp,
        crc16=crc16,
    )


def validate_packet(
    packet: ParsedPacket,
    raw: bytes,
    min_score: int = 60,
    timestamp_tolerance_sec: int = 30,
    current_time: float | None = None,
) -> ParsedPacket:
    """
    Validate a parsed packet against all security checks.

    Checks performed (in order):
        1. CRC-16 integrity — packet CRC matches computed CRC of payload
        2. Finger score — must be >= min_score
        3. Timestamp freshness — must be within tolerance of current time

    Args:
        packet: The parsed packet to validate.
        raw: The original 16-byte raw data (needed for CRC check).
        min_score: Minimum acceptable finger score (default: 60).
        timestamp_tolerance_sec: Maximum age of timestamp in seconds (default: 30).
        current_time: Override current time for testing (Unix epoch float).

    Returns:
        The same ParsedPacket if all checks pass.

    Raises:
        PacketCRCError: If CRC doesn't match.
        PacketScoreError: If score < min_score.
        PacketTimestampError: If timestamp is stale or in the future.
    """
    # 1. CRC integrity check
    if not validate_crc16(raw):
        computed_crc = compute_crc16(raw[:14])
        raise PacketCRCError(
            f"CRC mismatch: received 0x{packet.crc16:04X}, "
            f"computed 0x{computed_crc:04X}"
        )

    # 2. Finger score check
    if packet.finger_score < min_score:
        raise PacketScoreError(
            f"Finger score {packet.finger_score} is below minimum {min_score}"
        )

    # 3. Timestamp freshness check
    now = current_time if current_time is not None else time.time()
    age = abs(now - packet.timestamp)

    if age > timestamp_tolerance_sec:
        raise PacketTimestampError(
            f"Timestamp is {age:.1f}s old, exceeds tolerance of "
            f"{timestamp_tolerance_sec}s"
        )

    return packet
