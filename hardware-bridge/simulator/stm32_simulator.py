"""
STM32 Fingerprint Authentication Simulator.

Generates fake 16-byte UART packets that mimic the STM32 firmware output.
Supports two transport modes:
  - Serial: Sends over a virtual COM port (requires com0com or similar)
  - TCP:    Listens on localhost:9600 (recommended for Windows dev)

Usage:
    # TCP mode (recommended on Windows):
    python simulator/stm32_simulator.py --tcp --port 9600

    # Serial mode:
    python simulator/stm32_simulator.py --serial COM4

    # Generate packets with errors for testing:
    python simulator/stm32_simulator.py --tcp --bad-crc --low-score

    # Custom device ID and interval:
    python simulator/stm32_simulator.py --tcp --device-id A1B2C3D4 --interval 3.0

Packet format (16 bytes, little-endian):
    Offset  Size  Field         Encoding
    0       4     DEVICE_ID     4 raw bytes, little-endian
    4       2     FINGER_SCORE  uint16_t, little-endian
    6       8     TIMESTAMP     uint64_t, little-endian (Unix epoch)
    14      2     CRC16         CRC-16/CCITT of bytes [0..13]
"""

import argparse
import logging
import os
import random
import socket
import struct
import sys
import threading
import time
from typing import Optional

# Add parent directory to path so we can import from src
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.crc16 import compute_crc16  # noqa: E402


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [SIM] %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ---- Packet Construction ----

def build_auth_packet(
    device_id: bytes,
    score: int,
    timestamp: Optional[int] = None,
    corrupt_crc: bool = False,
) -> bytes:
    """
    Build a 16-byte authentication packet.

    Args:
        device_id: 4-byte device identifier.
        score: Fingerprint match score (uint16, 0-100 typical).
        timestamp: Unix epoch seconds. Defaults to current time.
        corrupt_crc: If True, intentionally corrupt the CRC field.

    Returns:
        A 16-byte packet with CRC (valid or corrupted).
    """
    if len(device_id) != 4:
        raise ValueError(f"device_id must be exactly 4 bytes, got {len(device_id)}")

    if timestamp is None:
        timestamp = int(time.time())

    payload = device_id + struct.pack("<H", score) + struct.pack("<Q", timestamp)
    crc = compute_crc16(payload)

    if corrupt_crc:
        crc ^= 0xFFFF  # Flip all bits to guarantee invalid CRC

    return payload + struct.pack("<H", crc)


def generate_packet(
    device_id: bytes,
    bad_crc: bool = False,
    low_score: bool = False,
) -> tuple[bytes, str]:
    """
    Generate a single packet, optionally with faults for testing.

    Args:
        device_id: 4-byte device identifier.
        bad_crc: Inject a CRC error.
        low_score: Generate a score below the minimum threshold (< 60).

    Returns:
        Tuple of (packet_bytes, description_string).
    """
    if low_score:
        score = random.randint(10, 59)
        desc = f"LOW_SCORE({score})"
    else:
        score = random.randint(70, 98)
        desc = f"score={score}"

    if bad_crc:
        desc += " BAD_CRC"

    packet = build_auth_packet(
        device_id=device_id,
        score=score,
        corrupt_crc=bad_crc,
    )

    return packet, desc


# ---- ACK Handling ----

ACK_SUCCESS = 0x01
ACK_FAILURE = 0xFF


def read_ack(conn: socket.socket, timeout: float = 2.0) -> Optional[int]:
    """
    Read a 1-byte ACK response.

    Args:
        conn: TCP socket or similar readable.
        timeout: Timeout in seconds.

    Returns:
        ACK byte value (0x01 success, 0xFF failure), or None on timeout.
    """
    conn.settimeout(timeout)
    try:
        data = conn.recv(1)
        if data:
            return data[0]
        return None
    except socket.timeout:
        return None
    except OSError:
        return None


def format_ack(ack: Optional[int]) -> str:
    """Format ACK byte for display."""
    if ack is None:
        return "TIMEOUT"
    if ack == ACK_SUCCESS:
        return "SUCCESS (0x01)"
    if ack == ACK_FAILURE:
        return "FAILURE (0xFF)"
    return f"UNKNOWN (0x{ack:02X})"


# ---- TCP Mode ----

def handle_tcp_client(
    conn: socket.socket,
    addr: tuple[str, int],
    device_id: bytes,
    interval: float,
    bad_crc: bool,
    low_score: bool,
    count: int,
    stop_event: threading.Event,
) -> None:
    """
    Handle a single TCP client connection.

    Sends packets at the configured interval and waits for ACKs.

    Args:
        conn: The accepted client socket.
        addr: Client address tuple.
        device_id: 4-byte device ID to embed in packets.
        interval: Seconds between packets.
        bad_crc: Inject CRC errors.
        low_score: Inject low scores.
        count: Number of packets to send (0 = infinite).
        stop_event: Threading event to signal shutdown.
    """
    logger.info("Client connected: %s:%d", addr[0], addr[1])
    sent = 0

    try:
        while not stop_event.is_set():
            if count > 0 and sent >= count:
                logger.info("Sent %d packets, stopping", sent)
                break

            # Decide packet type for this round
            inject_bad_crc = bad_crc and (sent % 5 == 3)  # Every 5th packet (4th)
            inject_low_score = low_score and (sent % 7 == 5)  # Every 7th packet (6th)

            packet, desc = generate_packet(
                device_id=device_id,
                bad_crc=inject_bad_crc,
                low_score=inject_low_score,
            )

            try:
                conn.sendall(packet)
                sent += 1
                logger.info(
                    "TX #%d → %s | %s",
                    sent, packet.hex().upper(), desc,
                )
            except (BrokenPipeError, ConnectionResetError, OSError) as exc:
                logger.warning("Client disconnected during send: %s", exc)
                break

            # Wait for ACK
            ack = read_ack(conn, timeout=2.0)
            logger.info("RX ACK ← %s", format_ack(ack))

            # Wait before next packet
            stop_event.wait(timeout=interval)

    except KeyboardInterrupt:
        logger.info("Interrupted")
    finally:
        conn.close()
        logger.info("Client disconnected: %s:%d", addr[0], addr[1])


def run_tcp_server(
    host: str,
    port: int,
    device_id: bytes,
    interval: float,
    bad_crc: bool,
    low_score: bool,
    count: int,
) -> None:
    """
    Run the simulator in TCP server mode.

    Listens for a single client connection and sends packets to it.

    Args:
        host: Bind address.
        port: TCP port to listen on.
        device_id: 4-byte device ID.
        interval: Seconds between packets.
        bad_crc: Enable periodic CRC error injection.
        low_score: Enable periodic low score injection.
        count: Number of packets per client (0 = infinite).
    """
    stop_event = threading.Event()

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.settimeout(1.0)  # Accept timeout for clean shutdown

    try:
        server.bind((host, port))
        server.listen(1)
        logger.info(
            "=== STM32 Simulator (TCP) listening on %s:%d ===",
            host, port,
        )
        logger.info(
            "Config: device=%s, interval=%.1fs, bad_crc=%s, low_score=%s, count=%s",
            device_id.hex().upper(),
            interval,
            bad_crc,
            low_score,
            count if count > 0 else "∞",
        )
        logger.info("Waiting for bridge connection...")

        while not stop_event.is_set():
            try:
                conn, addr = server.accept()
                handle_tcp_client(
                    conn, addr, device_id, interval,
                    bad_crc, low_score, count, stop_event,
                )
            except socket.timeout:
                continue
            except KeyboardInterrupt:
                logger.info("Shutting down...")
                stop_event.set()
                break

    finally:
        server.close()
        logger.info("Server stopped")


# ---- Serial Mode ----

def run_serial_sender(
    port: str,
    baud_rate: int,
    device_id: bytes,
    interval: float,
    bad_crc: bool,
    low_score: bool,
    count: int,
) -> None:
    """
    Run the simulator in serial port mode.

    Sends packets over a physical/virtual COM port.

    Args:
        port: Serial port name (e.g., 'COM4').
        baud_rate: UART baud rate (57600).
        device_id: 4-byte device ID.
        interval: Seconds between packets.
        bad_crc: Enable periodic CRC error injection.
        low_score: Enable periodic low score injection.
        count: Number of packets to send (0 = infinite).
    """
    try:
        import serial  # type: ignore[import-untyped]
    except ImportError:
        logger.error("pyserial not installed — run: pip install pyserial")
        sys.exit(1)

    try:
        ser = serial.Serial(
            port=port,
            baudrate=baud_rate,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=2.0,
        )
    except serial.SerialException as exc:
        logger.error("Cannot open serial port %s: %s", port, exc)
        sys.exit(1)

    logger.info(
        "=== STM32 Simulator (Serial) on %s @ %d baud ===",
        port, baud_rate,
    )
    logger.info(
        "Config: device=%s, interval=%.1fs, bad_crc=%s, low_score=%s, count=%s",
        device_id.hex().upper(),
        interval,
        bad_crc,
        low_score,
        count if count > 0 else "∞",
    )

    sent = 0
    try:
        while True:
            if count > 0 and sent >= count:
                logger.info("Sent %d packets, stopping", sent)
                break

            inject_bad_crc = bad_crc and (sent % 5 == 3)
            inject_low_score = low_score and (sent % 7 == 5)

            packet, desc = generate_packet(
                device_id=device_id,
                bad_crc=inject_bad_crc,
                low_score=inject_low_score,
            )

            ser.write(packet)
            sent += 1
            logger.info("TX #%d → %s | %s", sent, packet.hex().upper(), desc)

            # Read ACK (1 byte)
            ack_data = ser.read(1)
            if ack_data:
                logger.info("RX ACK ← %s", format_ack(ack_data[0]))
            else:
                logger.info("RX ACK ← TIMEOUT")

            time.sleep(interval)

    except KeyboardInterrupt:
        logger.info("Interrupted")
    finally:
        ser.close()
        logger.info("Serial port closed")


# ---- CLI ----

def parse_device_id(hex_str: str) -> bytes:
    """
    Parse a hex string device ID into 4 bytes.

    Args:
        hex_str: 8-character hex string (e.g., 'A1B2C3D4').

    Returns:
        4 raw bytes.

    Raises:
        argparse.ArgumentTypeError: If the hex string is invalid.
    """
    hex_str = hex_str.strip().replace("0x", "").replace("0X", "")
    if len(hex_str) != 8:
        raise argparse.ArgumentTypeError(
            f"Device ID must be exactly 8 hex characters, got '{hex_str}'"
        )
    try:
        return bytes.fromhex(hex_str)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"Invalid hex string: {exc}") from exc


def main() -> None:
    """Entry point for the STM32 simulator CLI."""
    parser = argparse.ArgumentParser(
        description="STM32 Fingerprint Authentication Simulator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # TCP mode (recommended for Windows):
  python simulator/stm32_simulator.py --tcp

  # TCP on custom port:
  python simulator/stm32_simulator.py --tcp --port 9601

  # Serial mode on COM4:
  python simulator/stm32_simulator.py --serial COM4

  # Inject bad CRC and low score packets:
  python simulator/stm32_simulator.py --tcp --bad-crc --low-score

  # Send exactly 10 packets:
  python simulator/stm32_simulator.py --tcp --count 10
        """,
    )

    # Transport mode (mutually exclusive)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--tcp",
        action="store_true",
        help="Run in TCP server mode (default port: 9600)",
    )
    mode.add_argument(
        "--serial",
        type=str,
        metavar="PORT",
        help="Run in serial mode on the specified COM port",
    )

    # TCP options
    parser.add_argument(
        "--host",
        type=str,
        default="localhost",
        help="TCP bind address (default: localhost)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=9600,
        help="TCP port (default: 9600)",
    )

    # Serial options
    parser.add_argument(
        "--baud-rate",
        type=int,
        default=57600,
        help="UART baud rate (default: 57600)",
    )

    # Packet options
    parser.add_argument(
        "--device-id",
        type=parse_device_id,
        default=b"\xA1\xB2\xC3\xD4",
        help="4-byte device ID as hex (default: A1B2C3D4)",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=2.0,
        help="Seconds between packets (default: 2.0)",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=0,
        help="Number of packets to send (0 = infinite, default: 0)",
    )

    # Fault injection
    parser.add_argument(
        "--bad-crc",
        action="store_true",
        help="Periodically inject packets with invalid CRC",
    )
    parser.add_argument(
        "--low-score",
        action="store_true",
        help="Periodically inject packets with score < 60",
    )

    # Logging
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable debug logging",
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    if args.tcp:
        run_tcp_server(
            host=args.host,
            port=args.port,
            device_id=args.device_id,
            interval=args.interval,
            bad_crc=args.bad_crc,
            low_score=args.low_score,
            count=args.count,
        )
    else:
        run_serial_sender(
            port=args.serial,
            baud_rate=args.baud_rate,
            device_id=args.device_id,
            interval=args.interval,
            bad_crc=args.bad_crc,
            low_score=args.low_score,
            count=args.count,
        )


if __name__ == "__main__":
    main()
