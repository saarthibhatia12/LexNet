/**
 * @file    usb_rx_buffer.h
 * @brief   Ring buffer for USB CDC received bytes.
 *
 * USB CDC data arrives asynchronously via the CDC_Receive_FS() interrupt
 * callback in usbd_cdc_if.c. This module provides a thread-safe ring buffer
 * so the main loop can poll for incoming bytes (ACK responses from the bridge).
 *
 * Usage:
 *   In usbd_cdc_if.c → CDC_Receive_FS():
 *     usb_rx_buffer_push(Buf, *Len);
 *
 *   In uart_comm.c → receive_ack():
 *     usb_rx_buffer_pop(&byte, UART_TIMEOUT);
 */

#ifndef __USB_RX_BUFFER_H
#define __USB_RX_BUFFER_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>

/** Ring buffer capacity in bytes. 64 is more than enough for 1-byte ACKs. */
#define USB_RX_BUFFER_SIZE    64U

/**
 * @brief  Push received bytes into the ring buffer.
 *
 * Called from CDC_Receive_FS() interrupt context. Safe to call from ISR.
 * Bytes that exceed the buffer capacity are silently dropped.
 *
 * @param  data  Pointer to received data.
 * @param  len   Number of bytes received.
 */
void usb_rx_buffer_push(const uint8_t *data, uint32_t len);

/**
 * @brief  Pop one byte from the ring buffer, blocking until available or timeout.
 *
 * Called from main loop context (receive_ack). Polls the buffer with 1ms
 * intervals until a byte is available or timeout_ms expires.
 *
 * @param[out] byte        Pointer to store the received byte.
 * @param[in]  timeout_ms  Maximum time to wait in milliseconds.
 * @return 1 if a byte was received, 0 if timed out.
 */
uint8_t usb_rx_buffer_pop(uint8_t *byte, uint32_t timeout_ms);

/**
 * @brief  Discard all bytes currently in the ring buffer.
 *
 * Call before send_auth_packet() to clear any stale ACK bytes.
 */
void usb_rx_buffer_flush(void);

#ifdef __cplusplus
}
#endif

#endif /* __USB_RX_BUFFER_H */
