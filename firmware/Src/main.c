/**
 * @file    main.c
 * @brief   LexNet Firmware — Main application for STM32F103C8Tx (Blue Pill).
 * @details Initialises all peripherals and runs the biometric authentication
 *          super-loop:
 *
 *          1. LCD shows "Place Finger..."
 *          2. R307 captures fingerprint
 *          3. Match against stored templates
 *          4. If match (score >= SCORE_THRESHOLD):
 *             a. LCD shows "Auth OK" + score
 *             b. Build 16-byte auth packet
 *             c. Send via USART1 to Python bridge
 *             d. Wait for ACK
 *             e. Display result + buzzer feedback
 *          5. If no match:
 *             a. LCD shows "Auth FAIL"
 *             b. Buzzer fail pattern
 *          6. 500ms delay, repeat
 *
 * Error handling (Phase F5):
 *   - UART TX timeout → retry 3x, then "COMM ERROR"
 *   - Fingerprint sensor not responding → "SENSOR ERR" + infinite retry
 *   - Error_Handler() → infinite loop with buzzer_fail()
 *
 * Peripherals:
 *   - USART1 (PA9/PA10, 57600 8N1)  → Python hardware-bridge
 *   - USART2 (PA2/PA3, 57600 8N1)   → R307 fingerprint sensor
 *   - I2C1   (PB6/PB7, 100kHz)      → 16x2 LCD (PCF8574)
 *   - GPIO   (PB12)                  → Piezo buzzer
 */

#include "main.h"
#include "lcd.h"
#include "fingerprint.h"
#include "buzzer.h"
#include "uart_comm.h"
#include "crc16.h"
#include <stdio.h>

/* ========================================================================== */
/*                         HAL HANDLE DEFINITIONS                             */
/* ========================================================================== */

/** USART2 handle — R307 fingerprint sensor */
UART_HandleTypeDef huart2;

/** I2C1 handle — LCD PCF8574 adapter */
I2C_HandleTypeDef hi2c1;

/*
 * USB CDC handles are declared and managed entirely by the CubeMX-generated
 * middleware (USB_DEVICE/App/usbd_cdc_if.c, Middlewares/ST/STM32_USB_Device_Library).
 * No explicit handle definition is needed here.
 */

/* ========================================================================== */
/*                        PRIVATE HELPER FUNCTIONS                            */
/* ========================================================================== */

/**
 * @brief  Format a score value into a string buffer (e.g. "Score: 85").
 * @param  buf   Output buffer (must be >= 16 chars).
 * @param  score The fingerprint match score.
 */
static void format_score_line(char *buf, uint16_t score)
{
    /* Simple integer-to-string without sprintf to save Flash */
    uint16_t s = score;
    char digits[6];
    int i = 0;
    int j = 0;

    /* Copy prefix */
    const char *prefix = "Score: ";
    while (*prefix) {
        buf[j++] = *prefix++;
    }

    /* Convert score to digits */
    if (s == 0) {
        digits[i++] = '0';
    } else {
        while (s > 0 && i < 5) {
            digits[i++] = (char)('0' + (s % 10));
            s /= 10;
        }
    }

    /* Reverse digits into buffer */
    while (i > 0) {
        buf[j++] = digits[--i];
    }
    buf[j] = '\0';
}

/**
 * @brief  Display ACK result on LCD row 2 and play buzzer pattern.
 * @param  ack  The ACK byte received from the bridge.
 */
static void handle_ack_result(uint8_t ack)
{
    switch (ack) {
        case ACK_SUCCESS:
            lcd_print_line(1, "Bridge: OK");
            buzzer_success();
            break;

        case ACK_FAILURE:
            lcd_print_line(1, "Bridge: REJECT");
            buzzer_fail();
            break;

        case ACK_TIMEOUT:
        default:
            lcd_print_line(1, "Bridge: NO RESP");
            buzzer_fail();
            break;
    }
}

/**
 * @brief  Attempt fingerprint sensor initialisation with infinite retry.
 *
 * Phase F5 edge case: if the sensor is not responding (unplugged, power issue),
 * show "SENSOR ERR" on LCD and keep retrying indefinitely with 2-second intervals.
 * The device cannot proceed without a working fingerprint sensor.
 */
static void fp_init_with_retry(void)
{
    while (fp_init() != HAL_OK) {
        lcd_print_line(0, "SENSOR ERR");
        lcd_print_line(1, "Retrying...");
        buzzer_fail();
        HAL_Delay(2000);
    }
}

/**
 * @brief  Send auth packet with full error handling.
 *
 * Phase F5 edge cases:
 *   - UART TX failure → retry up to UART_MAX_RETRIES times (handled in send_auth_packet)
 *   - All retries exhausted → LCD shows "COMM ERROR"
 *
 * @param  score  Fingerprint match score to include in packet.
 * @return ACK byte from bridge, or ACK_TIMEOUT on send failure.
 */
static uint8_t send_and_get_ack(uint16_t score)
{
    HAL_StatusTypeDef status;

    status = send_auth_packet(score);

    if (status != HAL_OK) {
        /* All TX retries exhausted — Phase F5: show COMM ERROR */
        lcd_print_line(0, "Auth OK");
        lcd_print_line(1, "COMM ERROR");
        buzzer_fail();
        return ACK_TIMEOUT;
    }

    /* Packet sent successfully — wait for ACK */
    return receive_ack();
}

/* ========================================================================== */
/*                       HAL PERIPHERAL INIT FUNCTIONS                        */
/* ========================================================================== */

/**
 * @brief System Clock Configuration
 *
 * HSE 8MHz crystal → PLL x9 → 72MHz SYSCLK
 * APB1 = 36MHz (max for STM32F103, used by USART2, I2C1)
 * APB2 = 72MHz (used by USART1, GPIO)
 */
void SystemClock_Config(void)
{
    RCC_OscInitTypeDef RCC_OscInitStruct = {0};
    RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

    /* Configure HSE oscillator and PLL */
    RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSE;
    RCC_OscInitStruct.HSEState       = RCC_HSE_ON;
    RCC_OscInitStruct.HSEPredivValue = RCC_HSE_PREDIV_DIV1;
    RCC_OscInitStruct.PLL.PLLState   = RCC_PLL_ON;
    RCC_OscInitStruct.PLL.PLLSource  = RCC_PLLSOURCE_HSE;
    RCC_OscInitStruct.PLL.PLLMUL     = RCC_PLL_MUL9;

    if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK) {
        Error_Handler();
    }

    /* Configure system clock source and bus dividers */
    RCC_ClkInitStruct.ClockType      = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK
                                     | RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;
    RCC_ClkInitStruct.SYSCLKSource   = RCC_SYSCLKSOURCE_PLLCLK;
    RCC_ClkInitStruct.AHBCLKDivider  = RCC_SYSCLK_DIV1;
    RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV2;  /* APB1 max 36MHz */
    RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;  /* APB2 = 72MHz */

    if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_2) != HAL_OK) {
        Error_Handler();
    }
}

/**
 * @brief USART2 Initialization — R307 fingerprint sensor (PA2 TX, PA3 RX)
 */
void MX_USART2_UART_Init(void)
{
    huart2.Instance          = USART2;
    huart2.Init.BaudRate     = UART_BAUD_RATE;
    huart2.Init.WordLength   = UART_WORDLENGTH_8B;
    huart2.Init.StopBits     = UART_STOPBITS_1;
    huart2.Init.Parity       = UART_PARITY_NONE;
    huart2.Init.Mode         = UART_MODE_TX_RX;
    huart2.Init.HwFlowCtl    = UART_HWCONTROL_NONE;
    huart2.Init.OverSampling = UART_OVERSAMPLING_16;

    if (HAL_UART_Init(&huart2) != HAL_OK) {
        Error_Handler();
    }
}

/**
 * @brief I2C1 Initialization — LCD PCF8574 adapter (PB6 SCL, PB7 SDA)
 */
void MX_I2C1_Init(void)
{
    hi2c1.Instance             = I2C1;
    hi2c1.Init.ClockSpeed      = 100000;  /* 100kHz standard mode */
    hi2c1.Init.DutyCycle       = I2C_DUTYCYCLE_2;
    hi2c1.Init.OwnAddress1     = 0;
    hi2c1.Init.AddressingMode  = I2C_ADDRESSINGMODE_7BIT;
    hi2c1.Init.DualAddressMode = I2C_DUALADDRESS_DISABLE;
    hi2c1.Init.OwnAddress2     = 0;
    hi2c1.Init.GeneralCallMode = I2C_GENERALCALL_DISABLE;
    hi2c1.Init.NoStretchMode   = I2C_NOSTRETCH_DISABLE;

    if (HAL_I2C_Init(&hi2c1) != HAL_OK) {
        Error_Handler();
    }
}

/**
 * @brief GPIO Initialization — Buzzer on PB12 as push-pull output
 */
void MX_GPIO_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStruct = {0};

    /* Enable GPIO port clocks */
    __HAL_RCC_GPIOA_CLK_ENABLE();
    __HAL_RCC_GPIOB_CLK_ENABLE();
    __HAL_RCC_GPIOD_CLK_ENABLE();

    /* Configure PB12 as push-pull output for buzzer */
    GPIO_InitStruct.Pin   = BUZZER_PIN;
    GPIO_InitStruct.Mode  = GPIO_MODE_OUTPUT_PP;
    GPIO_InitStruct.Pull  = GPIO_NOPULL;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(BUZZER_PORT, &GPIO_InitStruct);

    /* Ensure buzzer starts OFF */
    HAL_GPIO_WritePin(BUZZER_PORT, BUZZER_PIN, GPIO_PIN_RESET);
}

/* ========================================================================== */
/*                         HAL MSP CALLBACKS                                  */
/* ========================================================================== */

/**
 * @brief  UART MSP Init — configures GPIO for USART2 (fingerprint sensor).
 *
 * Called automatically by HAL_UART_Init(). Configures:
 *   - USART2: PA2 (TX, AF push-pull), PA3 (RX, input floating)
 *
 * Note: USART1 is not used in this design. Bridge communication
 *       is handled by USB CDC (PA11/PA12, managed by USB middleware).
 */
void HAL_UART_MspInit(UART_HandleTypeDef *huart)
{
    GPIO_InitTypeDef GPIO_InitStruct = {0};

    if (huart->Instance == USART2) {
        /* Enable USART2 and GPIOA clocks */
        __HAL_RCC_USART2_CLK_ENABLE();
        __HAL_RCC_GPIOA_CLK_ENABLE();

        /* PA2 = USART2_TX (alternate function push-pull) */
        GPIO_InitStruct.Pin   = GPIO_PIN_2;
        GPIO_InitStruct.Mode  = GPIO_MODE_AF_PP;
        GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_HIGH;
        HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

        /* PA3 = USART2_RX (input floating) */
        GPIO_InitStruct.Pin  = GPIO_PIN_3;
        GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
        GPIO_InitStruct.Pull = GPIO_NOPULL;
        HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
    }
}

/**
 * @brief  I2C MSP Init — enables clocks and configures GPIO for I2C1.
 *
 * Called automatically by HAL_I2C_Init(). Configures:
 *   - PB6 = I2C1_SCL (alternate function open-drain)
 *   - PB7 = I2C1_SDA (alternate function open-drain)
 */
void HAL_I2C_MspInit(I2C_HandleTypeDef *hi2c)
{
    GPIO_InitTypeDef GPIO_InitStruct = {0};

    if (hi2c->Instance == I2C1) {
        /* Enable I2C1 and GPIOB clocks */
        __HAL_RCC_I2C1_CLK_ENABLE();
        __HAL_RCC_GPIOB_CLK_ENABLE();

        /* PB6 = I2C1_SCL, PB7 = I2C1_SDA (open-drain, required for I2C) */
        GPIO_InitStruct.Pin   = GPIO_PIN_6 | GPIO_PIN_7;
        GPIO_InitStruct.Mode  = GPIO_MODE_AF_OD;
        GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_HIGH;
        HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);
    }
}

/* ========================================================================== */
/*                           MAIN APPLICATION                                 */
/* ========================================================================== */

/**
 * @brief  Application entry point.
 *
 * Initialises all hardware peripherals, then enters the infinite
 * authentication super-loop.
 */
int main(void)
{
    HAL_StatusTypeDef fp_status;
    uint16_t score;
    uint8_t  ack;
    char     score_buf[17];  /* "Score: 300" + null + padding */

    /* ------------------------------------------------------------------ */
    /*                      HAL & Peripheral Init                          */
    /* ------------------------------------------------------------------ */

    HAL_Init();
    SystemClock_Config();

    /* Initialise GPIO first (buzzer pin) */
    MX_GPIO_Init();

    /* Initialise communication peripherals */
    MX_USART2_UART_Init();
    MX_I2C1_Init();

    /*
     * USB CDC is initialised by MX_USB_DEVICE_Init() which CubeMX generates
     * in USB_DEVICE/App/usb_device.c. Call it here after other peripherals.
     * This starts the USB enumeration — the laptop will detect the COM port.
     */
    MX_USB_DEVICE_Init();

    /* Initialise LCD display */
    lcd_init();
    lcd_print_line(0, "LexNet v1.0");
    lcd_print_line(1, "Initializing...");

    /* Initialise fingerprint sensor (Phase F5: infinite retry on failure) */
    fp_init_with_retry();

    /* Startup success indication */
    lcd_print_line(0, "LexNet Ready");
    lcd_print_line(1, "System OK");
    buzzer_success();
    HAL_Delay(1500);

    /* ------------------------------------------------------------------ */
    /*                      Authentication Super-Loop                      */
    /* ------------------------------------------------------------------ */

    while (1) {
        /* --- Step 1: Prompt user to place finger --- */
        lcd_print_line(0, "Place Finger...");
        lcd_print_line(1, "");

        /* --- Step 2: Capture fingerprint image --- */
        fp_status = fp_capture();

        if (fp_status == HAL_TIMEOUT) {
            /* No finger placed within timeout — just restart loop */
            lcd_print_line(0, "No Finger");
            lcd_print_line(1, "Try Again");
            HAL_Delay(1000);
            continue;
        }

        if (fp_status != HAL_OK) {
            /*
             * Phase F5: Sensor communication error during capture.
             * This could indicate the sensor was disconnected mid-operation.
             * Show error and attempt to re-initialise.
             */
            lcd_print_line(0, "SENSOR ERR");
            lcd_print_line(1, "Reconnecting...");
            buzzer_fail();
            HAL_Delay(1000);

            /* Attempt to re-initialise sensor */
            fp_init_with_retry();
            continue;
        }

        /* --- Step 3: Match against stored templates --- */
        lcd_print_line(0, "Processing...");
        lcd_print_line(1, "");

        fp_status = fp_match(&score);

        if (fp_status != HAL_OK) {
            /* No matching template found */
            lcd_print_line(0, "Auth FAIL");
            lcd_print_line(1, "No Match");
            buzzer_fail();
            HAL_Delay(2000);
            continue;
        }

        /* --- Step 4: Check score threshold --- */
        if (score < SCORE_THRESHOLD) {
            /* Match found but confidence too low */
            format_score_line(score_buf, score);
            lcd_print_line(0, "Auth FAIL");
            lcd_print_line(1, score_buf);
            buzzer_fail();
            HAL_Delay(2000);
            continue;
        }

        /* --- Step 5: Authentication successful — send to bridge --- */
        format_score_line(score_buf, score);
        lcd_print_line(0, "Auth OK");
        lcd_print_line(1, score_buf);

        /* Brief display before sending packet */
        HAL_Delay(500);

        /* --- Step 6: Build and send auth packet, get ACK --- */
        lcd_print_line(1, "Sending...");

        ack = send_and_get_ack(score);

        /* --- Step 7: Display ACK result + buzzer feedback --- */
        lcd_print_line(0, "Auth OK");
        handle_ack_result(ack);

        /* Hold result on display */
        HAL_Delay(3000);

        /* --- Step 8: Delay before next scan --- */
        HAL_Delay(SCAN_DELAY_MS);
    }
}

/* ========================================================================== */
/*                          ERROR HANDLER                                     */
/* ========================================================================== */

/**
 * @brief  Application error handler.
 *
 * Called on unrecoverable errors (HAL init failures, etc.).
 * Phase F5: Never returns — infinite loop with buzzer_fail() pattern
 * and "FATAL ERROR" on LCD.
 *
 * @note  In production, this would trigger a watchdog reset.
 */
void Error_Handler(void)
{
    /* Disable interrupts to prevent further damage */
    __disable_irq();

    /*
     * Attempt to display error on LCD.
     * This may fail if the I2C peripheral itself is the problem,
     * but it's worth trying.
     */
    lcd_print_line(0, "FATAL ERROR");
    lcd_print_line(1, "System Halted");

    /* Infinite loop with buzzer fail pattern — Phase F5 requirement */
    while (1) {
        buzzer_fail();
        HAL_Delay(2000);
    }
}

/* ========================================================================== */
/*                    HARD FAULT & ASSERT HANDLERS                            */
/* ========================================================================== */

/**
 * @brief  HardFault handler override.
 * @note   The default HardFault_Handler in startup_stm32f103xb.s is weak,
 *         so this overrides it.
 */
void HardFault_Handler(void)
{
    Error_Handler();
}

/**
 * @brief  HAL assertion failure callback (called by assert_param when DEBUG enabled).
 * @param  file  Source file name where assertion failed.
 * @param  line  Line number where assertion failed.
 */
#ifdef USE_FULL_ASSERT
void assert_failed(uint8_t *file, uint32_t line)
{
    (void)file;
    (void)line;
    Error_Handler();
}
#endif /* USE_FULL_ASSERT */
