import { useState, useEffect, useCallback } from "react"

type Theme = "dark" | "warm"
const STORAGE_KEY = "aos-theme"

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "warm") return "warm"
  } catch { /* localStorage unavailable */ }
  return "dark"
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.remove("theme-dark", "theme-warm")
  document.documentElement.classList.add(`theme-${theme}`)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch { /* quota exceeded */ }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((t) => (t === "dark" ? "warm" : "dark"))
  }, [])

  return { theme, setTheme, toggle }
}
