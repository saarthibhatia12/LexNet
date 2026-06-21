/**
 * @file    lcd.c
 * @brief   HD44780 16x2 LCD driver over I2C PCF8574 adapter.
 * @details Implements 4-bit mode HD44780 communication through the PCF8574
 *          I2C I/O expander. Each write to the LCD requires two I2C
 *          transactions (high nibble, low nibble), each with an enable pulse.
 *
 * Timing requirements (HD44780 datasheet):
 *   - Enable pulse width:  ≥450ns (we use HAL delays, far exceeding this)
 *   - Clear/Home commands: ≥1.52ms execution time
 *   - Other commands/data: ≥37µs execution time
 */

#include "lcd.h"
#include "main.h"
#include <string.h>

/* ========================================================================== */
/*                           PRIVATE STATE                                    */
/* ========================================================================== */

/** Current backlight state bit (OR'd into every I2C write) */
static uint8_t lcd_backlight_state = LCD_BIT_BL;

/* ========================================================================== */
/*                       PRIVATE I2C HELPERS                                  */
/* ========================================================================== */

/**
 * @brief  Write a single byte to the PCF8574 via I2C.
 * @param  data  The byte to write (P0–P7 pin states).
 * @return HAL_OK on success.
 */
static HAL_StatusTypeDef lcd_i2c_write(uint8_t data)
{
    return HAL_I2C_Master_Transmit(&LCD_I2C, LCD_ADDR_HAL, &data, 1, UART_TIMEOUT);
}

/**
 * @brief  Pulse the Enable (EN) pin high then low to latch data.
 * @param  data  Current PCF8574 output byte (data nibble + RS + BL).
 *
 * The EN pulse sequence:
 *   1. Set EN high (data | EN) — latches data on rising edge
 *   2. Brief delay for HD44780 to read
 *   3. Set EN low  (data & ~EN) — falling edge triggers execution
 *   4. Brief delay for command execution
 */
static void lcd_pulse_enable(uint8_t data)
{
    uint8_t en_high = data | LCD_BIT_EN;
    uint8_t en_low  = data & (uint8_t)(~LCD_BIT_EN);

    lcd_i2c_write(en_high);
    HAL_Delay(1);  /* EN pulse width — HD44780 needs ≥450ns, 1ms is safe */
    lcd_i2c_write(en_low);
    HAL_Delay(1);  /* Data execution time — most commands need ≥37µs */
}

/**
 * @brief  Send a 4-bit nibble to the LCD.
 * @param  nibble  Upper 4 bits contain the data to send (D7–D4 in bits 7–4).
 * @param  rs      Register select: 0 = command, LCD_BIT_RS = data.
 */
static void lcd_send_nibble(uint8_t nibble, uint8_t rs)
{
    /* PCF8574 output: D7-D4 in P7-P4, RS in P0, BL in P3 */
    uint8_t data = (nibble & 0xF0) | rs | lcd_backlight_state;
    lcd_pulse_enable(data);
}

/**
 * @brief  Send a full byte (as two nibbles) to the LCD.
 * @param  byte  The 8-bit value to send.
 * @param  rs    Register select: 0 = command, LCD_BIT_RS = data.
 */
static void lcd_send_byte(uint8_t byte, uint8_t rs)
{
    /* Send high nibble first, then low nibble */
    lcd_send_nibble(byte & 0xF0, rs);
    lcd_send_nibble((uint8_t)((byte << 4) & 0xF0), rs);
}

/**
 * @brief  Send a command byte to the LCD (RS = 0).
 * @param  cmd  HD44780 command byte.
 */
static void lcd_send_command(uint8_t cmd)
{
    lcd_send_byte(cmd, 0);
}

/**
 * @brief  Send a data byte (character) to the LCD (RS = 1).
 * @param  data  ASCII character to display.
 */
static void lcd_send_data(uint8_t data)
{
    lcd_send_byte(data, LCD_BIT_RS);
}

/* ========================================================================== */
/*                           PUBLIC API                                       */
/* ========================================================================== */

/**
 * @brief  Initialise the 16x2 LCD via I2C PCF8574.
 *
 * Follows the HD44780 datasheet initialisation sequence for 4-bit mode:
 *   1. Wait >40ms after Vcc rises to 4.5V (power-on delay)
 *   2. Send Function Set (0x30) three times for reliable mode entry
 *   3. Switch to 4-bit mode (0x20)
 *   4. Configure display parameters
 *   5. Clear and set entry mode
 */
void lcd_init(void)
{
    /* Power-on delay — HD44780 needs >40ms after Vcc reaches 4.5V */
    HAL_Delay(50);

    /* Initialise backlight ON */
    lcd_backlight_state = LCD_BIT_BL;
    lcd_i2c_write(lcd_backlight_state);
    HAL_Delay(10);

    /*
     * HD44780 initialisation sequence (datasheet Figure 24):
     * The LCD starts in an unknown state, so we send Function Set (8-bit)
     * three times to force it into a known 8-bit mode before switching to 4-bit.
     */

    /* Step 1: Function Set — 8-bit mode attempt #1 */
    lcd_send_nibble(0x30, 0);
    HAL_Delay(5);  /* Wait >4.1ms */

    /* Step 2: Function Set — 8-bit mode attempt #2 */
    lcd_send_nibble(0x30, 0);
    HAL_Delay(1);  /* Wait >100µs */

    /* Step 3: Function Set — 8-bit mode attempt #3 */
    lcd_send_nibble(0x30, 0);
    HAL_Delay(1);

    /* Step 4: Switch to 4-bit mode */
    lcd_send_nibble(0x20, 0);
    HAL_Delay(1);

    /* Now in 4-bit mode — can send full bytes as two nibbles */

    /* Function Set: 4-bit, 2-line, 5x8 font */
    lcd_send_command(LCD_CMD_FUNCTION_SET_4BIT);
    HAL_Delay(1);

    /* Display ON, cursor OFF, blink OFF */
    lcd_send_command(LCD_CMD_DISPLAY_ON);
    HAL_Delay(1);

    /* Clear display */
    lcd_send_command(LCD_CMD_CLEAR);
    HAL_Delay(2);  /* Clear command needs ≥1.52ms */

    /* Entry mode: increment cursor, no display shift */
    lcd_send_command(LCD_CMD_ENTRY_MODE);
    HAL_Delay(1);
}

void lcd_clear(void)
{
    lcd_send_command(LCD_CMD_CLEAR);
    HAL_Delay(2);  /* Clear takes ≥1.52ms */
}

void lcd_set_cursor(uint8_t row, uint8_t col)
{
    /* Clamp inputs */
    if (row > 1) row = 1;
    if (col > (LCD_COLS - 1)) col = LCD_COLS - 1;

    uint8_t addr = (row == 0) ? LCD_ROW0_ADDR : LCD_ROW1_ADDR;
    lcd_send_command(LCD_CMD_SET_DDRAM | (addr + col));
}

void lcd_print(const char *str)
{
    if (str == NULL) return;

    while (*str) {
        lcd_send_data((uint8_t)*str);
        str++;
    }
}

void lcd_print_line(uint8_t row, const char *str)
{
    char buffer[LCD_COLS + 1];

    if (row > 1) row = 1;

    /* Set cursor to start of the specified row */
    lcd_set_cursor(row, 0);

    /* Build a 16-character padded string (fills rest with spaces) */
    memset(buffer, ' ', LCD_COLS);
    buffer[LCD_COLS] = '\0';

    if (str != NULL) {
        uint8_t len = (uint8_t)strlen(str);
        if (len > LCD_COLS) len = LCD_COLS;
        memcpy(buffer, str, len);
    }

    /* Write the full 16 characters to clear any previous content */
    lcd_print(buffer);
}

void lcd_backlight(uint8_t on)
{
    lcd_backlight_state = on ? LCD_BIT_BL : 0x00;
    lcd_i2c_write(lcd_backlight_state);
}
