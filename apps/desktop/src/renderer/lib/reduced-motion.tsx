import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

interface ReducedMotionContextValue {
  reducedMotion: boolean
  prefersReducedMotion: boolean
  override: boolean | null
  setOverride: (value: boolean | null) => void
}

const ReducedMotionContext = createContext<ReducedMotionContextValue>({
  reducedMotion: false,
  prefersReducedMotion: false,
  override: null,
  setOverride: () => {},
})

export function ReducedMotionProvider({ children }: { children: ReactNode }) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === "undefined") return false
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  })
  const [override, setOverride] = useState<boolean | null>(null)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  const reducedMotion = override !== null ? override : prefersReducedMotion

  return (
    <ReducedMotionContext.Provider value={{ reducedMotion, prefersReducedMotion, override, setOverride }}>
      {children}
    </ReducedMotionContext.Provider>
  )
}

export function useReducedMotion() {
  return useContext(ReducedMotionContext)
}
