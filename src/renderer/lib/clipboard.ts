let tauriClipboard: typeof import("@tauri-apps/plugin-clipboard-manager") | null = null

async function getTauriClipboard() {
  if (!tauriClipboard) {
    try {
      tauriClipboard = await import("@tauri-apps/plugin-clipboard-manager")
    } catch {
      tauriClipboard = null
    }
  }
  return tauriClipboard
}

export async function copyToClipboard(text: string): Promise<boolean> {
  // Try Tauri clipboard plugin first (in desktop app)
  const tauri = await getTauriClipboard()
  if (tauri?.writeText) {
    try {
      await tauri.writeText(text)
      return true
    } catch {
      // fall through to web API
    }
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
