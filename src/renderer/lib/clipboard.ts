export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const { clipboardWriteText } = await import("@/lib/electron-api")
    await clipboardWriteText(text)
    return true
  } catch {
    // fall through to web API
  }

  // Fall back to Web Clipboard API
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to last-resort
  }

  // Last resort: execCommand (deprecated but works everywhere)
  try {
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand("copy")
    document.body.removeChild(textarea)
    return true
  } catch {
    return false
  }
}
