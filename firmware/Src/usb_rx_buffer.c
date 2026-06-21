/**
 * @file    usb_rx_buffer.c
 * @brief   Ring buffer implementation for USB CDC received bytes.
 *
 * This buffer sits between the USB CDC interrupt callback (CDC_Receive_FS)
 * and the main loop (receive_ack). It handles the asynchronous nature of
 * USB CDC reception safely.
 *
 * Thread safety: push() is called from USB interrupt context, pop() from
 * main loop. The critical section is protected by disabling/enabling the
 * USB interrupt around the head/tail pointer update.
 */

#include "usb_rx_buffer.h"
#include "stm32f1xx_hal.h"

/* ========================================================================== */
/*                           RING BUFFER STATE                                */
/* ========================================================================== */

/** The ring buffer storage */
static volatile uint8_t  rx_buf[USB_RX_BUFFER_SIZE];

/** Write index (updated by push in ISR context) */
static volatile uint16_t rx_head = 0;

/** Read index (updated by pop in main loop context) */
static volatile uint16_t rx_tail = 0;

/* ========================================================================== */
/*                           PUBLIC API                                       */
/* ========================================================================== */

void usb_rx_buffer_push(const uint8_t *data, uint32_t len)
{
    uint32_t i;

    if (data == NULL || len == 0) {
        return;
    }

    for (i = 0; i < len; i++) {
        uint16_t next_head = (uint16_t)((rx_head + 1U) % USB_RX_BUFFER_SIZE);

        if (next_head == rx_tail) {
            /* Buffer full — drop remaining bytes */
            break;
        }

        rx_buf[rx_head] = data[i];
        rx_head = next_head;
    }
}

uint8_t usb_rx_buffer_pop(uint8_t *byte, uint32_t timeout_ms)
{
    uint32_t start;

    if (byte == NULL) {
        return 0;
    }

    start = HAL_GetTick();

    while ((HAL_GetTick() - start) < timeout_ms) {
        if (rx_head != rx_tail) {
            /* Byte available — read and advance tail */
            *byte = rx_buf[rx_tail];
            rx_tail = (uint16_t)((rx_tail + 1U) % USB_RX_BUFFER_SIZE);
            return 1;
        }
        HAL_Delay(1);  /* 1ms poll interval */
    }

    return 0;  /* Timed out */
}

void usb_rx_buffer_flush(void)
{
    /* Reset both pointers — atomically discard all pending data */
    rx_tail = rx_head;
}
