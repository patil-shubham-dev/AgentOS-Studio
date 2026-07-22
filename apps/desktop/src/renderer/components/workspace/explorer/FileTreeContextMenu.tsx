import { memo, useEffect, useRef, useState, useCallback } from "react"
import type { FileTreeContextMenuItem, FileTreeContextMenuOpenContext } from "@pierre/trees"
import { useAppStore } from "@/stores/app-store"

export function FileTreeContextMenu({
  item,
  context,
  onClose,
}: {
  item: FileTreeContextMenuItem
  context: FileTreeContextMenuOpenContext
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<React.CSSProperties>({})

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = context.anchorRect
    const viewportW = window.innerWidth
    const viewportH = window.innerHeight
    const menuW = 200
    const menuH = el.offsetHeight || 300
    let left = rect.x
    let top = rect.y
    if (left + menuW > viewportW) left = viewportW - menuW - 8
    if (top + menuH > viewportH) top = viewportH - menuH - 8
    setStyle({ left: Math.max(4, left), top: Math.max(4, top) })
  }, [context.anchorRect])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const escapeHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", handler)
    document.addEventListener("keydown", escapeHandler)
    return () => {
      document.removeEventListener("mousedown", handler)
      document.removeEventListener("keydown", escapeHandler)
    }
  }, [onClose])

  const sendCommand = useCallback((cmd: string) => {
    const input = `/${item.path} — ${cmd}`
    useAppStore.getState().setPendingInput?.(input)
    onClose()
  }, [item.path, onClose])

  const handleExplain = useCallback(() => sendCommand("explain this file"), [sendCommand])
  const handleFix = useCallback(() => sendCommand("fix issues in this file"), [sendCommand])
  const handleRefactor = useCallback(() => sendCommand("refactor this file"), [sendCommand])
  const handleOptimize = useCallback(() => sendCommand("optimize this file"), [sendCommand])
  const handleAddTests = useCallback(() => sendCommand("add tests for this file"), [sendCommand])
  const handleReview = useCallback(() => sendCommand("review this file for bugs"), [sendCommand])
  const handleCopyPath = useCallback(() => {
    navigator.clipboard.writeText(item.path).catch(() => {})
    onClose()
  }, [item.path, onClose])
  const handleRename = useCallback(() => {
    context.close({ restoreFocus: false })
  }, [context])

  return (
    <div
      ref={ref}
      className="fixed z-[200] min-w-[180px] rounded-xl border shadow-2xl py-1"
      style={{
        ...style,
        backgroundColor: "var(--surface-panel)",
        borderColor: "var(--border-default)",
      }}
      role="menu"
    >
      <div className="px-3 py-1.5 text-[9px] font-medium truncate" style={{ color: "var(--text-quaternary)" }}>
        {item.kind === "directory" ? "📁" : "📄"} {item.name}
      </div>

      <div className="h-px mx-2" style={{ backgroundColor: "var(--border-subtle)" }} />

      <MenuItem label="Explain" shortcut="→ AI" onClick={handleExplain} />
      <MenuItem label="Fix" shortcut="→ AI" onClick={handleFix} />
      <MenuItem label="Refactor" shortcut="→ AI" onClick={handleRefactor} />
      <MenuItem label="Optimize" shortcut="→ AI" onClick={handleOptimize} />
      <MenuItem label="Add Tests" shortcut="→ AI" onClick={handleAddTests} />
      <MenuItem label="Review" shortcut="→ AI" onClick={handleReview} />

      <div className="h-px mx-2" style={{ backgroundColor: "var(--border-subtle)" }} />

      <MenuItem label="Copy Path" shortcut="⌘C" onClick={handleCopyPath} />
      <MenuItem label="Rename" shortcut="F2" onClick={handleRename} />
    </div>
  )
}

function MenuItem({ label, shortcut, onClick }: { label: string; shortcut?: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="flex w-full items-center justify-between gap-4 px-3 py-1.5 text-[10px] text-left transition-colors hover:bg-white/[0.04]"
      style={{ color: "var(--text-secondary)" }}
      role="menuitem"
    >
      <span>{label}</span>
      {shortcut && (
        <span className="text-[8px] font-mono" style={{ color: "var(--text-quaternary)" }}>
          {shortcut}
        </span>
      )}
    </button>
  )
}
