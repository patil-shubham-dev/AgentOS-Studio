import { getRecentCrashes, clearCrashLog } from './CrashLogger'

const SAFE_MODE_KEY = 'agentic-os-safe-mode'
const SAFE_MODE_TIMESTAMP_KEY = 'agentic-os-safe-mode-timestamp'
const CRASH_THRESHOLD = 4
const CRASH_WINDOW_MS = 60000
const SAFE_MODE_COOLDOWN_MS = 30000

export interface SafeModeState {
  enabled: boolean
  reason: string | null
  enteredAt: number | null
  features: {
    workspaceRestore: boolean
    panelRestore: boolean
    aiRuntime: boolean
    extensions: boolean
  }
}

const DEFAULT_FEATURES = {
  workspaceRestore: true,
  panelRestore: true,
  aiRuntime: true,
  extensions: true,
}

export function detectSafeMode(): SafeModeState {
  const recent = getRecentCrashes(CRASH_WINDOW_MS)
  const crashCount = recent.length

  let enabled = false
  let reason: string | null = null

  if (crashCount >= CRASH_THRESHOLD) {
    enabled = true
    reason = `${crashCount} crashes in ${CRASH_WINDOW_MS / 1000}s (threshold: ${CRASH_THRESHOLD})`
  }

  try {
    const stored = sessionStorage.getItem(SAFE_MODE_KEY)
    if (stored === 'true') {
      enabled = true
      reason = reason ?? 'manually enabled'
    }
  } catch (err) {
    console.warn("[SafeMode] Failed to read safe mode key:", err)
  }

  if (enabled) {
    try {
      sessionStorage.setItem(SAFE_MODE_KEY, 'true')
      sessionStorage.setItem(SAFE_MODE_TIMESTAMP_KEY, String(Date.now()))
    } catch (err) {
      console.warn("[SafeMode] Failed to persist safe mode state:", err)
    }
  }

  return {
    enabled,
    reason,
    enteredAt: enabled ? Date.now() : null,
    features: enabled
      ? {
          workspaceRestore: false,
          panelRestore: false,
          aiRuntime: false,
          extensions: false,
        }
      : { ...DEFAULT_FEATURES },
  }
}

export function enableSafeMode(reason: string): void {
  try {
    sessionStorage.setItem(SAFE_MODE_KEY, 'true')
    sessionStorage.setItem(SAFE_MODE_TIMESTAMP_KEY, String(Date.now()))
  } catch (err) {
    console.warn("[SafeMode] Failed to persist safe mode state:", err)
  }
  console.warn(`[SafeMode] Enabled: ${reason}`)
}

export function disableSafeMode(): void {
  try {
    sessionStorage.removeItem(SAFE_MODE_KEY)
    sessionStorage.removeItem(SAFE_MODE_TIMESTAMP_KEY)
  } catch (err) {
    console.warn("[SafeMode] Failed to clear safe mode keys:", err)
  }
  clearCrashLog()
  console.log('[SafeMode] Disabled — crash log cleared')
}

export function isInSafeMode(): boolean {
  try {
    const stored = sessionStorage.getItem(SAFE_MODE_KEY)
    if (stored !== 'true') return false

    const timestampStr = sessionStorage.getItem(SAFE_MODE_TIMESTAMP_KEY)
    if (timestampStr) {
      const elapsed = Date.now() - parseInt(timestampStr, 10)
      if (elapsed > SAFE_MODE_COOLDOWN_MS) {
        sessionStorage.removeItem(SAFE_MODE_KEY)
        sessionStorage.removeItem(SAFE_MODE_TIMESTAMP_KEY)
        console.log('[SafeMode] Cooldown expired — auto-exiting safe mode')
        return false
      }
    }
    return true
  } catch (err) {
    console.warn("[SafeMode] Failed to read safe mode session:", err)
    return false
  }
}
