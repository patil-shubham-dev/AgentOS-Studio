export { cn } from "./types"

/**
 * normalizeError — ensures user-facing error messages are never "undefined",
 * "[object Object]", or empty. Shared utility used across renderer and provider packages.
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
