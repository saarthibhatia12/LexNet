/**
 * @file    main.h
 * @brief   LexNet Firmware — Main header with pin definitions, constants, and prototypes
 * @details STM32F103C8Tx (Blue Pill) pin mapping for LexNet biometric authentication.
 *
 * Peripherals:
 *   - USB FS  (PA11/PA12) : Bridge communication via USB CDC Virtual COM Port (micro USB)
 *   - USART2  (PA2/PA3)   : R307 fingerprint sensor, 57600 8N1
 *   - SPI1    (PA5/PA7)   : ILI9341 2.8" TFT display (240x320, RGB565)
 *   - GPIO    (PA4)       : TFT chip select (CS)
 *   - GPIO    (PB0)       : TFT data/command (DC)
 *   - GPIO    (PB1)       : TFT hardware reset (RST)
 *   - GPIO    (PB12)      : Piezo buzzer output
 */

#ifndef __MAIN_H
#define __MAIN_H

#ifdef __cplusplus
extern "C" {
#endif

/* ========================================================================== */
/*                              HAL INCLUDES                                  */
/* ========================================================================== */

#include "stm32f1xx_hal.h"
#include <stdint.h>
#include <stdbool.h>
#include <string.h>

/* ========================================================================== */
/*                          PIN DEFINITIONS                                   */
/* ========================================================================== */

/**
 * @defgroup GPIO_Pins GPIO Pin Assignments
 * @brief Hardware pin mapping for STM32F103C8Tx Blue Pill.
 * @{
 */

/* --- USART2: R307 Fingerprint Sensor (PA2 TX, PA3 RX) --- */
#define FP_UART_TX_Pin            GPIO_PIN_2
#define FP_UART_TX_Port           GPIOA
#define FP_UART_RX_Pin            GPIO_PIN_3
#define FP_UART_RX_Port           GPIOA

/* --- SPI1: ILI9341 TFT Display (PA5 SCK, PA7 MOSI) --- */
#define TFT_SPI_SCK_Pin           GPIO_PIN_5
#define TFT_SPI_SCK_Port          GPIOA
#define TFT_SPI_MOSI_Pin          GPIO_PIN_7
#define TFT_SPI_MOSI_Port         GPIOA

/* --- GPIO: TFT Control Pins --- */
#define TFT_CS_Pin                GPIO_PIN_4
#define TFT_CS_Port               GPIOA
#define TFT_DC_Pin                GPIO_PIN_0
#define TFT_DC_Port               GPIOB
#define TFT_RST_Pin               GPIO_PIN_1
#define TFT_RST_Port              GPIOB

/* --- GPIO: Buzzer (PB12) --- */
#define BUZZER_PIN                GPIO_PIN_12
#define BUZZER_PORT               GPIOB

/** @} */

/* ========================================================================== */
/*                      PERIPHERAL HANDLE ALIASES                             */
/* ========================================================================== */

/**
 * @defgroup Peripheral_Handles HAL Peripheral Handle Aliases
 * @brief Extern declarations for HAL handles (defined in main.c).
 * @{
 */

/** @brief USART2 handle — R307 fingerprint sensor (PA2 TX / PA3 RX) */
#define FP_UART                   huart2

/** @brief SPI1 handle — ILI9341 TFT display (PA5 SCK / PA7 MOSI) */
#define LCD_SPI                   hspi1

extern UART_HandleTypeDef huart2;   /* R307 fingerprint sensor  */
extern SPI_HandleTypeDef  hspi1;    /* ILI9341 TFT display      */

/** @} */

/* ========================================================================== */
/*                              CONSTANTS                                     */
/* ========================================================================== */

/**
 * @defgroup Constants Application Constants
 * @brief Thresholds, timeouts, and sizes.
 * @{
 */

/* --- Authentication --- */
/** Minimum fingerprint match score to proceed with authentication (0-100) */
#define SCORE_THRESHOLD           60

/* --- UART Communication --- */
/** UART transmit/receive timeout in milliseconds */
#define UART_TIMEOUT              500
/** Maximum UART TX retries before declaring COMM ERROR */
#define UART_MAX_RETRIES          3
/** Baud rate for USART2 (fingerprint sensor) */
#define UART_BAUD_RATE            57600

/* --- Packet Format --- */
/** Total auth packet size in bytes (device_id[4] + score[2] + timestamp[8] + crc16[2]) */
#define AUTH_PACKET_SIZE          16
/** Payload size (packet minus CRC field) */
#define AUTH_PAYLOAD_SIZE         14
/** Device ID field size in bytes */
#define DEVICE_ID_SIZE            4

/* --- ACK Response Codes --- */
/** ACK byte: authentication accepted by bridge */
#define ACK_SUCCESS               0x01
/** ACK byte: authentication rejected by bridge */
#define ACK_FAILURE               0xFF
/** ACK byte: no response received (timeout) */
#define ACK_TIMEOUT               0x00

/* --- Fingerprint Sensor --- */
/** R307 fingerprint capture timeout in milliseconds */
#define FP_CAPTURE_TIMEOUT        10000

/* --- Timing --- */
/** Delay between scan attempts in the main loop (milliseconds) */
#define SCAN_DELAY_MS             500

/** @} */

/* ========================================================================== */
/*                        DEVICE IDENTIFICATION                               */
/* ========================================================================== */

/**
 * @brief 4-byte device ID, stored little-endian.
 *
 * This ID is burned into the firmware at compile time and sent in every auth
 * packet. The Python bridge and backend use it to identify which physical
 * device performed the biometric authentication.
 *
 * Change this value for each deployed STM32 unit.
 */
#define DEVICE_ID_BYTE0           0xA1
#define DEVICE_ID_BYTE1           0xB2
#define DEVICE_ID_BYTE2           0xC3
#define DEVICE_ID_BYTE3           0xD4

/* ========================================================================== */
/*                         FUNCTION PROTOTYPES                                */
/* ========================================================================== */

/**
 * @defgroup App_Functions Application-Level Function Prototypes
 * @brief Declared here, implemented across the Src/ modules.
 * @{
 */

/* --- System (main.c) --- */
/** @brief System clock configuration (72MHz from 8MHz HSE via PLL) */
void SystemClock_Config(void);
/** @brief GPIO initialisation (buzzer pin) */
void MX_GPIO_Init(void);
/** @brief USART2 initialisation (R307 fingerprint sensor) */
void MX_USART2_UART_Init(void);
/** @brief SPI1 initialisation (ILI9341 TFT display) */
void MX_SPI1_Init(void);
/**
 * @brief Bridge communication initialisation (USB CDC Virtual COM Port).
 * @note  Declared in CubeMX-generated USB_DEVICE/App/usb_device.h.
 *        Call MX_USB_DEVICE_Init() after HAL_Init() and SystemClock_Config().
 */
void MX_USB_DEVICE_Init(void);
/** @brief Application error handler — never returns, loops with buzzer_fail() */
void Error_Handler(void);

/* --- CRC (crc16.c) --- */
/**
 * @brief Compute CRC-16/CCITT over a data buffer.
 * @param data  Pointer to input data bytes.
 * @param len   Number of bytes to process.
 * @return 16-bit CRC value.
 * @note Uses lookup table with polynomial 0x1021, initial value 0xFFFF.
 *       Output MUST match the Python bridge's compute_crc16() exactly.
 */
uint16_t crc16_ccitt(const uint8_t *data, uint16_t len);

/* --- LCD (lcd.c) --- */
void lcd_init(void);
void lcd_clear(void);
void lcd_set_cursor(uint8_t row, uint8_t col);
void lcd_print(const char *str);
void lcd_print_line(uint8_t row, const char *str);
void lcd_backlight(uint8_t on);

/* --- Fingerprint (fingerprint.c) --- */
HAL_StatusTypeDef fp_init(void);
HAL_StatusTypeDef fp_capture(void);
HAL_StatusTypeDef fp_match(uint16_t *score);
HAL_StatusTypeDef fp_get_template_count(uint16_t *count);

/* --- Buzzer (buzzer.c) --- */
void buzzer_success(void);
void buzzer_fail(void);
void buzzer_on(void);
void buzzer_off(void);

/* --- UART Comms (uart_comm.c) --- */
HAL_StatusTypeDef send_auth_packet(uint16_t score);
uint8_t receive_ack(void);
void uart_flush_rx(void);

/** @} */

#ifdef __cplusplus
}
#endif

#endif /* __MAIN_H */
