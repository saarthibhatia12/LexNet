/**
 * @file    test_crc16.c
 * @brief   CRC-16/CCITT cross-validation test against Python bridge.
 * @details Compiles on any platform (no STM32 HAL dependency).
 *          Verifies the firmware CRC table and algorithm produce identical
 *          output to the Python hardware-bridge's compute_crc16().
 *
 * Build:   gcc -o test_crc16 test_crc16.c ../Src/crc16.c -I../Inc -DTEST_HOST
 * Run:     ./test_crc16
 *
 * Expected output: All 7 tests PASS.
 */

#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>

/*
 * When building on host (not STM32), crc16.h includes stm32f1xx_hal.h
 * via main.h — we bypass that by providing the prototype directly.
 * The TEST_HOST define is set on the compile command line.
 */
#ifdef TEST_HOST
/* Direct prototype — avoids pulling in HAL headers */
uint16_t crc16_ccitt(const uint8_t *data, uint16_t len);
#else
#include "crc16.h"
#endif

/* ========================================================================== */
/*                          TEST FRAMEWORK (minimal)                          */
/* ========================================================================== */

static int tests_run    = 0;
static int tests_passed = 0;
static int tests_failed = 0;

#define TEST_ASSERT_EQUAL(expected, actual, test_name)                         \
    do {                                                                       \
        tests_run++;                                                           \
        if ((expected) == (actual)) {                                          \
            tests_passed++;                                                    \
            printf("  [PASS] %s: expected 0x%04X, got 0x%04X\n",              \
                   (test_name), (unsigned)(expected), (unsigned)(actual));      \
        } else {                                                               \
            tests_failed++;                                                    \
            printf("  [FAIL] %s: expected 0x%04X, got 0x%04X\n",              \
                   (test_name), (unsigned)(expected), (unsigned)(actual));      \
        }                                                                      \
    } while (0)

/* ========================================================================== */
/*                              TEST VECTORS                                  */
/* ========================================================================== */
/*
 * All expected CRC values were computed by running the Python bridge:
 *   cd hardware-bridge && python -c "from src.crc16 import compute_crc16; ..."
 */

/**
 * Test 1: Canonical CCITT test vector.
 * Input:  ASCII "123456789" (bytes 0x31..0x39)
 * Python: compute_crc16(b"123456789") == 0x29B1
 */
static void test_canonical_vector(void)
{
    const uint8_t data[] = "123456789";
    /* strlen excludes null terminator — 9 bytes */
    uint16_t result = crc16_ccitt(data, 9);
    TEST_ASSERT_EQUAL(0x29B1, result, "Canonical '123456789'");
}

/**
 * Test 2: Empty input.
 * CRC should be the initial value 0xFFFF since no data was processed.
 * Python: compute_crc16(b"") == 0xFFFF
 */
static void test_empty_input(void)
{
    uint16_t result = crc16_ccitt(NULL, 0);
    TEST_ASSERT_EQUAL(0xFFFF, result, "Empty input (NULL, 0)");
}

/**
 * Test 3: 14 zero bytes (simulating a zeroed-out packet payload).
 * Python: compute_crc16(bytes(14)) == 0xA96A
 */
static void test_14_zeros(void)
{
    const uint8_t data[14] = {0};
    uint16_t result = crc16_ccitt(data, 14);
    TEST_ASSERT_EQUAL(0xA96A, result, "14 zero bytes");
}

/**
 * Test 4: Packet payload with device_id stored as-is (firmware default order).
 *
 * Payload layout (14 bytes):
 *   device_id  = {0xA1, 0xB2, 0xC3, 0xD4} (4 raw bytes as stored in DEVICE_ID_BYTEn macros)
 *   score      = 85 → uint16_t LE → {0x55, 0x00}
 *   timestamp  = 1710500000 (0x65F428A0) → uint64_t LE → {0xA0, 0x28, 0xF4, 0x65, 0x00, 0x00, 0x00, 0x00}
 *
 * Full payload hex: A1 B2 C3 D4 55 00 A0 28 F4 65 00 00 00 00
 *
 * Python cross-check:
 *   compute_crc16(bytes.fromhex('a1b2c3d45500a028f46500000000')) == 0x55A3
 */
static void test_packet_payload_firmware_order(void)
{
    const uint8_t payload[14] = {
        0xA1, 0xB2, 0xC3, 0xD4,            /* device_id (firmware DEVICE_ID_BYTE0..3) */
        0x55, 0x00,                          /* score = 85 LE */
        0xA0, 0x28, 0xF4, 0x65,            /* timestamp LE low (1710500000 = 0x65F428A0) */
        0x00, 0x00, 0x00, 0x00             /* timestamp LE high */
    };
    uint16_t result = crc16_ccitt(payload, 14);
    TEST_ASSERT_EQUAL(0x55A3, result, "Packet payload (firmware byte order)");
}

/**
 * Test 5: Packet payload with device_id in bridge test order.
 *
 * The Python bridge test (test_crc16.py line 116) uses:
 *   device_id = b"\xD4\xC3\xB2\xA1"
 * This represents the LE encoding of the 32-bit value 0xA1B2C3D4.
 *
 * Full payload hex: D4 C3 B2 A1 55 00 A0 28 F4 65 00 00 00 00
 *
 * Python cross-check:
 *   compute_crc16(bytes.fromhex('d4c3b2a15500a028f46500000000')) == 0x32D6
 */
static void test_packet_payload_bridge_order(void)
{
    const uint8_t payload[14] = {
        0xD4, 0xC3, 0xB2, 0xA1,            /* device_id (bridge LE encoding) */
        0x55, 0x00,                          /* score = 85 LE */
        0xA0, 0x28, 0xF4, 0x65,            /* timestamp LE low (1710500000 = 0x65F428A0) */
        0x00, 0x00, 0x00, 0x00             /* timestamp LE high */
    };
    uint16_t result = crc16_ccitt(payload, 14);
    TEST_ASSERT_EQUAL(0x32D6, result, "Packet payload (bridge byte order)");
}

/**
 * Test 6: Round-trip packet construction and CRC validation.
 * Build a 16-byte packet (14-byte payload + 2-byte CRC LE), then verify
 * that re-computing CRC over the payload matches the embedded CRC field.
 */
static void test_packet_roundtrip(void)
{
    const uint8_t payload[14] = {
        0xA1, 0xB2, 0xC3, 0xD4,
        0x55, 0x00,
        0xA0, 0x28, 0xF4, 0x65,
        0x00, 0x00, 0x00, 0x00
    };

    uint16_t crc = crc16_ccitt(payload, 14);

    /* Build full 16-byte packet with CRC appended as little-endian */
    uint8_t full_packet[16];
    memcpy(full_packet, payload, 14);
    full_packet[14] = (uint8_t)(crc & 0xFF);        /* CRC low byte */
    full_packet[15] = (uint8_t)((crc >> 8) & 0xFF); /* CRC high byte */

    /* Re-validate: CRC of the payload portion must match */
    uint16_t recheck = crc16_ccitt(full_packet, 14);
    TEST_ASSERT_EQUAL(crc, recheck, "Packet round-trip CRC validation");
}

/**
 * Test 7: Determinism — same data must always produce the same CRC.
 */
static void test_deterministic(void)
{
    const uint8_t data[] = {0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE};
    uint16_t crc1 = crc16_ccitt(data, 6);
    uint16_t crc2 = crc16_ccitt(data, 6);
    TEST_ASSERT_EQUAL(crc1, crc2, "Deterministic (same input -> same CRC)");
}

/* ========================================================================== */
/*                                 MAIN                                       */
/* ========================================================================== */

int main(void)
{
    printf("=== LexNet CRC-16/CCITT Cross-Validation Tests ===\n");
    printf("    Firmware crc16.c vs Python bridge crc16.py\n\n");

    test_canonical_vector();
    test_empty_input();
    test_14_zeros();
    test_packet_payload_firmware_order();
    test_packet_payload_bridge_order();
    test_packet_roundtrip();
    test_deterministic();

    printf("\n--- Results: %d/%d passed", tests_passed, tests_run);
    if (tests_failed > 0) {
        printf(", %d FAILED", tests_failed);
    }
    printf(" ---\n");

    return tests_failed > 0 ? EXIT_FAILURE : EXIT_SUCCESS;
}
