import { type ReactNode, useCallback } from "react"
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
import { GripVertical, X } from "lucide-react"

interface PaneConfig {
  type: PaneType
  id: string
  title: string
  icon?: ReactNode
  children: ReactNode
  toolbar?: ReactNode
}

function ResizeHandle({
  direction,
  onMouseDown,
}: {
  direction: "horizontal" | "vertical"
  onMouseDown: (e: React.MouseEvent) => void
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        "group relative shrink-0 transition-all duration-200 ease-out z-10",
        direction === "horizontal"
          ? "w-1 cursor-col-resize -ml-0.5 hover:bg-blue-500/20 active:bg-blue-500/40"
          : "h-1 cursor-row-resize -mt-0.5 hover:bg-blue-500/20 active:bg-blue-500/40"
      )}
    >
      <div className={cn(
        "absolute z-20 transition-all duration-200",
        direction === "horizontal"
          ? "inset-y-0 -left-1.5 -right-1.5"
          : "inset-x-0 -top-1.5 -bottom-1.5"
      )} />
      <div className={cn(
        "absolute rounded-full bg-blue-400/0 group-hover:bg-blue-400/60 group-active:bg-blue-400/80 transition-all duration-200",
        direction === "horizontal"
          ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-1 w-1 group-hover:h-2 group-hover:w-2"
          : "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-1 w-1 group-hover:h-2 group-hover:w-2"
      )} />
    </div>
  )
}

interface SortablePaneWrapperProps {
  pane: PaneConfig
  isFirst: boolean
  direction: "horizontal" | "vertical"
}

function SortablePaneWrapper({ pane, isFirst, direction }: SortablePaneWrapperProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pane.id,
  })
  const togglePane = usePaneStore((s) => s.togglePane)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative" as const,
    zIndex: isDragging ? 999 : 0,
  }

  return (
    <>
      {!isFirst && <ResizeHandle direction={direction} onMouseDown={() => {}} />}
      <div ref={setNodeRef} style={style} className="flex-1 flex flex-col min-h-0 min-w-0">
        <Pane
          id={pane.id}
          title={pane.title}
          icon={pane.icon}
          toolbar={pane.toolbar}
          onClose={() => togglePane(pane.id)}
          dragHandleProps={{ ...attributes, ...listeners }}
        >
          {pane.children}
        </Pane>
      </div>
    </>
  )
}

export function PaneContainer({ panes }: { panes: PaneConfig[] }) {
  const { layoutMode, reorderPanes } = usePaneStore()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

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

      reorderPanes(reordered.map((p) => p.id))
    },
    [panes, reorderPanes]
  )

  if (panes.length === 0) return null

  const direction = layoutMode === "grid-2col" || panes.length <= 2 ? "horizontal" : "vertical"
  const sortingStrategy = direction === "horizontal" ? horizontalListSortingStrategy : rectSortingStrategy

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={panes.map((p) => p.id)} strategy={sortingStrategy}>
        {renderLayout(panes, layoutMode, direction)}
      </SortableContext>
    </DndContext>
  )
}

function AnimatedPaneWrapper({ pane, isFirst, direction }: SortablePaneWrapperProps) {
  return (
    <AnimatePresence mode="popLayout">
      <motion.div
        key={pane.id}
        className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden"
        initial={{ opacity: 0, scale: 0.97, x: 8 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        exit={{ opacity: 0, scale: 0.97, x: -8 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <SortablePaneWrapper pane={pane} isFirst={isFirst} direction={direction} />
      </motion.div>
    </AnimatePresence>
  )
}

function renderLayout(panes: PaneConfig[], layoutMode: string, direction: "horizontal" | "vertical") {
  if (panes.length === 1) {
    return (
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <AnimatedPaneWrapper pane={panes[0]} isFirst direction={direction} />
      </div>
    )
  }

  if (layoutMode === "grid-2col" || panes.length === 2) {
    return (
      <div className="flex-1 flex min-h-0 min-w-0">
        {panes.slice(0, 2).map((pane, i) => (
          <AnimatedPaneWrapper key={pane.id} pane={pane} isFirst={i === 0} direction="horizontal" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      <div className="flex-1 flex min-h-0 min-w-0">
        {panes.slice(0, 2).map((pane, i) => (
          <AnimatedPaneWrapper key={pane.id} pane={pane} isFirst={i === 0} direction="horizontal" />
        ))}
      </div>
      {panes.length > 2 && (
        <>
          <ResizeHandle direction="vertical" onMouseDown={() => {}} />
          <div className="flex min-h-0" style={{ height: 200 }}>
            {panes.slice(2).map((pane, i) => (
              <AnimatedPaneWrapper key={pane.id} pane={pane} isFirst={i === 0} direction="horizontal" />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function Pane({
  id,
  title,
  icon,
  children,
  toolbar,
  onClose,
  dragHandleProps,
}: {
  id: string
  title: string
  icon?: ReactNode
  children: ReactNode
  toolbar?: ReactNode
  onClose?: () => void
  dragHandleProps?: Record<string, unknown>
}) {
  const { focusedPaneId, focusPane } = usePaneStore()
  const isFocused = focusedPaneId === id

  return (
    <div
      className={cn(
        "flex flex-col h-full min-h-0 bg-[#0a0a0b]",
        isFocused && "ring-1 ring-blue-500/20"
      )}
      onClick={() => focusPane(id)}
      tabIndex={-1}
    >
      {/* Pane header */}
      <div className="flex items-center justify-between px-1 py-1 border-b border-white/[0.04] shrink-0 group">
        <div className="flex items-center gap-1 min-w-0">
          {/* Drag handle — always visible, subtle */}
          {dragHandleProps && (
            <button
              {...dragHandleProps}
              className="cursor-grab active:cursor-grabbing rounded p-0.5 text-white/15 hover:text-white/50 hover:bg-white/[0.06] transition-all shrink-0"
              title="Drag to reorder pane"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-3 w-3" />
            </button>
          )}
          {icon && <span className="text-white/30 shrink-0">{icon}</span>}
          <span className="text-[10px] font-medium text-white/25 uppercase tracking-widest truncate">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {toolbar}
          {onClose && (
            <button
              onClick={(e) => { e.stopPropagation(); onClose() }}
              className="rounded p-0.5 text-white/20 hover:text-white/50 hover:bg-white/[0.06] active:scale-90 transition-all duration-150"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      {/* Pane content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
