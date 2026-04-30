"""
UART packet reader for the STM32 hardware bridge.

Reads exactly 16-byte authentication packets from either:
  - A physical serial port (pyserial)
  - A TCP socket (for Windows dev without COM port pairs)

The reader flushes the serial input buffer before each read
to discard any stale/partial data.
"""

import logging
import socket
import struct
from typing import Optional, Protocol

import serial  # type: ignore[import-untyped]

from .packet_parser import PACKET_SIZE


logger = logging.getLogger(__name__)


class ReadablePort(Protocol):
    """Protocol for anything that can read bytes — serial or TCP socket."""

    def read(self, size: int) -> bytes: ...
    def reset_input_buffer(self) -> None: ...


class TCPSerialAdapter:
    """
    Wraps a TCP socket to provide the same read/flush interface as pyserial.

    Used when running in --tcp mode on Windows (avoids needing com0com).
    Connects to the STM32 simulator listening on a TCP port.
    """

    def __init__(self, host: str, port: int, timeout: float = 2.0) -> None:
        """
        Open a TCP connection to the simulator.

        Args:
            host: Hostname or IP address.
            port: TCP port number.
            timeout: Socket read timeout in seconds.
        """
        self._host = host
        self._port = port
        self._timeout = timeout
        self._sock: Optional[socket.socket] = None
        self._buffer = b""

    def connect(self) -> None:
        """Establish TCP connection to the simulator."""
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._sock.settimeout(self._timeout)
        self._sock.connect((self._host, self._port))
        logger.info("TCP connection established to %s:%d", self._host, self._port)

    def read(self, size: int) -> bytes:
        """
        Read exactly `size` bytes from the TCP socket.

        Buffers partial reads and returns when enough data is available,
        or returns whatever is available on timeout.

        Args:
            size: Number of bytes to read.

        Returns:
            The bytes read (may be fewer than `size` on timeout).
        """
        if self._sock is None:
            raise ConnectionError("TCP socket is not connected")

        while len(self._buffer) < size:
            try:
                chunk = self._sock.recv(4096)
                if not chunk:
                    logger.warning("TCP connection closed by remote")
                    break
                self._buffer += chunk
            except socket.timeout:
                logger.debug(
                    "TCP read timeout — have %d/%d bytes",
                    len(self._buffer), size,
                )
                break
            except OSError as exc:
                logger.error("TCP read error: %s", exc)
                break

        result = self._buffer[:size]
        self._buffer = self._buffer[size:]
        return result

    def reset_input_buffer(self) -> None:
        """
        Discard any internally buffered data.

        Unlike a physical serial port, a TCP socket does not have a
        hardware FIFO with stale data. We only clear the internal
        Python-level buffer — draining the socket would consume
        actual incoming packet data.
        """
        discarded = len(self._buffer)
        self._buffer = b""
        if discarded > 0:
            logger.debug("Discarded %d buffered bytes", discarded)

    def close(self) -> None:
        """Close the TCP connection."""
        if self._sock is not None:
            try:
                self._sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            self._sock.close()
            self._sock = None
            logger.info("TCP connection closed")

    @property
    def is_connected(self) -> bool:
        """Check if the TCP socket is connected."""
        return self._sock is not None


def open_serial_port(
    port: str,
    baud_rate: int = 57600,
    timeout: float = 2.0,
) -> serial.Serial:
    """
    Open a physical serial port for UART communication.

    Args:
        port: Serial port name (e.g., 'COM3', '/dev/ttyACM0').
        baud_rate: Baud rate (must be 57600 per protocol spec).
        timeout: Read timeout in seconds.

    Returns:
        An open pyserial Serial instance.

    Raises:
        serial.SerialException: If the port cannot be opened.
    """
    ser = serial.Serial(
        port=port,
        baudrate=baud_rate,
        bytesize=serial.EIGHTBITS,
        parity=serial.PARITY_NONE,
        stopbits=serial.STOPBITS_ONE,
        timeout=timeout,
    )
    logger.info(
        "Serial port opened: %s @ %d baud (8N1, timeout=%.1fs)",
        port, baud_rate, timeout,
    )
    return ser


def open_tcp_port(
    host: str = "localhost",
    port: int = 9600,
    timeout: float = 2.0,
) -> TCPSerialAdapter:
    """
    Open a TCP connection to the STM32 simulator.

    Used as a fallback on Windows when virtual COM ports are unavailable.

    Args:
        host: Simulator hostname.
        port: Simulator TCP port (default: 9600 per port assignments).
        timeout: Socket read timeout in seconds.

    Returns:
        A connected TCPSerialAdapter instance.

    Raises:
        ConnectionRefusedError: If the simulator is not running.
        OSError: On network errors.
    """
    adapter = TCPSerialAdapter(host, port, timeout)
    adapter.connect()
    return adapter


def read_packet(
    port: "serial.Serial | TCPSerialAdapter",
    timeout: float = 2.0,
) -> Optional[bytes]:
    """
    Read exactly one 16-byte UART packet from the port.

    Steps:
        1. Flush the input buffer to discard stale/partial data.
        2. Read exactly PACKET_SIZE (16) bytes.
        3. Return the raw bytes, or None on timeout/short read.

    Args:
        port: An open serial port or TCP adapter.
        timeout: Read timeout in seconds (applied to serial port if applicable).

    Returns:
        Exactly 16 bytes of raw packet data, or None if the read
        timed out or returned insufficient data.
    """
    # Update timeout if it's a real serial port
    if isinstance(port, serial.Serial) and port.timeout != timeout:
        port.timeout = timeout

    # Step 1: Flush stale data from the input buffer
    try:
        port.reset_input_buffer()
    except (OSError, AttributeError) as exc:
        logger.warning("Failed to flush input buffer: %s", exc)

    # Step 2: Read exactly 16 bytes
    try:
        raw = port.read(PACKET_SIZE)
    except (serial.SerialException, OSError) as exc:
        logger.error("Read error: %s", exc)
        return None

    # Step 3: Validate we got the full packet
    if len(raw) < PACKET_SIZE:
        if len(raw) == 0:
            logger.debug("Read timeout — no data received")
        else:
            logger.warning(
                "Short read: got %d/%d bytes (discarding: %s)",
                len(raw), PACKET_SIZE, raw.hex(),
            )
        return None

    logger.debug("Received packet: %s", raw.hex())
    return raw
