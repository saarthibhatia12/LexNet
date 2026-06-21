/**
 * @file    lcd.h
 * @brief   ILI9341 2.8" TFT SPI display driver (240x320, RGB565).
 * @details Replaces the HD44780 I2C LCD. Uses SPI1 (PA5/PA7) with GPIO
 *          control pins (PA4=CS, PB0=DC, PB1=RST). Provides the same
 *          public API (lcd_init, lcd_print_line, etc.) so main.c is unchanged.
 *
 * SPI Pin Mapping:
 *   PA5  = SPI1_SCK   → TFT SCK
 *   PA7  = SPI1_MOSI  → TFT SDI (MOSI)
 *   PA4  = TFT_CS     → TFT CS  (GPIO output, directly from STM32)
 *   PB0  = TFT_DC     → TFT DC/RS (GPIO output, 0=command, 1=data)
 *   PB1  = TFT_RST    → TFT RESET (GPIO output, active low)
 *   3.3V              → TFT LED  (backlight always on)
 */

#ifndef __LCD_H
#define __LCD_H

#ifdef __cplusplus
extern "C" {
#endif

#include "stm32f1xx_hal.h"
#include <stdint.h>

/* ========================================================================== */
/*                         TFT CONTROL PIN MACROS                             */
/* ========================================================================== */

#define TFT_CS_PIN       GPIO_PIN_4
#define TFT_CS_PORT      GPIOA
#define TFT_DC_PIN       GPIO_PIN_0
#define TFT_DC_PORT      GPIOB
#define TFT_RST_PIN      GPIO_PIN_1
#define TFT_RST_PORT     GPIOB

#define TFT_CS_LOW()     HAL_GPIO_WritePin(TFT_CS_PORT, TFT_CS_PIN, GPIO_PIN_RESET)
#define TFT_CS_HIGH()    HAL_GPIO_WritePin(TFT_CS_PORT, TFT_CS_PIN, GPIO_PIN_SET)
#define TFT_DC_CMD()     HAL_GPIO_WritePin(TFT_DC_PORT, TFT_DC_PIN, GPIO_PIN_RESET)
#define TFT_DC_DATA()    HAL_GPIO_WritePin(TFT_DC_PORT, TFT_DC_PIN, GPIO_PIN_SET)
#define TFT_RST_LOW()    HAL_GPIO_WritePin(TFT_RST_PORT, TFT_RST_PIN, GPIO_PIN_RESET)
#define TFT_RST_HIGH()   HAL_GPIO_WritePin(TFT_RST_PORT, TFT_RST_PIN, GPIO_PIN_SET)

/* ========================================================================== */
/*                         DISPLAY DIMENSIONS                                 */
/* ========================================================================== */

#define TFT_WIDTH        240
#define TFT_HEIGHT       320

/* ========================================================================== */
/*                         RGB565 COLOR DEFINITIONS                           */
/* ========================================================================== */

#define COLOR_BLACK      0x0000
#define COLOR_WHITE      0xFFFF
#define COLOR_RED        0xF800
#define COLOR_GREEN      0x07E0
#define COLOR_BLUE       0x001F
#define COLOR_YELLOW     0xFFE0
#define COLOR_CYAN       0x07FF
#define COLOR_DARK_BG    0x0011   /**< Deep navy background (#000822) */
#define COLOR_GREY       0x7BEF

/* ========================================================================== */
/*                      ILI9341 COMMAND DEFINITIONS                           */
/* ========================================================================== */

#define ILI9341_SWRESET  0x01
#define ILI9341_SLPOUT   0x11
#define ILI9341_DISPON   0x29
#define ILI9341_CASET    0x2A
#define ILI9341_PASET    0x2B
#define ILI9341_RAMWR    0x2C
#define ILI9341_MADCTL   0x36
#define ILI9341_PIXFMT   0x3A

/* ========================================================================== */
/*                          TEXT RENDERING CONFIG                             */
/* ========================================================================== */

/** Font scale factor (each font pixel becomes NxN screen pixels) */
#define FONT_SCALE       2
/** Base font dimensions (5x7 pixel font) */
#define FONT_W           5
#define FONT_H           7
/** Rendered character dimensions including spacing */
#define CHAR_W           ((FONT_W * FONT_SCALE) + FONT_SCALE)   /* 12px */
#define CHAR_H           ((FONT_H * FONT_SCALE) + FONT_SCALE)   /* 16px */
/** Characters per line and total lines */
#define CHARS_PER_LINE   (TFT_WIDTH / CHAR_W)   /* 20 */
#define TOTAL_LINES      (TFT_HEIGHT / CHAR_H)  /* 20 */

/* ========================================================================== */
/*                          PUBLIC API FUNCTIONS                              */
/* ========================================================================== */

/** @brief Initialise ILI9341 via SPI1 — full init sequence + clear to dark bg. */
void lcd_init(void);

/** @brief Clear the entire screen to the background color. */
void lcd_clear(void);

/** @brief Set cursor position in character grid. */
void lcd_set_cursor(uint8_t row, uint8_t col);

/** @brief Print string at current cursor position. */
void lcd_print(const char *str);

/** @brief Print string centered on a display row, clearing the row first. */
void lcd_print_line(uint8_t row, const char *str);

/** @brief Backlight control (currently always on — LED wired to 3.3V). */
void lcd_backlight(uint8_t on);

/** @brief Set text foreground and background colors. */
void lcd_set_colors(uint16_t fg, uint16_t bg);

/** @brief Fill a rectangular area with a solid color. */
void lcd_fill_rect(uint16_t x, uint16_t y, uint16_t w, uint16_t h, uint16_t color);

#ifdef __cplusplus
}
#endif

#endif /* __LCD_H */
