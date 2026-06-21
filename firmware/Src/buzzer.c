/**
 * @file    buzzer.c
 * @brief   Piezo buzzer driver implementation for PB12.
 * @details Simple GPIO toggle with HAL_Delay for timing.
 *
 * Patterns:
 *   Success: ─█─ ─█─  (2x 100ms beep with 100ms gap)
 *   Fail:    ─████─   (1x 500ms beep)
 */

#include "buzzer.h"
#include "main.h"

/* ========================================================================== */
/*                          PUBLIC API                                        */
/* ========================================================================== */

void buzzer_on(void)
{
    HAL_GPIO_WritePin(BUZZER_PORT, BUZZER_PIN, GPIO_PIN_SET);
}

void buzzer_off(void)
{
    HAL_GPIO_WritePin(BUZZER_PORT, BUZZER_PIN, GPIO_PIN_RESET);
}

void buzzer_success(void)
{
    /* Beep 1: 100ms on */
    buzzer_on();
    HAL_Delay(100);
    buzzer_off();

    /* Gap: 100ms off */
    HAL_Delay(100);

    /* Beep 2: 100ms on */
    buzzer_on();
    HAL_Delay(100);
    buzzer_off();
}

void buzzer_fail(void)
{
    /* Single long beep: 500ms on */
    buzzer_on();
    HAL_Delay(500);
    buzzer_off();
}
