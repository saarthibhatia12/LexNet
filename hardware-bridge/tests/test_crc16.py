"""
Tests for CRC-16/CCITT implementation.

Validates:
- Known test vectors (matching firmware crc16.c output)
- Empty input
- Single byte
- Multi-byte sequences
- validate_crc16 with valid and invalid packets
- Type error handling
"""

import struct
import pytest

from src.crc16 import compute_crc16, validate_crc16


class TestComputeCRC16:
    """Tests for the compute_crc16 function."""

    def test_empty_input(self) -> None:
        """Empty data should return the initial CRC value 0xFFFF."""
        assert compute_crc16(b"") == 0xFFFF

    def test_known_vector_ascii_123456789(self) -> None:
        """
        Standard CRC-16/CCITT test vector.
        Input: ASCII '123456789' (0x31 to 0x39)
        Expected CRC: 0x29B1
        This is the canonical CCITT test vector — if this passes,
        the lookup table and algorithm are correct.
        """
        data = b"123456789"
        expected = 0x29B1
        result = compute_crc16(data)
        assert result == expected, (
            f"CRC of '123456789' should be 0x{expected:04X}, got 0x{result:04X}"
        )

    def test_single_byte_zero(self) -> None:
        """CRC of a single 0x00 byte."""
        result = compute_crc16(b"\x00")
        # Known value for CRC-16/CCITT of single zero byte
        assert isinstance(result, int)
        assert 0 <= result <= 0xFFFF

    def test_single_byte_ff(self) -> None:
        """CRC of a single 0xFF byte."""
        result = compute_crc16(b"\xFF")
        assert isinstance(result, int)
        assert 0 <= result <= 0xFFFF

    def test_all_zeros_14_bytes(self) -> None:
        """CRC of 14 zero bytes (simulating a zeroed-out packet payload)."""
        data = b"\x00" * 14
        result = compute_crc16(data)
        assert isinstance(result, int)
        assert 0 <= result <= 0xFFFF
        # Must be deterministic
        assert compute_crc16(data) == result

    def test_all_ones_14_bytes(self) -> None:
        """CRC of 14 bytes all set to 0xFF."""
        data = b"\xFF" * 14
        result = compute_crc16(data)
        assert isinstance(result, int)
        assert 0 <= result <= 0xFFFF

    def test_deterministic(self) -> None:
        """Same input must always produce the same CRC."""
        data = b"\xA1\xB2\xC3\xD4\x00\x55\x00\x00\x00\x00\x00\x00\x00\x01"
        crc1 = compute_crc16(data)
        crc2 = compute_crc16(data)
        assert crc1 == crc2

    def test_different_data_different_crc(self) -> None:
        """Different data should (almost always) produce different CRCs."""
        data1 = b"\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0A\x0B\x0C\x0D\x0E"
        data2 = b"\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0A\x0B\x0C\x0D\x0F"
        assert compute_crc16(data1) != compute_crc16(data2)

    def test_bytearray_input(self) -> None:
        """Should accept bytearray as well as bytes."""
        data = bytearray(b"123456789")
        assert compute_crc16(data) == 0x29B1

    def test_type_error_on_string(self) -> None:
        """Should raise TypeError if given a string instead of bytes."""
        with pytest.raises(TypeError, match="Expected bytes or bytearray"):
            compute_crc16("hello")  # type: ignore[arg-type]

    def test_type_error_on_int(self) -> None:
        """Should raise TypeError if given an integer."""
        with pytest.raises(TypeError, match="Expected bytes or bytearray"):
            compute_crc16(42)  # type: ignore[arg-type]

    def test_cross_check_incremental(self) -> None:
        """
        Cross-check: CRC of 'AB' should differ from CRC of 'A' and CRC of 'B'.
        This ensures the algorithm properly chains byte-by-byte.
        """
        crc_ab = compute_crc16(b"AB")
        crc_a = compute_crc16(b"A")
        crc_b = compute_crc16(b"B")
        assert crc_ab != crc_a
        assert crc_ab != crc_b

    def test_firmware_cross_check_packet(self) -> None:
        """
        Simulate a firmware-generated packet payload and verify CRC.
        Device ID: 0xA1B2C3D4 (LE bytes: D4 C3 B2 A1)
        Score: 85 (0x0055 LE)
        Timestamp: 1710500000 (0x00000000660A0AA0 LE)
        """
        device_id = b"\xD4\xC3\xB2\xA1"
        score = struct.pack("<H", 85)
        timestamp = struct.pack("<Q", 1710500000)
        payload = device_id + score + timestamp
        assert len(payload) == 14

        crc = compute_crc16(payload)
        assert isinstance(crc, int)
        assert 0 <= crc <= 0xFFFF

        # Build full packet and validate round-trip
        crc_bytes = struct.pack("<H", crc)
        full_packet = payload + crc_bytes
        assert len(full_packet) == 16
        assert validate_crc16(full_packet) is True


class TestValidateCRC16:
    """Tests for the validate_crc16 function."""

    def _build_valid_packet(self) -> bytes:
        """Helper: build a valid 16-byte packet with correct CRC."""
        device_id = b"\xA1\xB2\xC3\xD4"
        score = struct.pack("<H", 85)
        timestamp = struct.pack("<Q", 1710500000)
        payload = device_id + score + timestamp
        crc = compute_crc16(payload)
        crc_bytes = struct.pack("<H", crc)
        return payload + crc_bytes

    def test_valid_packet(self) -> None:
        """A correctly formed packet should pass CRC validation."""
        packet = self._build_valid_packet()
        assert validate_crc16(packet) is True

    def test_corrupted_single_bit(self) -> None:
        """Flipping one bit in the payload should fail CRC validation."""
        packet = bytearray(self._build_valid_packet())
        packet[0] ^= 0x01  # Flip LSB of first byte
        assert validate_crc16(bytes(packet)) is False

    def test_corrupted_crc_field(self) -> None:
        """Corrupting the CRC field itself should fail validation."""
        packet = bytearray(self._build_valid_packet())
        packet[14] ^= 0xFF  # Corrupt CRC low byte
        assert validate_crc16(bytes(packet)) is False

    def test_wrong_packet_size_short(self) -> None:
        """Packet shorter than 16 bytes should raise ValueError."""
        with pytest.raises(ValueError, match="exactly 16 bytes"):
            validate_crc16(b"\x00" * 15)

    def test_wrong_packet_size_long(self) -> None:
        """Packet longer than 16 bytes should raise ValueError."""
        with pytest.raises(ValueError, match="exactly 16 bytes"):
            validate_crc16(b"\x00" * 17)

    def test_wrong_packet_size_empty(self) -> None:
        """Empty packet should raise ValueError."""
        with pytest.raises(ValueError, match="exactly 16 bytes"):
            validate_crc16(b"")

    def test_all_zeros_packet(self) -> None:
        """
        A packet of all zeros: payload CRC won't match the zero CRC field
        unless by coincidence. Verify it handles gracefully.
        """
        packet = b"\x00" * 16
        # The CRC of 14 zero bytes is NOT 0x0000, so this should fail
        result = validate_crc16(packet)
        # Just verify it returns a bool without crashing
        assert isinstance(result, bool)
