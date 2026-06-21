/**
 * @file    main.h
 * @brief   LexNet Firmware — Main header with pin definitions, constants, and prototypes
 * @details STM32F103C8Tx (Blue Pill) pin mapping for LexNet biometric authentication.
 *
 * Peripherals:
 *   - USB FS (PA11/PA12) : Bridge communication via USB CDC Virtual COM Port (micro USB)
 *   - USART2 (PA2/PA3)   : R307 fingerprint sensor, 57600 8N1
 *   - I2C1   (PB6/PB7)   : 16x2 LCD via PCF8574 I2C adapter
 *   - GPIO   (PB12)      : Piezo buzzer output
 *
 * NOTE: Bridge communication uses USB CDC (not USART1). The micro USB port on
 *       the Blue Pill appears as a Virtual COM Port on the host laptop.
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

/* --- USART1: Bridge Communication (PA9 TX, PA10 RX) --- */
#define BRIDGE_UART_TX_Pin        GPIO_PIN_9
#define BRIDGE_UART_TX_Port       GPIOA
#define BRIDGE_UART_RX_Pin        GPIO_PIN_10
#define BRIDGE_UART_RX_Port       GPIOA

/* --- USART2: R307 Fingerprint Sensor (PA2 TX, PA3 RX) --- */
#define FP_UART_TX_Pin            GPIO_PIN_2
#define FP_UART_TX_Port           GPIOA
#define FP_UART_RX_Pin            GPIO_PIN_3
#define FP_UART_RX_Port           GPIOA

/* --- I2C1: LCD PCF8574 Adapter (PB6 SCL, PB7 SDA) --- */
#define LCD_I2C_SCL_Pin           GPIO_PIN_6
#define LCD_I2C_SCL_Port          GPIOB
#define LCD_I2C_SDA_Pin           GPIO_PIN_7
#define LCD_I2C_SDA_Port          GPIOB

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

/**
 * @brief USART2 handle — R307 fingerprint sensor (PA2 TX / PA3 RX).
 * Bridge communication is done via USB CDC (CDC_Transmit_FS), not USART1.
 */
#define FP_UART                   huart2

/** @brief I2C1 handle — 16x2 LCD PCF8574 adapter (PB6 SCL / PB7 SDA) */
#define LCD_I2C                   hi2c1

extern UART_HandleTypeDef huart2;   /* R307 fingerprint sensor */
extern I2C_HandleTypeDef  hi2c1;    /* LCD PCF8574 adapter     */

/** @} */

/* ========================================================================== */
/*                              CONSTANTS                                     */
/* ========================================================================== */

/**
 * @defgroup Constants Application Constants
 * @brief Thresholds, timeouts, sizes, and I2C addresses.
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
/** Baud rate for both USART1 and USART2 */
#define UART_BAUD_RATE            57600

/* --- Packet Format --- */
/** Total UART auth packet size in bytes (device_id[4] + score[2] + timestamp[8] + crc16[2]) */
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

/* --- LCD (HD44780 via PCF8574 I2C) --- */
/** PCF8574 I2C slave address (7-bit: 0x27, shifted: 0x4E). Most common default. */
#define LCD_ADDR                  0x27
/** LCD I2C address left-shifted for HAL (HAL expects 8-bit address) */
#define LCD_ADDR_HAL              (LCD_ADDR << 1)
/** LCD display columns */
#define LCD_COLS                  16
/** LCD display rows */
#define LCD_ROWS                  2

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
/** @brief I2C1 initialisation (LCD) */
void MX_I2C1_Init(void);
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
