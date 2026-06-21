# LexNet Firmware — STM32F103C8Tx (Blue Pill)

> Biometric authentication firmware for the LexNet document networking system.

## Hardware

| Component | Model | Interface | STM32 Pins |
|-----------|-------|-----------|------------|
| MCU | STM32F103C8Tx (Blue Pill) | — | — |
| Fingerprint Sensor | R307 | USART2 (57600 8N1) | PA2 (TX), PA3 (RX) |
| LCD Display | 16×2 HD44780 + PCF8574 I2C | I2C1 (100kHz) | PB6 (SCL), PB7 (SDA) |
| Buzzer | Piezo active buzzer | GPIO Output | PB12 |
| Bridge Comms | USB-TTL ↔ Python Bridge | USART1 (57600 8N1) | PA9 (TX), PA10 (RX) |
| Debug | ST-Link V2 (SWD) | SWD | PA13, PA14 |

## Clock Configuration

- **HSE**: 8MHz crystal → PLL ×9 → **72MHz SYSCLK**
- **APB1**: 36MHz (USART2, I2C1)
- **APB2**: 72MHz (USART1, GPIO)

## Build Requirements

- **IDE**: STM32CubeIDE 1.13+
- **HAL**: STM32F1xx HAL Driver (auto-generated from `.ioc`)
- **Toolchain**: ARM GCC (bundled with STM32CubeIDE)
- **Flasher**: ST-Link V2 via SWD

## Project Structure

```
firmware/
├── Inc/
│   ├── main.h              # Pin macros, constants, prototypes
│   ├── crc16.h             # CRC-16/CCITT header
│   ├── lcd.h               # HD44780 LCD driver (I2C PCF8574)
│   ├── fingerprint.h       # R307 sensor driver
│   ├── uart_comm.h         # UART packet TX/RX
│   └── buzzer.h            # Buzzer control
├── Src/
│   ├── main.c              # HAL init + super-loop
│   ├── crc16.c             # CRC-16 lookup table implementation
│   ├── lcd.c               # LCD I2C driver
│   ├── fingerprint.c       # R307 UART driver
│   ├── uart_comm.c         # Auth packet construction + ACK
│   └── buzzer.c            # GPIO buzzer patterns
├── tests/
│   └── test_crc16.c        # Host-compilable CRC cross-validation
├── lexnet-firmware.ioc     # STM32CubeMX project file
└── README.md               # This file
```

## Building

1. Open `lexnet-firmware.ioc` in STM32CubeIDE
2. Generate code (Project → Generate Code)
3. Build (Project → Build All)
4. Flash via ST-Link (Run → Debug / Run)

## CRC Cross-Validation

The CRC-16/CCITT implementation in `Src/crc16.c` is verified to match the Python bridge (`hardware-bridge/src/crc16.py`). To run the host-side cross-check:

```bash
cd firmware
gcc -o tests/test_crc16 tests/test_crc16.c Src/crc16.c -IInc -DTEST_HOST -Wall -Wextra
./tests/test_crc16
```

Expected: All 7 tests PASS.

## LCD I2C Address

The PCF8574 adapter's default I2C address is `0x27`. If your adapter uses `0x3F`, change `LCD_ADDR` in `Inc/main.h`. To scan for the correct address, use an I2C scanner sketch before flashing.

## UART Protocol

The firmware sends 16-byte authentication packets over USART1 to the Python bridge:

```
Offset  Size  Field         Encoding
0       4     DEVICE_ID     4 raw bytes (DEVICE_ID_BYTE0..3 from main.h)
4       2     FINGER_SCORE  uint16_t, little-endian
6       8     TIMESTAMP     uint64_t, little-endian (ms since epoch)
14      2     CRC16         CRC-16/CCITT of bytes [0..13], little-endian
```

Bridge responds with 1-byte ACK: `0x01` = success, `0xFF` = failure.
