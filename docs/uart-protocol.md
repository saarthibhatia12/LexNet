# LexNet UART Protocol

LexNet firmware and the Python hardware bridge communicate through a fixed 16-byte binary packet over UART. This contract must remain stable because both sides depend on byte offsets and CRC behavior being identical.

## Link settings

- Baud rate: `57600`
- Mode: `8N1`
- Packet size: `16 bytes`
- ACK size: `1 byte`

## Packet layout

| Offset | Size | Field | Encoding |
| --- | ---: | --- | --- |
| `0` | `4` | `DEVICE_ID` | raw 4 bytes, little-endian |
| `4` | `2` | `FINGER_SCORE` | `uint16_t`, little-endian |
| `6` | `8` | `TIMESTAMP` | `uint64_t`, little-endian |
| `14` | `2` | `CRC16` | CRC-16/CCITT over bytes `0..13` |

Python decoder:

```python
import struct

device_id, finger_score, timestamp, crc16 = struct.unpack("<4sHQH", raw_packet)
```

## CRC settings

- Algorithm: `CRC-16/CCITT`
- Polynomial: `0x1021`
- Initial value: `0xFFFF`
- Coverage: bytes `0..13`

The firmware implementation in `firmware/Src/crc16.c` and the bridge implementation in `hardware-bridge/src/crc16.py` must always match.

## ACK values

The bridge returns a 1-byte acknowledgement after every packet:

| Value | Meaning |
| --- | --- |
| `0x01` | Authentication packet accepted |
| `0xFF` | Authentication packet rejected |

## Bridge-side validation rules

The hardware bridge must reject a packet if any of the following fail:

1. CRC-16 does not match the final 2 bytes.
2. `FINGER_SCORE < 60`.
3. `TIMESTAMP` is older than the configured tolerance, default `30` seconds.
4. The backend later rejects the generated hardware JWT.

## Example byte flow

Example field values:

- `DEVICE_ID = A1 B2 C3 D4`
- `FINGER_SCORE = 85`
- `TIMESTAMP = 1710500000`

Example processing sequence:

1. Firmware captures a fingerprint and computes the match score.
2. Firmware serializes the 16-byte packet and appends the CRC.
3. Bridge reads exactly 16 bytes.
4. Bridge validates CRC, score, and timestamp.
5. Bridge converts the packet into a hardware JWT.
6. Bridge calls `POST /api/auth/hardware`.
7. Bridge sends `0x01` or `0xFF` back to the firmware.

## Failure handling expectations

- Invalid CRC -> send `0xFF` immediately
- Low score -> send `0xFF`
- Stale timestamp -> send `0xFF`
- Backend auth failure -> send `0xFF`
- Success -> send `0x01`

## TCP simulator mode

Windows development often uses TCP mode instead of a virtual COM pair. The bridge supports:

```powershell
python -m src.bridge --tcp --tcp-host localhost --tcp-port 9600
```

The packet structure and ACK byte values remain exactly the same in TCP simulator mode.
