/**
 * Haptic feedback utility for UI interactions.
 * Uses the Vibration API when available, with graceful fallback.
 * Integrates with the toast system for tactile + visual feedback.
 */

import { useToastStore } from "@/stores/toast-store"

export type HapticPattern = "light" | "medium" | "heavy" | "success" | "error" | "selection" | "click"

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 5,
  medium: 10,
  heavy: [10, 30, 10],
  success: [10, 50, 20],
  error: [30, 50, 30],
  selection: 8,
  click: 3,
}

/**
 * Trigger a haptic vibration pattern.
 * Gracefully degrades on unsupported environments (no-op).
 */
export function haptic(pattern: HapticPattern = "light"): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      const patternValue = PATTERNS[pattern]
      navigator.vibrate(patternValue)
    }
  } catch {
    // Vibration API not supported — silent fallback
  }
}

/**
 * Trigger a haptic feedback + toast notification combo.
 */
export function hapticToast(
  message: string,
  variant: "success" | "error" | "info" = "info",
  hapticPattern: HapticPattern = "light",
  duration = 3000,
): void {
  haptic(hapticPattern)
  useToastStore.getState().addToast(message, variant, duration)
}

/**
 * Haptic-enabled click handler wrapper.
 * Returns an onClick handler that triggers haptic feedback before calling the original handler.
 */
export function withHaptic<T extends (...args: unknown[]) => unknown>(
  handler: T,
  pattern: HapticPattern = "click",
): (event: React.MouseEvent | KeyboardEvent) => void {
  return (...args: unknown[]) => {
    haptic(pattern)
    handler(...args)
  }
}

/**
 * React hook for haptic feedback.
 * Use in components for convenient access.
 */
export function useHaptic() {
  const pulse = (pattern: HapticPattern = "light") => haptic(pattern)
  const notify = (
    message: string,
    variant: "success" | "error" | "info" = "info",
    hapticPattern: HapticPattern = "light",
    duration = 3000,
  ) => hapticToast(message, variant, hapticPattern, duration)

  return { pulse, notify }
}
