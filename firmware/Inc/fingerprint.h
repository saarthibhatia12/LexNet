/**
 * @file    fingerprint.h
 * @brief   R307 optical fingerprint sensor UART driver.
 * @details Communicates with the R307 (ZFM-20 series) fingerprint module
 *          over USART2 (PA2/PA3) at 57600 baud.
 *
 * R307 Protocol Overview:
 *   - Header:       0xEF 0x01
 *   - Address:      4 bytes (default 0xFFFFFFFF)
 *   - Packet type:  1 byte (0x01=command, 0x07=ack, 0x02=data, 0x08=end-of-data)
 *   - Length:        2 bytes big-endian (includes instruction + data + checksum)
 *   - Instruction:   1 byte (command code)
 *   - Data:          variable length
 *   - Checksum:      2 bytes big-endian (sum of type + length + instruction + data)
 *
 * Workflow for fingerprint matching:
 *   1. fp_capture()   — GenImg: capture finger image into ImageBuffer
 *   2. fp_img_to_tz() — Img2Tz: convert image to character file in CharBuffer1
 *   3. fp_search()    — Search: search library for matching template (returns page + score)
 */

#ifndef __FINGERPRINT_H
#define __FINGERPRINT_H

#ifdef __cplusplus
extern "C" {
#endif

#include "stm32f1xx_hal.h"
#include <stdint.h>

/* ========================================================================== */
/*                         R307 PROTOCOL CONSTANTS                            */
/* ========================================================================== */

/** R307 packet header bytes */
#define FP_HEADER_HIGH            0xEF
#define FP_HEADER_LOW             0x01

/** R307 default module address (4 bytes, 0xFFFFFFFF) */
#define FP_DEFAULT_ADDR           0xFFFFFFFF

/** Packet types */
#define FP_PKT_COMMAND            0x01  /**< Command packet */
#define FP_PKT_ACK                0x07  /**< Acknowledgment packet */

/** Instruction codes */
#define FP_CMD_VERIFY_PWD         0x13  /**< Verify module password */
#define FP_CMD_GEN_IMG            0x01  /**< Capture finger image */
#define FP_CMD_IMG_TO_TZ          0x02  /**< Generate character file from image */
#define FP_CMD_SEARCH             0x04  /**< Search fingerprint library */
#define FP_CMD_LOAD_CHAR          0x07  /**< Load template from library */
#define FP_CMD_TEMPLATE_COUNT     0x1D  /**< Get stored template count */

/** Confirmation codes (response byte after packet type + length) */
#define FP_ACK_SUCCESS            0x00  /**< Command executed successfully */
#define FP_ACK_COMM_ERR           0x01  /**< Communication error */
#define FP_ACK_NO_FINGER          0x02  /**< No finger detected on sensor */
#define FP_ACK_ENROLL_FAIL        0x03  /**< Failed to enroll */
#define FP_ACK_IMG_MESSY          0x06  /**< Image too messy */
#define FP_ACK_IMG_FEW_FEATURES   0x07  /**< Too few feature points */
#define FP_ACK_NO_MATCH           0x09  /**< No matching template found */

/** R307 default password */
#define FP_DEFAULT_PASSWORD       0x00000000

/** Maximum response packet size (header + addr + type + len + data + checksum) */
#define FP_MAX_RESPONSE_SIZE      64

/** CharBuffer IDs for Img2Tz */
#define FP_CHARBUFFER_1           0x01
#define FP_CHARBUFFER_2           0x02

/* ========================================================================== */
/*                            PUBLIC API                                      */
/* ========================================================================== */

/**
 * @brief  Initialise the R307 fingerprint sensor.
 *
 * Sends the VfyPwd (verify password) command with the default password.
 * This confirms the sensor is connected, powered, and responding.
 *
 * @return HAL_OK if sensor responds with success, HAL_ERROR otherwise.
 * @note   Must be called before any other fp_* function.
 */
HAL_StatusTypeDef fp_init(void);

/**
 * @brief  Capture a fingerprint image from the sensor.
 *
 * Sends GenImg command. The sensor captures a finger image into its
 * internal ImageBuffer. This function blocks until a finger is placed
 * or the capture timeout (FP_CAPTURE_TIMEOUT) expires.
 *
 * @return HAL_OK if finger captured successfully.
 *         HAL_TIMEOUT if no finger detected within timeout.
 *         HAL_ERROR on communication or sensor error.
 */
HAL_StatusTypeDef fp_capture(void);

/**
 * @brief  Convert captured image to character file and search for match.
 *
 * Performs the full match sequence:
 *   1. Img2Tz: convert ImageBuffer → CharBuffer1
 *   2. Search: search library pages 0–199 for match
 *
 * @param[out] score  Pointer to receive the match confidence score (0–300+).
 *                    Only valid if return value is HAL_OK.
 *                    Set to 0 if no match found.
 * @return HAL_OK if a matching template was found (score is valid).
 *         HAL_ERROR if no match found or sensor error.
 */
HAL_StatusTypeDef fp_match(uint16_t *score);

/**
 * @brief  Get the number of stored templates in the sensor library.
 * @param[out] count  Pointer to receive template count.
 * @return HAL_OK on success, HAL_ERROR on failure.
 */
HAL_StatusTypeDef fp_get_template_count(uint16_t *count);

#ifdef __cplusplus
}
#endif

#endif /* __FINGERPRINT_H */
