/**
 * @file    lcd.c
 * @brief   ILI9341 2.8" TFT SPI display driver implementation.
 * @details Full-color 240x320 display via SPI1 at 18MHz. Renders text using
 *          an embedded 5x7 pixel font scaled 2x (12x16 effective char size).
 *          Provides the same API as the old HD44780 driver so main.c is unchanged.
 */

#include "lcd.h"
#include "main.h"
#include <string.h>

/* ========================================================================== */
/*                           5x7 ASCII FONT                                   */
/* ========================================================================== */
/*
 * Standard 5x7 pixel font, ASCII 32-126 (95 printable characters).
 * Each character is 5 bytes; each byte is a column, LSB = top pixel.
 * Total: 95 × 5 = 475 bytes in Flash.
 */
static const uint8_t font5x7[][5] = {
    {0x00,0x00,0x00,0x00,0x00}, /*   (32) */
    {0x00,0x00,0x5F,0x00,0x00}, /* ! (33) */
    {0x00,0x07,0x00,0x07,0x00}, /* " (34) */
    {0x14,0x7F,0x14,0x7F,0x14}, /* # (35) */
    {0x24,0x2A,0x7F,0x2A,0x12}, /* $ (36) */
    {0x23,0x13,0x08,0x64,0x62}, /* % (37) */
    {0x36,0x49,0x55,0x22,0x50}, /* & (38) */
    {0x00,0x05,0x03,0x00,0x00}, /* ' (39) */
    {0x00,0x1C,0x22,0x41,0x00}, /* ( (40) */
    {0x00,0x41,0x22,0x1C,0x00}, /* ) (41) */
    {0x14,0x08,0x3E,0x08,0x14}, /* * (42) */
    {0x08,0x08,0x3E,0x08,0x08}, /* + (43) */
    {0x00,0x50,0x30,0x00,0x00}, /* , (44) */
    {0x08,0x08,0x08,0x08,0x08}, /* - (45) */
    {0x00,0x60,0x60,0x00,0x00}, /* . (46) */
    {0x20,0x10,0x08,0x04,0x02}, /* / (47) */
    {0x3E,0x51,0x49,0x45,0x3E}, /* 0 (48) */
    {0x00,0x42,0x7F,0x40,0x00}, /* 1 (49) */
    {0x42,0x61,0x51,0x49,0x46}, /* 2 (50) */
    {0x21,0x41,0x45,0x4B,0x31}, /* 3 (51) */
    {0x18,0x14,0x12,0x7F,0x10}, /* 4 (52) */
    {0x27,0x45,0x45,0x45,0x39}, /* 5 (53) */
    {0x3C,0x4A,0x49,0x49,0x30}, /* 6 (54) */
    {0x01,0x71,0x09,0x05,0x03}, /* 7 (55) */
    {0x36,0x49,0x49,0x49,0x36}, /* 8 (56) */
    {0x06,0x49,0x49,0x29,0x1E}, /* 9 (57) */
    {0x00,0x36,0x36,0x00,0x00}, /* : (58) */
    {0x00,0x56,0x36,0x00,0x00}, /* ; (59) */
    {0x08,0x14,0x22,0x41,0x00}, /* < (60) */
    {0x14,0x14,0x14,0x14,0x14}, /* = (61) */
    {0x00,0x41,0x22,0x14,0x08}, /* > (62) */
    {0x02,0x01,0x51,0x09,0x06}, /* ? (63) */
    {0x32,0x49,0x79,0x41,0x3E}, /* @ (64) */
    {0x7E,0x11,0x11,0x11,0x7E}, /* A (65) */
    {0x7F,0x49,0x49,0x49,0x36}, /* B (66) */
    {0x3E,0x41,0x41,0x41,0x22}, /* C (67) */
    {0x7F,0x41,0x41,0x22,0x1C}, /* D (68) */
    {0x7F,0x49,0x49,0x49,0x41}, /* E (69) */
    {0x7F,0x09,0x09,0x09,0x01}, /* F (70) */
    {0x3E,0x41,0x49,0x49,0x7A}, /* G (71) */
    {0x7F,0x08,0x08,0x08,0x7F}, /* H (72) */
    {0x00,0x41,0x7F,0x41,0x00}, /* I (73) */
    {0x20,0x40,0x41,0x3F,0x01}, /* J (74) */
    {0x7F,0x08,0x14,0x22,0x41}, /* K (75) */
    {0x7F,0x40,0x40,0x40,0x40}, /* L (76) */
    {0x7F,0x02,0x0C,0x02,0x7F}, /* M (77) */
    {0x7F,0x04,0x08,0x10,0x7F}, /* N (78) */
    {0x3E,0x41,0x41,0x41,0x3E}, /* O (79) */
    {0x7F,0x09,0x09,0x09,0x06}, /* P (80) */
    {0x3E,0x41,0x51,0x21,0x5E}, /* Q (81) */
    {0x7F,0x09,0x19,0x29,0x46}, /* R (82) */
    {0x46,0x49,0x49,0x49,0x31}, /* S (83) */
    {0x01,0x01,0x7F,0x01,0x01}, /* T (84) */
    {0x3F,0x40,0x40,0x40,0x3F}, /* U (85) */
    {0x1F,0x20,0x40,0x20,0x1F}, /* V (86) */
    {0x3F,0x40,0x38,0x40,0x3F}, /* W (87) */
    {0x63,0x14,0x08,0x14,0x63}, /* X (88) */
    {0x07,0x08,0x70,0x08,0x07}, /* Y (89) */
    {0x61,0x51,0x49,0x45,0x43}, /* Z (90) */
    {0x00,0x7F,0x41,0x41,0x00}, /* [ (91) */
    {0x02,0x04,0x08,0x10,0x20}, /* \ (92) */
    {0x00,0x41,0x41,0x7F,0x00}, /* ] (93) */
    {0x04,0x02,0x01,0x02,0x04}, /* ^ (94) */
    {0x40,0x40,0x40,0x40,0x40}, /* _ (95) */
    {0x00,0x01,0x02,0x04,0x00}, /* ` (96) */
    {0x20,0x54,0x54,0x54,0x78}, /* a (97) */
    {0x7F,0x48,0x44,0x44,0x38}, /* b (98) */
    {0x38,0x44,0x44,0x44,0x20}, /* c (99) */
    {0x38,0x44,0x44,0x48,0x7F}, /* d (100)*/
    {0x38,0x54,0x54,0x54,0x18}, /* e (101)*/
    {0x08,0x7E,0x09,0x01,0x02}, /* f (102)*/
    {0x0C,0x52,0x52,0x52,0x3E}, /* g (103)*/
    {0x7F,0x08,0x04,0x04,0x78}, /* h (104)*/
    {0x00,0x44,0x7D,0x40,0x00}, /* i (105)*/
    {0x20,0x40,0x44,0x3D,0x00}, /* j (106)*/
    {0x7F,0x10,0x28,0x44,0x00}, /* k (107)*/
    {0x00,0x41,0x7F,0x40,0x00}, /* l (108)*/
    {0x7C,0x04,0x18,0x04,0x78}, /* m (109)*/
    {0x7C,0x08,0x04,0x04,0x78}, /* n (110)*/
    {0x38,0x44,0x44,0x44,0x38}, /* o (111)*/
    {0x7C,0x14,0x14,0x14,0x08}, /* p (112)*/
    {0x08,0x14,0x14,0x18,0x7C}, /* q (113)*/
    {0x7C,0x08,0x04,0x04,0x08}, /* r (114)*/
    {0x48,0x54,0x54,0x54,0x20}, /* s (115)*/
    {0x04,0x3F,0x44,0x40,0x20}, /* t (116)*/
    {0x3C,0x40,0x40,0x20,0x7C}, /* u (117)*/
    {0x1C,0x20,0x40,0x20,0x1C}, /* v (118)*/
    {0x3C,0x40,0x30,0x40,0x3C}, /* w (119)*/
    {0x44,0x28,0x10,0x28,0x44}, /* x (120)*/
    {0x0C,0x50,0x50,0x50,0x3C}, /* y (121)*/
    {0x44,0x64,0x54,0x4C,0x44}, /* z (122)*/
    {0x00,0x08,0x36,0x41,0x00}, /* { (123)*/
    {0x00,0x00,0x7F,0x00,0x00}, /* | (124)*/
    {0x00,0x41,0x36,0x08,0x00}, /* } (125)*/
    {0x10,0x08,0x08,0x10,0x08}, /* ~ (126)*/
};

/* ========================================================================== */
/*                           PRIVATE STATE                                    */
/* ========================================================================== */

static uint16_t text_fg = COLOR_WHITE;
static uint16_t text_bg = COLOR_DARK_BG;
static uint8_t  cursor_row = 0;
static uint8_t  cursor_col = 0;

/* ========================================================================== */
/*                       PRIVATE SPI HELPERS                                  */
/* ========================================================================== */

/** @brief Send a single command byte (DC=0). */
static void lcd_write_cmd(uint8_t cmd)
{
    TFT_DC_CMD();
    TFT_CS_LOW();
    HAL_SPI_Transmit(&LCD_SPI, &cmd, 1, HAL_MAX_DELAY);
    TFT_CS_HIGH();
}

/** @brief Send a single data byte (DC=1). */
static void lcd_write_data(uint8_t data)
{
    TFT_DC_DATA();
    TFT_CS_LOW();
    HAL_SPI_Transmit(&LCD_SPI, &data, 1, HAL_MAX_DELAY);
    TFT_CS_HIGH();
}

/** @brief Send multiple data bytes (DC=1). */
static void lcd_write_data_multi(const uint8_t *data, uint16_t len)
{
    TFT_DC_DATA();
    TFT_CS_LOW();
    HAL_SPI_Transmit(&LCD_SPI, (uint8_t *)data, len, HAL_MAX_DELAY);
    TFT_CS_HIGH();
}

/** @brief Set the active drawing window (column and page range). */
static void lcd_set_window(uint16_t x0, uint16_t y0, uint16_t x1, uint16_t y1)
{
    uint8_t data[4];

    lcd_write_cmd(ILI9341_CASET);
    data[0] = (uint8_t)(x0 >> 8); data[1] = (uint8_t)(x0 & 0xFF);
    data[2] = (uint8_t)(x1 >> 8); data[3] = (uint8_t)(x1 & 0xFF);
    lcd_write_data_multi(data, 4);

    lcd_write_cmd(ILI9341_PASET);
    data[0] = (uint8_t)(y0 >> 8); data[1] = (uint8_t)(y0 & 0xFF);
    data[2] = (uint8_t)(y1 >> 8); data[3] = (uint8_t)(y1 & 0xFF);
    lcd_write_data_multi(data, 4);

    lcd_write_cmd(ILI9341_RAMWR);
}

/* ========================================================================== */
/*                          PUBLIC API                                        */
/* ========================================================================== */

void lcd_init(void)
{
    /* Hardware reset */
    TFT_RST_HIGH();
    HAL_Delay(5);
    TFT_RST_LOW();
    HAL_Delay(20);
    TFT_RST_HIGH();
    HAL_Delay(150);

    /* Software reset */
    lcd_write_cmd(ILI9341_SWRESET);
    HAL_Delay(150);

    /* Power Control A */
    lcd_write_cmd(0xCB);
    { uint8_t d[] = {0x39,0x2C,0x00,0x34,0x02}; lcd_write_data_multi(d, 5); }

    /* Power Control B */
    lcd_write_cmd(0xCF);
    { uint8_t d[] = {0x00,0xC1,0x30}; lcd_write_data_multi(d, 3); }

    /* Driver Timing Control A */
    lcd_write_cmd(0xE8);
    { uint8_t d[] = {0x85,0x00,0x78}; lcd_write_data_multi(d, 3); }

    /* Driver Timing Control B */
    lcd_write_cmd(0xEA);
    { uint8_t d[] = {0x00,0x00}; lcd_write_data_multi(d, 2); }

    /* Power On Sequence Control */
    lcd_write_cmd(0xED);
    { uint8_t d[] = {0x64,0x03,0x12,0x81}; lcd_write_data_multi(d, 4); }

    /* Pump Ratio Control */
    lcd_write_cmd(0xF7);
    lcd_write_data(0x20);

    /* Power Control 1 */
    lcd_write_cmd(0xC0);
    lcd_write_data(0x23);

    /* Power Control 2 */
    lcd_write_cmd(0xC1);
    lcd_write_data(0x10);

    /* VCOM Control 1 */
    lcd_write_cmd(0xC5);
    { uint8_t d[] = {0x3E,0x28}; lcd_write_data_multi(d, 2); }

    /* VCOM Control 2 */
    lcd_write_cmd(0xC7);
    lcd_write_data(0x86);

    /* Memory Access Control — portrait mode, RGB color order */
    lcd_write_cmd(ILI9341_MADCTL);
    lcd_write_data(0x48);

    /* Pixel Format — 16-bit RGB565 */
    lcd_write_cmd(ILI9341_PIXFMT);
    lcd_write_data(0x55);

    /* Frame Rate Control */
    lcd_write_cmd(0xB1);
    { uint8_t d[] = {0x00,0x18}; lcd_write_data_multi(d, 2); }

    /* Display Function Control */
    lcd_write_cmd(0xB6);
    { uint8_t d[] = {0x08,0x82,0x27}; lcd_write_data_multi(d, 3); }

    /* Enable 3G — disable */
    lcd_write_cmd(0xF2);
    lcd_write_data(0x00);

    /* Gamma Set */
    lcd_write_cmd(0x26);
    lcd_write_data(0x01);

    /* Positive Gamma Correction */
    lcd_write_cmd(0xE0);
    { uint8_t d[] = {0x0F,0x31,0x2B,0x0C,0x0E,0x08,0x4E,0xF1,
                     0x37,0x07,0x10,0x03,0x0E,0x09,0x00};
      lcd_write_data_multi(d, 15); }

    /* Negative Gamma Correction */
    lcd_write_cmd(0xE1);
    { uint8_t d[] = {0x00,0x0E,0x14,0x03,0x11,0x07,0x31,0xC1,
                     0x48,0x08,0x0F,0x0C,0x31,0x36,0x0F};
      lcd_write_data_multi(d, 15); }

    /* Sleep Out */
    lcd_write_cmd(ILI9341_SLPOUT);
    HAL_Delay(120);

    /* Display On */
    lcd_write_cmd(ILI9341_DISPON);
    HAL_Delay(50);

    /* Clear to background color */
    lcd_clear();
}

void lcd_fill_rect(uint16_t x, uint16_t y, uint16_t w, uint16_t h, uint16_t color)
{
    uint8_t row_buf[TFT_WIDTH * 2];  /* max one row of pixels (480 bytes) */
    uint16_t row_pixels;
    uint16_t i;

    if (x >= TFT_WIDTH || y >= TFT_HEIGHT) return;
    if (x + w > TFT_WIDTH)  w = TFT_WIDTH - x;
    if (y + h > TFT_HEIGHT) h = TFT_HEIGHT - y;

    /* Pre-fill one row of color data (big-endian RGB565) */
    row_pixels = w;
    for (i = 0; i < row_pixels; i++) {
        row_buf[i * 2]     = (uint8_t)(color >> 8);
        row_buf[i * 2 + 1] = (uint8_t)(color & 0xFF);
    }

    lcd_set_window(x, y, x + w - 1, y + h - 1);

    TFT_DC_DATA();
    TFT_CS_LOW();
    for (i = 0; i < h; i++) {
        HAL_SPI_Transmit(&LCD_SPI, row_buf, row_pixels * 2, HAL_MAX_DELAY);
    }
    TFT_CS_HIGH();
}

void lcd_clear(void)
{
    lcd_fill_rect(0, 0, TFT_WIDTH, TFT_HEIGHT, text_bg);
    cursor_row = 0;
    cursor_col = 0;
}

void lcd_set_cursor(uint8_t row, uint8_t col)
{
    if (row >= TOTAL_LINES) row = TOTAL_LINES - 1;
    if (col >= CHARS_PER_LINE) col = CHARS_PER_LINE - 1;
    cursor_row = row;
    cursor_col = col;
}

/**
 * @brief  Draw a single character at pixel position (px, py) with scaling.
 */
static void lcd_draw_char(uint16_t px, uint16_t py, char ch)
{
    uint8_t col_data;
    uint8_t pixel_buf[CHAR_W * CHAR_H * 2];  /* 12*16*2 = 384 bytes */
    uint16_t buf_idx = 0;
    uint8_t fx, fy, sx, sy;
    uint16_t color;

    if (ch < 32 || ch > 126) ch = '?';

    /* Build the character bitmap into pixel_buf (row by row for SPI) */
    for (fy = 0; fy < FONT_H; fy++) {
        for (sy = 0; sy < FONT_SCALE; sy++) {
            for (fx = 0; fx < FONT_W; fx++) {
                col_data = font5x7[ch - 32][fx];
                color = (col_data & (1 << fy)) ? text_fg : text_bg;
                for (sx = 0; sx < FONT_SCALE; sx++) {
                    pixel_buf[buf_idx++] = (uint8_t)(color >> 8);
                    pixel_buf[buf_idx++] = (uint8_t)(color & 0xFF);
                }
            }
            /* Inter-character spacing column (background) */
            for (sx = 0; sx < FONT_SCALE; sx++) {
                pixel_buf[buf_idx++] = (uint8_t)(text_bg >> 8);
                pixel_buf[buf_idx++] = (uint8_t)(text_bg & 0xFF);
            }
        }
    }
    /* Inter-line spacing rows (background) */
    for (sy = 0; sy < FONT_SCALE; sy++) {
        for (fx = 0; fx < CHAR_W; fx++) {
            pixel_buf[buf_idx++] = (uint8_t)(text_bg >> 8);
            pixel_buf[buf_idx++] = (uint8_t)(text_bg & 0xFF);
        }
    }

    /* Blast the character to the display */
    lcd_set_window(px, py, px + CHAR_W - 1, py + CHAR_H - 1);
    TFT_DC_DATA();
    TFT_CS_LOW();
    HAL_SPI_Transmit(&LCD_SPI, pixel_buf, buf_idx, HAL_MAX_DELAY);
    TFT_CS_HIGH();
}

void lcd_print(const char *str)
{
    if (str == NULL) return;

    while (*str) {
        if (cursor_col >= CHARS_PER_LINE) {
            cursor_col = 0;
            cursor_row++;
            if (cursor_row >= TOTAL_LINES) cursor_row = 0;
        }
        lcd_draw_char(cursor_col * CHAR_W, cursor_row * CHAR_H, *str);
        cursor_col++;
        str++;
    }
}

void lcd_print_line(uint8_t row, const char *str)
{
    if (row >= TOTAL_LINES) row = TOTAL_LINES - 1;

    /* Clear the entire row with background color */
    lcd_fill_rect(0, row * CHAR_H, TFT_WIDTH, CHAR_H, text_bg);

    /* Center the text horizontally */
    uint8_t len = 0;
    if (str != NULL) {
        len = (uint8_t)strlen(str);
        if (len > CHARS_PER_LINE) len = CHARS_PER_LINE;
    }

    uint8_t start_col = (CHARS_PER_LINE - len) / 2;
    cursor_row = row;
    cursor_col = start_col;

    if (str != NULL) {
        uint8_t i;
        for (i = 0; i < len; i++) {
            lcd_draw_char(cursor_col * CHAR_W, cursor_row * CHAR_H, str[i]);
            cursor_col++;
        }
    }
}

void lcd_set_colors(uint16_t fg, uint16_t bg)
{
    text_fg = fg;
    text_bg = bg;
}

void lcd_backlight(uint8_t on)
{
    /* LED pin is wired directly to 3.3V — always on.
     * If connected to a GPIO, toggle it here. */
    (void)on;
}
