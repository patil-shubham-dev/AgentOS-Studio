import { useCallback, useRef, useEffect, useState } from "react"
import { GripVertical } from "lucide-react"

interface ExplorerResizerProps {
  onResize: (width: number) => void
  minWidth?: number
  maxWidth?: number
}

export function ExplorerResizer({ onResize, minWidth = 200, maxWidth = 800 }: ExplorerResizerProps) {
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)
  const [hovered, setHovered] = useState(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = (e.target as HTMLElement).parentElement?.previousElementSibling?.getBoundingClientRect().width ?? 300
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return
    const delta = e.clientX - startX.current
    const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth.current + delta))
    onResize(newWidth)
  }, [onResize, minWidth, maxWidth])

  const handleMouseUp = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
  }, [])

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  return (
    <div
      className="shrink-0 relative transition-all duration-150"
      style={{
        width: hovered || dragging.current ? "4px" : "3px",
        cursor: "col-resize",
        background: dragging.current ? "var(--color-accent-brand-border)" : hovered ? "var(--color-accent-brand-border)" : "var(--border-subtle)",
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
      <GripVertical
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none transition-opacity duration-150"
        style={{ opacity: hovered ? 1 : 0, color: "var(--text-quaternary)" }}
      />
    </div>
  )
}
