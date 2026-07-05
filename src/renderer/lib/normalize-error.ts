/**
 * normalizeError — ensures user-facing error messages are never "undefined", "[object Object]", or empty.
 *
 * Re-exports the canonical implementation from @agentic-os/shared so all call sites
 * across main, renderer, and provider packages resolve to a single utility.
 */
export { normalizeError } from "@agentic-os/shared"

/**
 * Safe error message for tool results — never shows "undefined".
 */
export function toolErrorMessage(err: unknown, toolName: string): string {
  const msg = normalizeError(err, `${toolName} failed`)
  return msg.startsWith(`${toolName} failed`) ? msg : `${toolName} failed: ${msg}`
}
