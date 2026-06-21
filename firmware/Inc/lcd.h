/**
 * @file    lcd.h
 * @brief   HD44780 16x2 LCD driver over I2C PCF8574 adapter.
 * @details Implements 4-bit mode communication with HD44780 LCD controller
 *          through a PCF8574 I2C I/O expander.
 *
 * PCF8574 Pin Mapping:
 *   P0 = RS  (Register Select: 0=command, 1=data)
 *   P1 = RW  (Read/Write: always 0=write)
 *   P2 = EN  (Enable: pulse high→low to latch)
 *   P3 = BL  (Backlight: 1=on, 0=off)
 *   P4 = D4  (LCD data bit 4)
 *   P5 = D5  (LCD data bit 5)
 *   P6 = D6  (LCD data bit 6)
 *   P7 = D7  (LCD data bit 7)
 *
 * HD44780 Row Addresses:
 *   Row 0: 0x00 (columns 0–15)
 *   Row 1: 0x40 (columns 0–15)
 */

#ifndef __LCD_H
#define __LCD_H

#ifdef __cplusplus
extern "C" {
#endif

#include "stm32f1xx_hal.h"
#include <stdint.h>

/* ========================================================================== */
/*                         PCF8574 BIT DEFINITIONS                            */
/* ========================================================================== */

#define LCD_BIT_RS                0x01  /**< P0: Register Select */
#define LCD_BIT_RW                0x02  /**< P1: Read/Write (always 0) */
#define LCD_BIT_EN                0x04  /**< P2: Enable strobe */
#define LCD_BIT_BL                0x08  /**< P3: Backlight control */

/* ========================================================================== */
/*                        HD44780 COMMAND BYTES                               */
/* ========================================================================== */

#define LCD_CMD_CLEAR             0x01  /**< Clear display */
#define LCD_CMD_HOME              0x02  /**< Return cursor to home */
#define LCD_CMD_ENTRY_MODE        0x06  /**< Entry mode: increment, no shift */
#define LCD_CMD_DISPLAY_ON        0x0C  /**< Display ON, cursor OFF, blink OFF */
#define LCD_CMD_DISPLAY_OFF       0x08  /**< Display OFF */
#define LCD_CMD_FUNCTION_SET_4BIT 0x28  /**< 4-bit mode, 2 lines, 5x8 font */
#define LCD_CMD_SET_DDRAM         0x80  /**< Set DDRAM address (OR with address) */

/* HD44780 row start addresses */
#define LCD_ROW0_ADDR             0x00
#define LCD_ROW1_ADDR             0x40

/* ========================================================================== */
/*                          PUBLIC API FUNCTIONS                              */
/* ========================================================================== */

/**
 * @brief  Initialise the 16x2 LCD via I2C PCF8574 adapter.
 *
 * Performs the full HD44780 4-bit initialisation sequence:
 *   1. Wait >40ms after power-on
 *   2. Function set (8-bit) x3 for reliable mode entry
 *   3. Switch to 4-bit mode
 *   4. Configure: 2-line, 5x8 font
 *   5. Display ON, cursor OFF
 *   6. Clear display
 *   7. Entry mode: increment, no shift
 *
 * @note Uses the global hi2c1 handle and LCD_ADDR_HAL from main.h.
 */
void lcd_init(void);

/**
 * @brief  Clear the entire LCD display and return cursor to position (0,0).
 * @note   This command takes ~1.64ms to execute on the HD44780.
 */
void lcd_clear(void);

/**
 * @brief  Set the cursor position on the LCD.
 * @param  row  Row number: 0 = top row, 1 = bottom row. Values > 1 are clamped.
 * @param  col  Column number: 0–15. Values > 15 are clamped.
 */
void lcd_set_cursor(uint8_t row, uint8_t col);

/**
 * @brief  Print a null-terminated string starting at the current cursor position.
 * @param  str  String to display. Characters beyond column 15 are silently dropped.
 *              NULL pointer is safely ignored.
 */
void lcd_print(const char *str);

/**
 * @brief  Print a string on a specific row, padding with spaces to clear the row.
 * @param  row  Row number: 0 = top, 1 = bottom.
 * @param  str  String to display. Truncated to 16 characters. NULL-safe.
 */
void lcd_print_line(uint8_t row, const char *str);

/**
 * @brief  Turn the LCD backlight on or off.
 * @param  on  true = backlight on, false = backlight off.
 */
void lcd_backlight(uint8_t on);

#ifdef __cplusplus
}
#endif

#endif /* __LCD_H */
