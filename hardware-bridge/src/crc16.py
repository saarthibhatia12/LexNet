"""
CRC-16/CCITT implementation for UART packet integrity.

Polynomial: 0x1021
Initial value: 0xFFFF
This MUST produce identical output to the firmware's crc16.c implementation.
"""


# Pre-computed CRC-16/CCITT lookup table (polynomial 0x1021)
_CRC16_TABLE: list[int] = []

def _build_crc16_table() -> list[int]:
    """Build the 256-entry CRC-16/CCITT lookup table."""
    table: list[int] = []
    for i in range(256):
        crc = i << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
        table.append(crc)
    return table


_CRC16_TABLE = _build_crc16_table()


def compute_crc16(data: bytes) -> int:
    """
    Compute CRC-16/CCITT over the given data bytes.

    Args:
        data: Raw bytes to compute CRC over.

    Returns:
        The 16-bit CRC value (0x0000–0xFFFF).

    Raises:
        TypeError: If data is not bytes.
    """
    if not isinstance(data, (bytes, bytearray)):
        raise TypeError(f"Expected bytes or bytearray, got {type(data).__name__}")

    crc: int = 0xFFFF  # Initial value per CCITT spec

    for byte in data:
        lookup_index = ((crc >> 8) ^ byte) & 0xFF
        crc = ((_CRC16_TABLE[lookup_index] ^ (crc << 8)) & 0xFFFF)

    return crc


def validate_crc16(packet: bytes) -> bool:
    """
    Validate a 16-byte UART packet's CRC-16 field.

    The packet layout is:
        Offset 0-13: payload (device_id[4] + finger_score[2] + timestamp[8])
        Offset 14-15: CRC-16 of bytes [0..13], little-endian uint16

    Args:
        packet: The full 16-byte UART packet.

    Returns:
        True if the CRC field matches the computed CRC of the payload.

    Raises:
        ValueError: If packet is not exactly 16 bytes.
    """
    if len(packet) != 16:
        raise ValueError(f"Packet must be exactly 16 bytes, got {len(packet)}")

    payload = packet[:14]
    # CRC field is stored as little-endian uint16 at offset 14
    crc_received = int.from_bytes(packet[14:16], byteorder="little")
    crc_computed = compute_crc16(payload)

    return crc_received == crc_computed
