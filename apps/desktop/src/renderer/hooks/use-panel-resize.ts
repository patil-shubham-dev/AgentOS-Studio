import { useCallback, useEffect, useRef, useState } from "react"

const STORAGE_PREFIX = "aos-panel-size-"

function loadWidth(key: string, defaultVal: number): number {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`)
    if (raw === null) return defaultVal
    const parsed = JSON.parse(raw)
    return typeof parsed === "number" && parsed > 0 ? parsed : defaultVal
  } catch {
    return defaultVal
  }
}

function saveWidth(key: string, val: number): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(Math.round(val)))
  } catch { /* quota */ }
}

export interface ResizablePanelOptions {
  id: string
  defaultWidth: number
  minWidth: number
  maxWidth: number
  direction: "horizontal" | "vertical"
}

export function usePanelResize(
  containerRef: React.RefObject<HTMLElement | null>,
  options: ResizablePanelOptions,
) {
  const { id, defaultWidth, minWidth, maxWidth, direction } = options
  const [width, setWidth] = useState(() => loadWidth(id, defaultWidth))
  const draggingRef = useRef(false)
  const startPosRef = useRef(0)
  const startSizeRef = useRef(0)
  const widthRef = useRef(width)
  const rafRef = useRef<number | null>(null)

  widthRef.current = width

  useEffect(() => {
    saveWidth(id, width)
  }, [id, width])

  const handleDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault()
      draggingRef.current = true
      const pos = "touches" in e ? e.touches[0].clientX : e.clientX
      startPosRef.current = pos
      startSizeRef.current = widthRef.current

      const onMove = (ev: MouseEvent | TouchEvent) => {
        if (!draggingRef.current) return
        const currentPos = "touches" in ev ? ev.touches[0].clientX : ev.clientX
        const delta = currentPos - startPosRef.current
        const newSize = startSizeRef.current + delta
        const clamped = Math.min(maxWidth, Math.max(minWidth, newSize))

        if (containerRef.current) {
          const prop = direction === "horizontal" ? "--panel-width" : "--panel-height"
          containerRef.current.style.setProperty(prop, `${clamped}px`)
        }

        if (rafRef.current === null) {
          rafRef.current = requestAnimationFrame(() => {
            setWidth(clamped)
            rafRef.current = null
          })
        }
      }

      const onUp = () => {
        draggingRef.current = false
        document.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseup", onUp)
        document.removeEventListener("touchmove", onMove)
        document.removeEventListener("touchend", onUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
      }

      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
      document.addEventListener("touchmove", onMove, { passive: false })
      document.addEventListener("touchend", onUp)
      document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize"
      document.body.style.userSelect = "none"
    },
    [containerRef, direction, minWidth, maxWidth],
  )

  const resetWidth = useCallback(() => {
    setWidth(defaultWidth)
    if (containerRef.current) {
      containerRef.current.style.setProperty("--panel-width", `${defaultWidth}px`)
    }
  }, [containerRef, defaultWidth])

  return { width, handleDragStart, resetWidth, isDragging: draggingRef.current }
}
