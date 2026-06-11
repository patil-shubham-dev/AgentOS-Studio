/**
 * normalizeError — ensures user-facing error messages are never "undefined", "[object Object]", or empty.
 *
 * Every catch block in the codebase should use this instead of:
 *   err instanceof Error ? err.message : String(err)
 *
 * Because String(undefined) → "undefined", String(null) → "null", String({}) → "[object Object]"
 */

export function normalizeError(err: unknown, fallback = "An unexpected error occurred"): string {
  if (err === undefined || err === null) return fallback

  if (err instanceof Error) {
    return err.message || fallback
  }

  if (typeof err === "string") {
    return err || fallback
  }

  if (typeof err === "object") {
    const msg = (err as any).message ?? (err as any).error ?? (err as any).toString?.()
    if (msg && typeof msg === "string" && msg.length > 0 && msg !== "[object Object]") {
      return msg
    }
  }

  const str = String(err)
  if (str === "[object Object]" || str === "undefined" || str === "null" || str === "") {
    return fallback
  }

  return str
}

/**
 * Safe error message for tool results — never shows "undefined".
 */
export function toolErrorMessage(err: unknown, toolName: string): string {
  const msg = normalizeError(err, `${toolName} failed`)
  return msg.startsWith(`${toolName} failed`) ? msg : `${toolName} failed: ${msg}`
}
