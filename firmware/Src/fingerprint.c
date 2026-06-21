/**
 * @file    fingerprint.c
 * @brief   R307 optical fingerprint sensor UART driver implementation.
 * @details Communicates with the R307 (ZFM-20 series) module over USART2
 *          using the proprietary binary protocol at 57600 baud.
 *
 * Protocol frame format:
 *   [0xEF][0x01][Addr(4B)][PktType(1B)][Length(2B)][Data(nB)][Chksum(2B)]
 *
 * The checksum is the arithmetic sum of: PktType + Length + Data bytes.
 */

#include "fingerprint.h"
#include "main.h"
#include <string.h>

/* ========================================================================== */
/*                           PRIVATE STATE                                    */
/* ========================================================================== */

/** TX buffer for building command packets */
static uint8_t fp_tx_buf[FP_MAX_RESPONSE_SIZE];

/** RX buffer for reading response packets */
static uint8_t fp_rx_buf[FP_MAX_RESPONSE_SIZE];

/* ========================================================================== */
/*                       PRIVATE PROTOCOL HELPERS                             */
/* ========================================================================== */

/**
 * @brief  Build an R307 command packet in fp_tx_buf.
 *
 * Constructs the full packet frame:
 *   Header(2B) + Address(4B) + Type(1B) + Length(2B) + Instruction(1B) + Params + Checksum(2B)
 *
 * @param  instruction  The R307 instruction code (e.g. FP_CMD_GEN_IMG).
 * @param  params       Parameter bytes to append after instruction. NULL if none.
 * @param  params_len   Number of parameter bytes. 0 if none.
 * @return Total packet length in bytes.
 */
static uint16_t fp_build_command(uint8_t instruction, const uint8_t *params, uint8_t params_len)
{
    uint16_t idx = 0;
    uint16_t checksum;
    uint16_t data_len;

    /* Header */
    fp_tx_buf[idx++] = FP_HEADER_HIGH;
    fp_tx_buf[idx++] = FP_HEADER_LOW;

    /* Module address (4 bytes, big-endian, default 0xFFFFFFFF) */
    fp_tx_buf[idx++] = 0xFF;
    fp_tx_buf[idx++] = 0xFF;
    fp_tx_buf[idx++] = 0xFF;
    fp_tx_buf[idx++] = 0xFF;

    /* Packet type: command */
    fp_tx_buf[idx++] = FP_PKT_COMMAND;

    /* Length = instruction(1) + params(n) + checksum(2) */
    data_len = (uint16_t)(1 + params_len + 2);
    fp_tx_buf[idx++] = (uint8_t)(data_len >> 8);   /* Length high byte */
    fp_tx_buf[idx++] = (uint8_t)(data_len & 0xFF);  /* Length low byte */

    /* Instruction code */
    fp_tx_buf[idx++] = instruction;

    /* Parameter bytes */
    if (params != NULL && params_len > 0) {
        memcpy(&fp_tx_buf[idx], params, params_len);
        idx += params_len;
    }

    /* Checksum = sum of (PktType + LengthHigh + LengthLow + Instruction + Params) */
    checksum = FP_PKT_COMMAND;
    checksum += (uint16_t)(data_len >> 8);
    checksum += (uint16_t)(data_len & 0xFF);
    checksum += instruction;
    for (uint8_t i = 0; i < params_len; i++) {
        checksum += params[i];
    }

    fp_tx_buf[idx++] = (uint8_t)(checksum >> 8);   /* Checksum high byte */
    fp_tx_buf[idx++] = (uint8_t)(checksum & 0xFF);  /* Checksum low byte */

    return idx;
}

/**
 * @brief  Send a command and receive the response packet.
 *
 * @param  cmd_len    Length of command packet in fp_tx_buf.
 * @param  resp_len   Expected response packet length (header + addr + type + len + data + chksum).
 * @param  timeout    UART receive timeout in milliseconds.
 * @return HAL_OK if response received and header bytes are valid.
 *         HAL_ERROR if response header is invalid.
 *         HAL_TIMEOUT if no response within timeout.
 */
static HAL_StatusTypeDef fp_send_and_receive(uint16_t cmd_len, uint16_t resp_len, uint32_t timeout)
{
    HAL_StatusTypeDef status;

    /* Clear RX buffer */
    memset(fp_rx_buf, 0, sizeof(fp_rx_buf));

    /* Transmit command */
    status = HAL_UART_Transmit(&FP_UART, fp_tx_buf, cmd_len, timeout);
    if (status != HAL_OK) {
        return status;
    }

    /* Receive response */
    status = HAL_UART_Receive(&FP_UART, fp_rx_buf, resp_len, timeout);
    if (status != HAL_OK) {
        return status;
    }

    /* Validate response header */
    if (fp_rx_buf[0] != FP_HEADER_HIGH || fp_rx_buf[1] != FP_HEADER_LOW) {
        return HAL_ERROR;
    }

    /* Validate packet type is ACK */
    if (fp_rx_buf[6] != FP_PKT_ACK) {
        return HAL_ERROR;
    }

    return HAL_OK;
}

/**
 * @brief  Extract the confirmation code from an R307 response packet.
 * @return The confirmation code byte (FP_ACK_SUCCESS, FP_ACK_NO_FINGER, etc.)
 *         Returns 0xFF on invalid packet.
 */
static uint8_t fp_get_confirmation_code(void)
{
    /* Confirmation code is the first data byte after header(2) + addr(4) + type(1) + length(2) = offset 9 */
    return fp_rx_buf[9];
}

/* ========================================================================== */
/*                            PUBLIC API                                      */
/* ========================================================================== */

HAL_StatusTypeDef fp_init(void)
{
    HAL_StatusTypeDef status;

    /*
     * VfyPwd command: verify module password.
     * Parameters: 4 bytes of password (default 0x00000000).
     * Response: 12 bytes (header + addr + type + length + confirm + checksum)
     */
    uint8_t password[4] = {
        (uint8_t)((FP_DEFAULT_PASSWORD >> 24) & 0xFF),
        (uint8_t)((FP_DEFAULT_PASSWORD >> 16) & 0xFF),
        (uint8_t)((FP_DEFAULT_PASSWORD >> 8)  & 0xFF),
        (uint8_t)((FP_DEFAULT_PASSWORD)       & 0xFF)
    };

    uint16_t cmd_len = fp_build_command(FP_CMD_VERIFY_PWD, password, 4);

    status = fp_send_and_receive(cmd_len, 12, UART_TIMEOUT);
    if (status != HAL_OK) {
        return HAL_ERROR;
    }

    /* Check confirmation code */
    if (fp_get_confirmation_code() != FP_ACK_SUCCESS) {
        return HAL_ERROR;
    }

    return HAL_OK;
}

HAL_StatusTypeDef fp_capture(void)
{
    HAL_StatusTypeDef status;
    uint32_t start_tick = HAL_GetTick();

    /*
     * GenImg command: capture finger image.
     * No parameters.
     * Response: 12 bytes.
     *
     * Loop until finger detected or timeout.
     * The sensor returns FP_ACK_NO_FINGER (0x02) if no finger is present.
     */
    while ((HAL_GetTick() - start_tick) < FP_CAPTURE_TIMEOUT) {
        uint16_t cmd_len = fp_build_command(FP_CMD_GEN_IMG, NULL, 0);

        status = fp_send_and_receive(cmd_len, 12, UART_TIMEOUT);
        if (status != HAL_OK) {
            /* Communication error — retry after short delay */
            HAL_Delay(100);
            continue;
        }

        uint8_t confirm = fp_get_confirmation_code();

        if (confirm == FP_ACK_SUCCESS) {
            /* Finger image captured successfully */
            return HAL_OK;
        }

        if (confirm == FP_ACK_NO_FINGER) {
            /* No finger yet — poll again after short delay */
            HAL_Delay(200);
            continue;
        }

        /* Other error (messy image, etc.) — treat as temporary, retry */
        HAL_Delay(100);
    }

    /* Timeout: no finger placed within FP_CAPTURE_TIMEOUT */
    return HAL_TIMEOUT;
}

HAL_StatusTypeDef fp_match(uint16_t *score)
{
    HAL_StatusTypeDef status;

    if (score == NULL) {
        return HAL_ERROR;
    }

    *score = 0;

    /*
     * Step 1: Img2Tz — convert captured image to character file in CharBuffer1.
     * Parameters: 1 byte (buffer ID = 0x01).
     * Response: 12 bytes.
     */
    uint8_t buffer_id = FP_CHARBUFFER_1;
    uint16_t cmd_len = fp_build_command(FP_CMD_IMG_TO_TZ, &buffer_id, 1);

    status = fp_send_and_receive(cmd_len, 12, UART_TIMEOUT);
    if (status != HAL_OK) {
        return HAL_ERROR;
    }

    if (fp_get_confirmation_code() != FP_ACK_SUCCESS) {
        return HAL_ERROR;
    }

    /*
     * Step 2: Search — search fingerprint library for matching template.
     * Parameters: 5 bytes:
     *   - BufferID:     1 byte (0x01 = CharBuffer1)
     *   - StartPage:    2 bytes big-endian (0x0000)
     *   - PageCount:    2 bytes big-endian (0x00C8 = 200 entries)
     * Response: 16 bytes (header + addr + type + length + confirm + pageID[2] + score[2] + checksum)
     */
    uint8_t search_params[5] = {
        FP_CHARBUFFER_1,           /* Buffer ID */
        0x00, 0x00,                /* Start page (0) */
        0x00, 0xC8                 /* Page count (200) */
    };

    cmd_len = fp_build_command(FP_CMD_SEARCH, search_params, 5);

    status = fp_send_and_receive(cmd_len, 16, UART_TIMEOUT * 4);  /* Search takes longer */
    if (status != HAL_OK) {
        return HAL_ERROR;
    }

    uint8_t confirm = fp_get_confirmation_code();

    if (confirm == FP_ACK_NO_MATCH) {
        /* No matching template found — score stays 0 */
        *score = 0;
        return HAL_ERROR;
    }

    if (confirm != FP_ACK_SUCCESS) {
        /* Unexpected error */
        return HAL_ERROR;
    }

    /*
     * Parse match result from response:
     *   Byte 10-11: Page ID (big-endian uint16) — which template matched
     *   Byte 12-13: Match Score (big-endian uint16) — confidence 0–300+
     */
    *score = (uint16_t)((fp_rx_buf[12] << 8) | fp_rx_buf[13]);

    return HAL_OK;
}

HAL_StatusTypeDef fp_get_template_count(uint16_t *count)
{
    HAL_StatusTypeDef status;

    if (count == NULL) {
        return HAL_ERROR;
    }

    *count = 0;

    /*
     * TemplateNum command: get stored template count.
     * No parameters.
     * Response: 14 bytes (header + addr + type + length + confirm + count[2] + checksum)
     */
    uint16_t cmd_len = fp_build_command(FP_CMD_TEMPLATE_COUNT, NULL, 0);

    status = fp_send_and_receive(cmd_len, 14, UART_TIMEOUT);
    if (status != HAL_OK) {
        return HAL_ERROR;
    }

    if (fp_get_confirmation_code() != FP_ACK_SUCCESS) {
        return HAL_ERROR;
    }

    /* Template count is at bytes 10-11 (big-endian uint16) */
    *count = (uint16_t)((fp_rx_buf[10] << 8) | fp_rx_buf[11]);

    return HAL_OK;
}
