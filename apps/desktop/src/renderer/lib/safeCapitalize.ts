export function safeCapitalize(value?: string | null, fallback = "Unknown"): string {
  if (!value || typeof value !== "string") {
    return fallback
  }
  return value.charAt(0).toUpperCase() + value.slice(1)
}
