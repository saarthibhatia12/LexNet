"""
Main bridge loop — the central orchestrator of the hardware bridge.

Flow per packet:
    1. Read 16-byte UART packet from serial/TCP port
    2. Parse into ParsedPacket
    3. Validate CRC, score, timestamp
    4. Generate HS256 JWT with device_id + finger_score
    5. POST JWT to backend /api/auth/hardware
    6. Send ACK byte back to firmware (0x01 = success, 0xFF = failure)

Usage:
    # TCP mode (recommended on Windows):
    python -m src.bridge --tcp

    # Serial mode:
    python -m src.bridge --serial COM3

    # Custom settings:
    python -m src.bridge --tcp --tcp-host localhost --tcp-port 9600
"""

import argparse
import logging
import sys
import time
from typing import Optional

import serial  # type: ignore[import-untyped]

from .api_client import (
    APIAuthError,
    APIConnectionError,
    APIError,
    APIServerError,
    post_hardware_auth,
)
from .jwt_generator import generate_hardware_jwt
from .packet_parser import (
    PacketCRCError,
    PacketError,
    PacketScoreError,
    PacketTimestampError,
    parse_packet,
    validate_packet,
)
from .uart_reader import TCPSerialAdapter, open_serial_port, open_tcp_port, read_packet


logger = logging.getLogger(__name__)

# ACK byte values sent back to firmware
ACK_SUCCESS: int = 0x01
ACK_FAILURE: int = 0xFF


class BridgeConfig:
    """Runtime configuration for the bridge, independent of env-file loading."""

    def __init__(
        self,
        jwt_secret: str,
        api_url: str,
        min_finger_score: int = 60,
        timestamp_tolerance_sec: int = 30,
        log_level: str = "INFO",
    ) -> None:
        self.jwt_secret = jwt_secret
        self.api_url = api_url
        self.min_finger_score = min_finger_score
        self.timestamp_tolerance_sec = timestamp_tolerance_sec
        self.log_level = log_level


def _send_ack(
    port: "serial.Serial | TCPSerialAdapter",
    ack_byte: int,
) -> bool:
    """
    Send a 1-byte ACK/NACK to the firmware.

    Args:
        port: Open serial port or TCP adapter.
        ack_byte: ACK_SUCCESS (0x01) or ACK_FAILURE (0xFF).

    Returns:
        True if the ACK was sent successfully, False on error.
    """
    try:
        data = bytes([ack_byte])
        # Duck-typed dispatch: try _sock (TCPSerialAdapter / mock), else write()
        sock = getattr(port, "_sock", None)
        if sock is not None:
            sock.sendall(data)
        elif hasattr(port, "write"):
            port.write(data)
            if hasattr(port, "flush"):
                port.flush()
        else:
            logger.error("Cannot send ACK — port has no write or _sock interface")
            return False

        ack_name = "SUCCESS" if ack_byte == ACK_SUCCESS else "FAILURE"
        logger.debug("Sent ACK: 0x%02X (%s)", ack_byte, ack_name)
        return True

    except (serial.SerialException, OSError) as exc:
        logger.error("Failed to send ACK: %s", exc)
        return False


def process_one_packet(
    port: "serial.Serial | TCPSerialAdapter",
    config: BridgeConfig,
    read_timeout: float = 2.0,
) -> Optional[bool]:
    """
    Process a single UART packet through the full bridge pipeline.

    Steps:
        1. Read raw packet
        2. Parse binary data
        3. Validate CRC + score + timestamp
        4. Generate JWT
        5. POST to backend
        6. Send ACK byte

    Args:
        port: Open serial port or TCP adapter.
        config: Bridge runtime configuration.
        read_timeout: Timeout for reading a packet.

    Returns:
        True if the packet was fully processed and authenticated.
        False if the packet was received but failed validation or API call.
        None if no packet was received (timeout).
    """
    # --- Step 1: Read raw packet ---
    raw = read_packet(port, timeout=read_timeout)
    if raw is None:
        return None  # Timeout — no packet available

    logger.info("Received packet: %s (%d bytes)", raw.hex().upper(), len(raw))

    # --- Step 2: Parse binary data ---
    try:
        packet = parse_packet(raw)
    except PacketError as exc:
        logger.error("Parse error: %s", exc)
        _send_ack(port, ACK_FAILURE)
        return False

    logger.info(
        "Parsed: device=%s score=%d timestamp=%d",
        packet.device_id_hex, packet.finger_score, packet.timestamp,
    )

    # --- Step 3: Validate CRC + score + timestamp ---
    try:
        validate_packet(
            packet,
            raw,
            min_score=config.min_finger_score,
            timestamp_tolerance_sec=config.timestamp_tolerance_sec,
        )
    except PacketCRCError as exc:
        logger.error("CRC FAILED: %s", exc)
        _send_ack(port, ACK_FAILURE)
        return False
    except PacketScoreError as exc:
        logger.warning("SCORE REJECTED: %s", exc)
        _send_ack(port, ACK_FAILURE)
        return False
    except PacketTimestampError as exc:
        logger.warning("TIMESTAMP STALE: %s", exc)
        _send_ack(port, ACK_FAILURE)
        return False

    logger.info("Packet validated — CRC OK, score OK, timestamp OK")

    # --- Step 4: Generate JWT ---
    try:
        token = generate_hardware_jwt(
            device_id=packet.device_id_hex,
            finger_score=packet.finger_score,
            secret=config.jwt_secret,
        )
    except (ValueError, Exception) as exc:
        logger.error("JWT generation failed: %s", exc)
        _send_ack(port, ACK_FAILURE)
        return False

    logger.debug("JWT generated: %s...%s", token[:20], token[-10:])

    # --- Step 5: POST to backend ---
    try:
        success, status_code = post_hardware_auth(
            api_url=config.api_url,
            token=token,
        )
    except APIConnectionError as exc:
        logger.error("Backend unreachable: %s", exc)
        _send_ack(port, ACK_FAILURE)
        return False
    except APIAuthError as exc:
        logger.warning("Backend rejected auth: %s", exc)
        _send_ack(port, ACK_FAILURE)
        return False
    except APIServerError as exc:
        logger.error("Backend server error: %s", exc)
        _send_ack(port, ACK_FAILURE)
        return False
    except APIError as exc:
        logger.error("API error: %s", exc)
        _send_ack(port, ACK_FAILURE)
        return False

    if not success:
        logger.warning("Backend returned non-success status: %d", status_code)
        _send_ack(port, ACK_FAILURE)
        return False

    # --- Step 6: Send ACK success ---
    logger.info(
        "✓ Authentication SUCCESS — device=%s score=%d",
        packet.device_id_hex, packet.finger_score,
    )
    _send_ack(port, ACK_SUCCESS)
    return True


def run_bridge_loop(
    port: "serial.Serial | TCPSerialAdapter",
    config: BridgeConfig,
    max_iterations: int = 0,
) -> dict[str, int]:
    """
    Run the main bridge loop — continuously process packets.

    Args:
        port: Open serial port or TCP adapter.
        config: Bridge runtime configuration.
        max_iterations: Maximum number of iterations (0 = infinite).

    Returns:
        Stats dictionary with counts of processed, succeeded, failed, timeouts.
    """
    stats = {
        "processed": 0,
        "succeeded": 0,
        "failed": 0,
        "timeouts": 0,
    }

    iteration = 0
    logger.info("=== Bridge loop started ===")

    try:
        while True:
            if max_iterations > 0 and iteration >= max_iterations:
                logger.info("Reached max iterations (%d), stopping", max_iterations)
                break

            iteration += 1
            result = process_one_packet(port, config)

            if result is None:
                stats["timeouts"] += 1
                # Don't log every timeout — they're normal when waiting
            elif result is True:
                stats["processed"] += 1
                stats["succeeded"] += 1
            else:
                stats["processed"] += 1
                stats["failed"] += 1

    except KeyboardInterrupt:
        logger.info("Bridge interrupted by user")

    logger.info(
        "=== Bridge loop ended — processed=%d succeeded=%d failed=%d timeouts=%d ===",
        stats["processed"], stats["succeeded"],
        stats["failed"], stats["timeouts"],
    )

    return stats


def main() -> None:
    """
    Entry point for the hardware bridge.

    Loads config from environment, opens the port, and runs the bridge loop.
    """
    parser = argparse.ArgumentParser(
        description="LexNet Hardware Bridge — STM32 ↔ Backend",
    )

    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--tcp",
        action="store_true",
        help="Connect via TCP to the STM32 simulator",
    )
    mode.add_argument(
        "--serial",
        type=str,
        metavar="PORT",
        help="Connect via serial port (e.g., COM3)",
    )

    parser.add_argument(
        "--tcp-host", type=str, default="localhost",
        help="TCP host (default: localhost)",
    )
    parser.add_argument(
        "--tcp-port", type=int, default=9600,
        help="TCP port (default: 9600)",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="Enable debug logging",
    )

    args = parser.parse_args()

    # Import config (loads .env at import time)
    # Deferred import to allow tests to run without .env
    from . import config as cfg

    # Setup logging
    log_level = "DEBUG" if args.verbose else cfg.BRIDGE_LOG_LEVEL
    logging.basicConfig(
        level=getattr(logging, log_level),
        format="%(asctime)s [BRIDGE] %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )

    bridge_config = BridgeConfig(
        jwt_secret=cfg.JWT_SECRET,
        api_url=cfg.API_URL,
        min_finger_score=cfg.MIN_FINGER_SCORE,
        timestamp_tolerance_sec=cfg.TIMESTAMP_TOLERANCE_SEC,
        log_level=log_level,
    )

    # Open port
    if args.tcp:
        logger.info("Connecting via TCP to %s:%d", args.tcp_host, args.tcp_port)
        port = open_tcp_port(args.tcp_host, args.tcp_port)
    else:
        logger.info("Opening serial port %s @ %d baud", args.serial, cfg.BAUD_RATE)
        port = open_serial_port(args.serial, cfg.BAUD_RATE)

    try:
        run_bridge_loop(port, bridge_config)
    finally:
        if isinstance(port, TCPSerialAdapter):
            port.close()
        elif isinstance(port, serial.Serial):
            port.close()
        logger.info("Port closed")


if __name__ == "__main__":
    main()
