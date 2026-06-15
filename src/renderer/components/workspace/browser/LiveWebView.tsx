import { useEffect, useRef, useState, useCallback } from "react"
import { listen } from "@/lib/electron-api"
import { cn } from "@/lib/utils"

interface ViewportState {
  url: string
  title: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

interface LiveWebViewProps {
  onNavigate?: (url: string) => void
  onTitleChange?: (title: string) => void
  className?: string
}

export function useViewport(options?: {
  onStateChange?: (state: ViewportState) => void
}) {
  const [viewportState, setViewportState] = useState<ViewportState>({
    url: "about:blank",
    title: "New Tab",
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const boundsRef = useRef({ x: 0, y: 0, width: 0, height: 0 })

  const getBounds = useCallback(() => {
    const el = containerRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
  }, [])

  const createViewport = useCallback(async () => {
    const bounds = getBounds()
    if (!bounds) return
    boundsRef.current = bounds
    const eapi = (window as any).electronAPI
    if (!eapi?.viewportCreate) return
    await eapi.viewportCreate(bounds)
  }, [getBounds])

  const resizeViewport = useCallback(async () => {
    const bounds = getBounds()
    if (!bounds) return
    const prev = boundsRef.current
    if (bounds.x === prev.x && bounds.y === prev.y && bounds.width === prev.width && bounds.height === prev.height) return
    boundsRef.current = bounds
    const eapi = (window as any).electronAPI
    if (!eapi?.viewportResize) return
    await eapi.viewportResize(bounds)
  }, [getBounds])

  const destroyViewport = useCallback(async () => {
    const eapi = (window as any).electronAPI
    if (!eapi?.viewportDestroy) return
    await eapi.viewportDestroy()
  }, [])

  useEffect(() => {
    createViewport()
    const unsub = listen("viewport-state-changed", (event: { payload: ViewportState }) => {
      setViewportState(event.payload)
      options?.onStateChange?.(event.payload)
    })
    const handleResize = () => resizeViewport()
    window.addEventListener("resize", handleResize)
    const resizeObserver = new ResizeObserver(() => resizeViewport())
    if (containerRef.current) resizeObserver.observe(containerRef.current)
    return () => {
      destroyViewport()
      unsub.then((fn) => fn())
      window.removeEventListener("resize", handleResize)
      resizeObserver.disconnect()
    }
  }, [])

  return {
    containerRef,
    viewportState,
    createViewport,
    resizeViewport,
    destroyViewport,
    navigate: async (url: string) => {
      const eapi = (window as any).electronAPI
      if (!eapi?.viewportNavigate) return
      await eapi.viewportNavigate(url)
    },
    click: async (selector: string) => {
      const eapi = (window as any).electronAPI
      if (!eapi?.viewportClick) return
      return eapi.viewportClick(selector)
    },
    type: async (selector: string, text: string) => {
      const eapi = (window as any).electronAPI
      if (!eapi?.viewportType) return
      return eapi.viewportType(selector, text)
    },
    screenshot: async () => {
      const eapi = (window as any).electronAPI
      if (!eapi?.viewportScreenshot) return null
      return eapi.viewportScreenshot() as Promise<string | null>
    },
    executeJs: async (js: string) => {
      const eapi = (window as any).electronAPI
      if (!eapi?.viewportExecuteJs) return
      return eapi.viewportExecuteJs(js)
    },
    goBack: async () => {
      const eapi = (window as any).electronAPI
      if (!eapi?.viewportGoBack) return
      await eapi.viewportGoBack()
    },
    goForward: async () => {
      const eapi = (window as any).electronAPI
      if (!eapi?.viewportGoForward) return
      await eapi.viewportGoForward()
    },
    reload: async () => {
      const eapi = (window as any).electronAPI
      if (!eapi?.viewportReload) return
      await eapi.viewportReload()
    },
    injectAnnotations: async () => {
      const eapi = (window as any).electronAPI
      if (!eapi?.viewportInjectAnnotations) return false
      return eapi.viewportInjectAnnotations() as Promise<boolean>
    },
  }
}

export function LiveViewportPlaceholder({ containerRef, className }: { containerRef: React.RefObject<HTMLDivElement | null>; className?: string }) {
  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden bg-white", className)}
      style={{ minHeight: 200 }}
    >
      {/* The Electron WebContentsView overlays this element at the same screen position */}
    </div>
  )
}
