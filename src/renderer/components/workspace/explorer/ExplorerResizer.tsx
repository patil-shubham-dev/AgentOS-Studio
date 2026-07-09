import { useCallback, useRef, useEffect } from "react"
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
      className="w-[3px] cursor-col-resize hover:w-[4px] hover:bg-blue-500/30 bg-white/[0.02] transition-all duration-150 shrink-0 relative group"
      onMouseDown={handleMouseDown}
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
      <GripVertical className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 text-white/0 group-hover:text-white/30 transition-colors" />
    </div>
  )
}
