/**
 * @file    uart_comm.h
 * @brief   Authentication packet TX/RX — via USB CDC Virtual COM Port.
 * @details The Blue Pill's micro USB uses the STM32F103 built-in USB FS
 *          peripheral (PA11 = D−, PA12 = D+). CubeMX configures it as a
 *          USB CDC device (Virtual COM Port). The laptop sees it as a COM port
 *          just like a USB-TTL adapter would — no extra hardware needed.
 *
 * Transport:  USB CDC (usbd_cdc_if.h → CDC_Transmit_FS)
 * TX:         CDC_Transmit_FS(buf, len) — non-blocking, copies to USB TX FIFO
 * RX:         usb_rx_buffer_pop() — polls a ring buffer filled by CDC_Receive_FS callback
 *
 * Packet Format (16 bytes, all little-endian):
 *   Offset  Size  Field          Description
 *   0       4     device_id      4 raw bytes (from DEVICE_ID_BYTEn macros)
 *   4       2     finger_score   uint16_t match confidence score
 *   6       8     timestamp      uint64_t milliseconds (HAL_GetTick)
 *   14      2     crc16          CRC-16/CCITT of bytes [0..13]
 *
 * ACK Protocol (1 byte from Python bridge):
 *   0x01 = ACK_SUCCESS (bridge accepted, JWT sent to backend)
 *   0xFF = ACK_FAILURE (bridge rejected — bad CRC, low score, etc.)
 *   0x00 = ACK_TIMEOUT (no response within UART_TIMEOUT ms)
 */

#ifndef __UART_COMM_H
#define __UART_COMM_H

#ifdef __cplusplus
extern "C" {
#endif

#include "stm32f1xx_hal.h"
#include <stdint.h>

/* ========================================================================== */
/*                            PACKET STRUCTURE                                */
/* ========================================================================== */

/**
 * @brief 16-byte authentication packet sent over USB CDC to the Python bridge.
 *
 * Uses __attribute__((packed)) — no padding. Maps directly to wire format.
 * Python bridge unpacks with: struct.unpack('<4sHQH', raw_bytes)
 */
typedef struct __attribute__((packed)) {
    uint8_t  device_id[4];     /**< Device identifier (DEVICE_ID_BYTE0..3) */
    uint16_t finger_score;     /**< Fingerprint match score (0–300+) */
    uint64_t timestamp;        /**< Milliseconds since boot (HAL_GetTick) */
    uint16_t crc16;            /**< CRC-16/CCITT of bytes [0..13] */
} AuthPacket;

/* Compile-time size check */
_Static_assert(sizeof(AuthPacket) == 16, "AuthPacket must be exactly 16 bytes");

/* ========================================================================== */
/*                            PUBLIC API                                      */
/* ========================================================================== */

/**
 * @brief  Build and send a 16-byte authentication packet via USB CDC.
 *
 * Constructs an AuthPacket (device_id + score + timestamp + CRC-16),
 * flushes the RX buffer, then calls CDC_Transmit_FS(). Retries up to
 * UART_MAX_RETRIES times if USB is busy.
 *
 * @param  score  The fingerprint match confidence score.
 * @return HAL_OK on successful transmission, HAL_ERROR on all retries failed.
 */
HAL_StatusTypeDef send_auth_packet(uint16_t score);

/**
 * @brief  Wait for a 1-byte ACK from the Python bridge via USB CDC.
 *
 * Polls the USB RX ring buffer for up to UART_TIMEOUT milliseconds.
 * The ring buffer is filled by CDC_Receive_FS() in usbd_cdc_if.c.
 *
 * @return ACK_SUCCESS (0x01), ACK_FAILURE (0xFF), or ACK_TIMEOUT (0x00).
 */
uint8_t receive_ack(void);

/**
 * @brief  Discard all bytes currently in the USB CDC RX ring buffer.
 *
 * Call before send_auth_packet() to prevent stale ACK bytes from a
 * previous transaction being misread as the current response.
 */
void uart_flush_rx(void);

#ifdef __cplusplus
}
#endif

#endif /* __UART_COMM_H */
