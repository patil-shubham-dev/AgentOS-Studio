import { type CSSProperties, type ReactNode, useCallback, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { usePaneStore, type PaneType } from "@/stores/pane-store"
import {
  DndContext,
  type DragEndEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  rectSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, X, PanelRightClose } from "lucide-react"

export interface PaneConfig {
  type: PaneType
  id: string
  title: string
  icon?: ReactNode
  children: ReactNode
  toolbar?: ReactNode
  badge?: string | number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function ResizeHandle({
  direction,
  onMouseDown,
}: {
  direction: "horizontal" | "vertical"
  onMouseDown: (e: React.MouseEvent) => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "group relative shrink-0 transition-all duration-150 ease-out z-10",
        direction === "horizontal"
          ? "w-1.5 cursor-col-resize -ml-[3px]"
          : "h-1.5 cursor-row-resize -mt-[3px]",
      )}
    >
      <div
        className={cn(
          "absolute z-20 transition-all duration-200",
          direction === "horizontal"
            ? "inset-y-0 left-0 right-0"
            : "inset-x-0 top-0 bottom-0",
        )}
      />
      <div
        className={cn(
          "absolute transition-all duration-200 rounded-full",
          hovered ? "bg-blue-500/50" : "bg-transparent",
          direction === "horizontal"
            ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-[3px]"
            : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-[3px]",
        )}
      />
    </div>
  )
}

interface SortablePaneWrapperProps {
  pane: PaneConfig
  style?: CSSProperties
}

function SortablePaneWrapper({ pane, style }: SortablePaneWrapperProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pane.id,
  })
  const togglePane = usePaneStore((s) => s.togglePane)

  const dragStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 999 : 0,
    ...style,
  }

  return (
    <div ref={setNodeRef} style={dragStyle} className="flex flex-col min-h-0 min-w-0 overflow-hidden">
      <Pane
        id={pane.id}
        title={pane.title}
        icon={pane.icon}
        toolbar={pane.toolbar}
        badge={pane.badge}
        onClose={() => togglePane(pane.id)}
        dragHandleProps={{ ...attributes, ...listeners }}
      >
        {pane.children}
      </Pane>
    </div>
  )
}

function AnimatedPaneWrapper({ pane, style }: SortablePaneWrapperProps) {
  return (
    <AnimatePresence mode="popLayout">
      <motion.div
        key={pane.id}
        className="flex flex-col min-h-0 min-w-0 overflow-hidden"
        style={style}
        initial={{ opacity: 0, scale: 0.97, x: 8 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        exit={{ opacity: 0, scale: 0.97, x: -8 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <SortablePaneWrapper pane={pane} />
      </motion.div>
    </AnimatePresence>
  )
}

function HorizontalPaneRow({ panes }: { panes: PaneConfig[] }) {
  const rowRef = useRef<HTMLDivElement>(null)
  const paneState = usePaneStore((s) => s.panes)
  const setPaneSize = usePaneStore((s) => s.setPaneSize)

  const startResize = useCallback((leftPaneId: string) => (event: React.MouseEvent) => {
    event.preventDefault()
    const container = rowRef.current
    const leftPane = paneState.find((pane) => pane.id === leftPaneId)
    if (!container || !leftPane) return

    const startX = event.clientX
    const startWidth = leftPane.size

    function onMouseMove(moveEvent: MouseEvent) {
      const delta = moveEvent.clientX - startX
      const nextWidth = clamp(startWidth + delta, leftPane.minSize, Number.isFinite(leftPane.maxSize) ? leftPane.maxSize : startWidth + delta)
      setPaneSize(leftPane.id, nextWidth)
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
  }, [paneState, setPaneSize])

  return (
    <div ref={rowRef} className="flex flex-1 min-h-0 min-w-0">
      {panes.map((pane, index) => {
        const state = paneState.find((item) => item.id === pane.id)
        const isLast = index === panes.length - 1
        const style: CSSProperties = isLast
          ? { flex: "1 1 0", minWidth: state?.minSize ?? 200 }
          : {
              flex: `0 0 ${state?.size ?? 320}px`,
              minWidth: state?.minSize ?? 200,
              maxWidth: state && Number.isFinite(state.maxSize) ? state.maxSize : undefined,
            }

        return (
          <div key={pane.id} className="contents">
            {index > 0 && (
              <ResizeHandle
                direction="horizontal"
                onMouseDown={startResize(panes[index - 1].id)}
              />
            )}
            <AnimatedPaneWrapper pane={pane} style={style} />
          </div>
        )
      })}
    </div>
  )
}

function PaneLayout({ panes, layoutMode }: { panes: PaneConfig[]; layoutMode: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [bottomRowHeight, setBottomRowHeight] = useState(220)

  const startVerticalResize = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    const container = containerRef.current
    if (!container) return

    const startY = event.clientY
    const startHeight = bottomRowHeight

    function onMouseMove(moveEvent: MouseEvent) {
      const delta = startY - moveEvent.clientY
      const max = Math.max(160, container.getBoundingClientRect().height - 160)
      setBottomRowHeight(clamp(startHeight + delta, 120, max))
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
  }, [bottomRowHeight])

  if (panes.length === 1) {
    return (
      <div ref={containerRef} className="flex-1 min-h-0 min-w-0">
        <HorizontalPaneRow panes={panes} />
      </div>
    )
  }

  if (layoutMode === "grid-2col" || panes.length === 2) {
    return (
      <div ref={containerRef} className="flex-1 min-h-0 min-w-0">
        <HorizontalPaneRow panes={panes.slice(0, 2)} />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 flex flex-col min-h-0 min-w-0">
      <div className="flex-1 min-h-0 min-w-0">
        <HorizontalPaneRow panes={panes.slice(0, 2)} />
      </div>
      {panes.length > 2 && (
        <>
          <ResizeHandle direction="vertical" onMouseDown={startVerticalResize} />
          <div className="min-h-0 min-w-0 shrink-0" style={{ height: bottomRowHeight }}>
            <HorizontalPaneRow panes={panes.slice(2)} />
          </div>
        </>
      )}
    </div>
  )
}

export function PaneContainer({ panes }: { panes: PaneConfig[] }) {
  const layoutMode = usePaneStore((s) => s.layoutMode)
  const reorderPanes = usePaneStore((s) => s.reorderPanes)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = panes.findIndex((pane) => pane.id === active.id)
      const newIndex = panes.findIndex((pane) => pane.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = [...panes]
      const [moved] = reordered.splice(oldIndex, 1)
      reordered.splice(newIndex, 0, moved)
      reorderPanes(reordered.map((pane) => pane.id))
    },
    [panes, reorderPanes],
  )

  if (panes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3 text-center max-w-[200px]">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <PanelRightClose className="h-5 w-5 text-white/20" />
          </div>
          <p className="text-xs text-white/20 leading-relaxed">
            Open a pane from the toolbar above to see its contents here
          </p>
        </div>
      </div>
    )
  }

  const direction = layoutMode === "grid-2col" || panes.length <= 2 ? "horizontal" : "vertical"
  const sortingStrategy = direction === "horizontal" ? horizontalListSortingStrategy : rectSortingStrategy

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={panes.map((pane) => pane.id)} strategy={sortingStrategy}>
        <PaneLayout panes={panes} layoutMode={layoutMode} />
      </SortableContext>
    </DndContext>
  )
}

export function Pane({
  id,
  title,
  icon,
  children,
  toolbar,
  badge,
  onClose,
  dragHandleProps,
}: {
  id: string
  title: string
  icon?: ReactNode
  children: ReactNode
  toolbar?: ReactNode
  badge?: string | number
  onClose?: () => void
  dragHandleProps?: Record<string, unknown>
}) {
  const focusedPaneId = usePaneStore((s) => s.focusedPaneId)
  const focusPane = usePaneStore((s) => s.focusPane)
  const isFocused = focusedPaneId === id

  return (
    <div
      className={cn(
        "flex flex-col h-full min-h-0 bg-[#0a0a0b] relative",
        isFocused && "ring-1 ring-blue-500/15",
      )}
      onClick={() => focusPane(id)}
      tabIndex={-1}
    >
      <div className="flex items-center justify-between px-1 py-1 border-b border-white/[0.04] shrink-0 group bg-[#0c0c0d]/80 backdrop-blur-sm">
        <div className="flex items-center gap-1 min-w-0">
          {dragHandleProps && (
            <button
              {...dragHandleProps}
              className="cursor-grab active:cursor-grabbing rounded p-0.5 text-white/15 hover:text-white/50 hover:bg-white/[0.06] transition-all shrink-0"
              title="Drag to reorder pane"
              onClick={(event) => event.stopPropagation()}
            >
              <GripVertical className="h-3 w-3" />
            </button>
          )}
          {icon && <span className="text-white/30 shrink-0">{icon}</span>}
          <span className="text-[10px] font-medium text-white/25 uppercase tracking-widest truncate">
            {title}
          </span>
          {badge != null && (
            <span className="inline-flex items-center justify-center h-3.5 min-w-[14px] px-1 rounded-full bg-blue-500/20 text-[8px] font-semibold text-blue-400 leading-none">
              {badge}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {toolbar}
          {onClose && (
            <button
              onClick={(event) => {
                event.stopPropagation()
                onClose()
              }}
              className="rounded p-0.5 text-white/20 hover:text-white/50 hover:bg-white/[0.06] active:scale-90 transition-all duration-150"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
