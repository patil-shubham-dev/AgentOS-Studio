import { useCallback, useRef, useState, type ReactNode } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { usePlatform } from "@/lib/platform-adapter"
import {
  DndContext, type DragEndEvent, closestCenter,
  PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core"
import {
  SortableContext, useSortable, horizontalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, PanelBottomClose, PanelBottomOpen, X, Maximize2, Minimize2 } from "lucide-react"
import type { PaneZone } from "@/stores/workspace/pane-store"

interface MainPaneConfig {
  id: string
  children: ReactNode
  minWidth: number
  maxWidth: number
  defaultSize: number
  header?: ReactNode
}

interface MainPaneContainerProps {
  panes: MainPaneConfig[]
  onReorder: (ids: string[]) => void
  onResize: (id: string, size: number) => void
  getSize: (id: string) => number
  bottomPanes?: MainPaneConfig[]
  bottomPaneIds?: string[]
  bottomPaneHeight?: number
  onBottomReorder?: (ids: string[]) => void
  onBottomResize?: (height: number) => void
  onToggleBottom?: () => void
  bottomVisible?: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function ResizeHandle({
  onMouseDown,
  orientation = "vertical",
}: {
  onMouseDown: (e: React.MouseEvent) => void
  orientation?: "vertical" | "horizontal"
}) {
  const [hovered, setHovered] = useState(false)
  const isVertical = orientation === "vertical"

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "group relative shrink-0 transition-all duration-150 ease-out z-10",
        isVertical
          ? "w-1.5 cursor-col-resize -ml-[3px]"
          : "h-1.5 cursor-row-resize -mt-[3px]",
      )}
    >
      <div className={cn(
        "absolute z-20",
        isVertical ? "inset-y-0 left-0 right-0" : "inset-x-0 top-0 bottom-0",
      )} />
      <div
        className={cn(
          "absolute transition-all duration-200 rounded-full",
          isVertical
            ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-[3px]"
            : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-[3px]",
          hovered ? "bg-[var(--accent-code)]/50" : "bg-transparent",
        )}
      />
    </div>
  )
}

function SortableMainPane({
  pane,
  style,
  dragHandle = true,
}: {
  pane: MainPaneConfig
  style?: React.CSSProperties
  dragHandle?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pane.id,
  })

  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 999 : 0,
    ...style,
  }

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className="flex flex-col min-h-0 min-w-0 overflow-hidden flex-shrink-0"
    >
      {dragHandle && (
        <div
          {...attributes}
          {...listeners}
          className="flex items-center justify-center h-5 shrink-0 cursor-grab active:cursor-grabbing select-none"
          style={{ background: "var(--surface-panel)", borderBottom: "1px solid var(--border-subtle)" }}
        >
          <GripVertical className="h-3 w-3" style={{ color: "var(--text-quaternary)" }} />
        </div>
      )}
      {pane.header}
      <div className="flex-1 min-h-0 overflow-hidden">
        {pane.children}
      </div>
    </div>
  )
}

export function MainPaneContainer({
  panes, onReorder, onResize, getSize,
  bottomPanes, bottomPaneIds, bottomPaneHeight = 220,
  onBottomReorder, onBottomResize, onToggleBottom, bottomVisible = false,
}: MainPaneContainerProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const { modifierSymbol } = usePlatform()
  const [bottomMaximized, setBottomMaximized] = useState(false)

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIndex = panes.findIndex((p) => p.id === active.id)
      const newIndex = panes.findIndex((p) => p.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return
      const reordered = [...panes]
      const [moved] = reordered.splice(oldIndex, 1)
      reordered.splice(newIndex, 0, moved)
      onReorder(reordered.map((p) => p.id))
    },
    [panes, onReorder],
  )

  return (
    <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={panes.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
          <div ref={containerRef} className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
            <AnimatePresence mode="popLayout">
              {panes.map((pane, i) => (
                <SortableMainPane
                  key={pane.id}
                  pane={pane}
                  style={{ width: getSize(pane.id) > 0 ? getSize(pane.id) : pane.defaultSize }}
                />
              ))}
            </AnimatePresence>
            {panes.map((_pane, i) => {
              if (i >= panes.length - 1) return null
              return (
                <ResizeHandle
                  key={`resize-${i}`}
                  onMouseDown={(e: React.MouseEvent) => {
                    e.preventDefault()
                    const startX = e.clientX
                    const paneA = panes[i]
                    const paneB = panes[i + 1]
                    const startSizeA = getSize(paneA.id) || paneA.defaultSize

                    function onMouseMove(moveEvent: MouseEvent) {
                      const delta = moveEvent.clientX - startX
                      const newSize = clamp(startSizeA + delta, paneA.minWidth, paneA.maxWidth)
                      onResize(paneA.id, newSize)
                    }
                    function onMouseUp() {
                      window.removeEventListener("mousemove", onMouseMove)
                      window.removeEventListener("mouseup", onMouseUp)
                      document.body.style.cursor = ""
                      document.body.style.userSelect = ""
                    }
                    document.body.style.cursor = "col-resize"
                    document.body.style.userSelect = "none"
                    window.addEventListener("mousemove", onMouseMove)
                    window.addEventListener("mouseup", onMouseUp, { once: true })
                  }}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>

      {bottomPanes && bottomPaneIds && onBottomReorder && (
        <>
          <ResizeHandle
            orientation="horizontal"
            onMouseDown={(e: React.MouseEvent) => {
              e.preventDefault()
              const startY = e.clientY
              const startHeight = bottomPaneHeight

              function onMouseMove(moveEvent: MouseEvent) {
                const delta = moveEvent.clientY - startY
                const newHeight = clamp(startHeight - delta, 60, 600)
                onBottomResize?.(newHeight)
              }
              function onMouseUp() {
                window.removeEventListener("mousemove", onMouseMove)
                window.removeEventListener("mouseup", onMouseUp)
                document.body.style.cursor = ""
                document.body.style.userSelect = ""
              }
              document.body.style.cursor = "row-resize"
              document.body.style.userSelect = "none"
              window.addEventListener("mousemove", onMouseMove)
              window.addEventListener("mouseup", onMouseUp, { once: true })
            }}
          />

          <AnimatePresence>
            {bottomVisible && (
              <motion.div
                className="flex flex-col shrink-0 overflow-hidden border-t"
                style={{ borderColor: "var(--border-subtle)" }}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: bottomMaximized ? 400 : bottomPaneHeight, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <div
                  className="flex items-center justify-between px-3 py-1 shrink-0"
                  style={{ background: "var(--surface-panel)", borderBottom: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                      Bottom Panel
                    </span>
                    <span className="text-[9px]" style={{ color: "var(--text-quaternary)" }}>
                      {modifierSymbol}+J
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setBottomMaximized(!bottomMaximized)}
                      className="rounded p-1 transition-colors hover:bg-white/5"
                      aria-label={bottomMaximized ? "Minimize" : "Maximize"}
                    >
                      {bottomMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                    </button>
                    {onToggleBottom && (
                      <button
                        onClick={onToggleBottom}
                        className="rounded p-1 transition-colors hover:bg-white/5"
                        aria-label="Close bottom panel"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => {
                  const { active, over } = event
                  if (!over || active.id === over.id || !bottomPanes) return
                  const oldIndex = bottomPanes.findIndex((p) => p.id === active.id)
                  const newIndex = bottomPanes.findIndex((p) => p.id === over.id)
                  if (oldIndex === -1 || newIndex === -1) return
                  const reordered = [...bottomPanes]
                  const [moved] = reordered.splice(oldIndex, 1)
                  reordered.splice(newIndex, 0, moved)
                  onBottomReorder(reordered.map((p) => p.id))
                }}>
                  <SortableContext items={bottomPanes.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
                    <div className="flex flex-1 min-h-0 overflow-hidden">
                      {bottomPanes.map((pane) => (
                        <SortableMainPane
                          key={pane.id}
                          pane={pane}
                          dragHandle={false}
                          style={{ flex: 1, minWidth: 100 }}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {!bottomVisible && onToggleBottom && (
        <button
          onClick={onToggleBottom}
          className="flex items-center justify-center gap-1.5 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors hover:bg-white/5"
          style={{ color: "var(--text-tertiary)", borderTop: "1px solid var(--border-subtle)" }}
        >
          <PanelBottomOpen className="h-3 w-3" />
          Show Terminal
          <span className="text-[9px]" style={{ color: "var(--text-quaternary)" }}>
            {modifierSymbol}+J
          </span>
        </button>
      )}
    </div>
  )
}
