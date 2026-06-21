/**
 * @file    buzzer.h
 * @brief   Piezo buzzer driver for audio feedback on PB12.
 * @details Provides success/fail buzzer patterns for biometric authentication feedback.
 *
 * Patterns:
 *   - Success: 2 short beeps (100ms on, 100ms off, 100ms on)
 *   - Fail:    1 long beep (500ms on)
 */

#ifndef __BUZZER_H
#define __BUZZER_H

#ifdef __cplusplus
extern "C" {
#endif

#include "stm32f1xx_hal.h"

/**
 * @brief  Play the success buzzer pattern.
 *
 * Two short beeps: 100ms ON → 100ms OFF → 100ms ON.
 * Indicates successful fingerprint authentication or ACK received.
 *
 * @note Blocks for ~300ms total.
 */
void buzzer_success(void);

/**
 * @brief  Play the failure buzzer pattern.
 *
 * One long beep: 500ms ON.
 * Indicates authentication failure, communication error, or sensor error.
 *
 * @note Blocks for ~500ms total.
 */
void buzzer_fail(void);

/**
 * @brief  Turn the buzzer on (active high).
 */
void buzzer_on(void);

/**
 * @brief  Turn the buzzer off.
 */
void buzzer_off(void);

#ifdef __cplusplus
}
#endif

#endif /* __BUZZER_H */
