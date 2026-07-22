import { useState, useEffect, createContext, useContext } from "react"

export type Platform = "windows" | "macos" | "linux" | "unknown"

interface PlatformInfo {
  platform: Platform
  isWindows: boolean
  isMacOS: boolean
  isLinux: boolean
  isTauri: boolean
  isElectron: boolean
  modifierKey: "Ctrl" | "Cmd"
  modifierSymbol: string
  systemFont: string
  prefersReducedMotion: boolean
  prefersTransparency: boolean
  prefersContrast: "no-preference" | "more" | "less"
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent
  if (ua.includes("Windows NT") || ua.includes("Win64")) return "windows"
  if (ua.includes("Mac OS X") || ua.includes("Macintosh")) return "macos"
  if (ua.includes("Linux") || ua.includes("X11")) return "linux"
  return "unknown"
}

function detectTauri(): boolean {
  return !!(window as any).__TAURI__
}

function detectElectron(): boolean {
  return !!(window as any).electronAPI || !!(window as any).process?.versions?.electron
}

function detectPlatformInfo(): Omit<PlatformInfo, "prefersReducedMotion" | "prefersTransparency" | "prefersContrast"> {
  const platform = detectPlatform()
  const isTauri = detectTauri()
  const isElectron = detectElectron()
  return {
    platform,
    isWindows: platform === "windows",
    isMacOS: platform === "macos",
    isLinux: platform === "linux",
    isTauri,
    isElectron,
    modifierKey: platform === "macos" ? "Cmd" : "Ctrl",
    modifierSymbol: platform === "macos" ? "⌘" : "Ctrl",
    systemFont: platform === "windows"
      ? "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif"
      : platform === "macos"
        ? "'-apple-system', 'SF Pro', 'SF Pro Text', system-ui, sans-serif"
        : "'Inter Variable', system-ui, sans-serif",
  }
}

const PlatformContext = createContext<PlatformInfo>({
  platform: "unknown",
  isWindows: false,
  isMacOS: false,
  isLinux: false,
  isTauri: false,
  isElectron: false,
  modifierKey: "Ctrl",
  modifierSymbol: "Ctrl",
  systemFont: "'Inter Variable', system-ui, sans-serif",
  prefersReducedMotion: false,
  prefersTransparency: false,
  prefersContrast: "no-preference",
})

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<PlatformInfo>(() => ({
    ...detectPlatformInfo(),
    prefersReducedMotion: false,
    prefersTransparency: false,
    prefersContrast: "no-preference",
  }))

  useEffect(() => {
    const base = detectPlatformInfo()

    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)")
    const transparencyMedia = window.matchMedia("(prefers-reduced-transparency: reduce)")
    const contrastMedia = window.matchMedia("(prefers-contrast: more)")

    const update = () => {
      setInfo({
        ...base,
        prefersReducedMotion: motionMedia.matches,
        prefersTransparency: transparencyMedia.matches,
        prefersContrast: contrastMedia.matches ? "more" : "no-preference",
      })
    }

    update()

    motionMedia.addEventListener("change", update)
    transparencyMedia.addEventListener("change", update)
    contrastMedia.addEventListener("change", update)

    return () => {
      motionMedia.removeEventListener("change", update)
      transparencyMedia.removeEventListener("change", update)
      contrastMedia.removeEventListener("change", update)
    }
  }, [])

  return (
    <PlatformContext.Provider value={info}>
      {children}
    </PlatformContext.Provider>
  )
}

export function usePlatform(): PlatformInfo {
  return useContext(PlatformContext)
}
