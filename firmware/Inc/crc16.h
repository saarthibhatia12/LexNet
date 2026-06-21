/**
 * @file    crc16.h
 * @brief   CRC-16/CCITT header — polynomial 0x1021, initial value 0xFFFF
 * @details This CRC implementation MUST produce identical output to the
 *          Python hardware-bridge's compute_crc16() in crc16.py.
 *
 *          Verified cross-check test vectors:
 *            Input "123456789" (0x31..0x39) → 0x29B1
 *            Empty input                    → 0xFFFF
 *            14 zero bytes                  → 0xA96A
 */

#ifndef __CRC16_H
#define __CRC16_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>

/**
 * @brief  Compute CRC-16/CCITT over a byte buffer.
 *
 * Uses a 256-entry pre-computed lookup table for speed on the STM32F103.
 * Algorithm: For each byte, XOR with high byte of CRC, look up in table,
 * XOR result with shifted CRC.
 *
 * @param  data  Pointer to input data buffer. Must not be NULL unless len is 0.
 * @param  len   Number of bytes to process.
 * @return CRC-16 value (0x0000 – 0xFFFF).
 *
 * @note   Polynomial: 0x1021 (x^16 + x^12 + x^5 + 1)
 * @note   Initial value: 0xFFFF
 * @note   No final XOR (XOR-out = 0x0000)
 * @note   Input is NOT reflected; output is NOT reflected.
 *
 * @par Cross-compatibility
 * The Python bridge's compute_crc16() uses the identical algorithm:
 * @code
 *   crc = 0xFFFF
 *   for byte in data:
 *       lookup_index = ((crc >> 8) ^ byte) & 0xFF
 *       crc = (table[lookup_index] ^ (crc << 8)) & 0xFFFF
 * @endcode
 */
uint16_t crc16_ccitt(const uint8_t *data, uint16_t len);

#ifdef __cplusplus
}
#endif

#endif /* __CRC16_H */
