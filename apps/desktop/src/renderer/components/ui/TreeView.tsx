import { useState, useCallback, type ReactNode } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { DURATION, EASING } from "@/lib/motion"

export interface TreeNode {
  id: string
  label: string
  icon?: ReactNode
  children?: TreeNode[]
  data?: Record<string, unknown>
}

interface TreeViewProps {
  nodes: TreeNode[]
  selectedId?: string | null
  onSelect?: (node: TreeNode) => void
  className?: string
  defaultExpandedIds?: Set<string>
  renderIcon?: (node: TreeNode) => ReactNode
  renderLabel?: (node: TreeNode) => ReactNode
}

function TreeItem({
  node,
  depth,
  selectedId,
  onSelect,
  expandedIds,
  onToggle,
  renderIcon,
  renderLabel,
}: {
  node: TreeNode
  depth: number
  selectedId?: string | null
  onSelect?: (node: TreeNode) => void
  expandedIds: Set<string>
  onToggle: (id: string) => void
  renderIcon?: (node: TreeNode) => ReactNode
  renderLabel?: (node: TreeNode) => ReactNode
}) {
  const hasChildren = node.children && node.children.length > 0
  const isExpanded = expandedIds.has(node.id)
  const isSelected = selectedId === node.id

  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren) onToggle(node.id)
          onSelect?.(node)
        }}
        className={cn(
          "flex items-center gap-1.5 w-full text-left rounded-md px-2 py-1 transition-colors",
          "hover:bg-[var(--border-default)]",
          isSelected && "bg-[var(--color-accent-brand-muted)]",
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {hasChildren && (
          <motion.svg
            viewBox="0 0 10 10"
            className="h-[10px] w-[10px] shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "var(--text-quaternary)" }}
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: DURATION.fast, ease: EASING.default }}
          >
            <path d="M3 2l4 3-4 3" />
          </motion.svg>
        )}
        {!hasChildren && <span className="w-[10px] shrink-0" />}
        {renderIcon ? renderIcon(node) : node.icon}
        {renderLabel ? renderLabel(node) : (
          <span className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>
            {node.label}
          </span>
        )}
      </button>
      <AnimatePresence>
        {hasChildren && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DURATION.fast, ease: EASING.default }}
            className="overflow-hidden"
          >
            {node.children!.map((child) => (
              <TreeItem
                key={child.id}
                node={child}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                expandedIds={expandedIds}
                onToggle={onToggle}
                renderIcon={renderIcon}
                renderLabel={renderLabel}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function TreeView({
  nodes,
  selectedId,
  onSelect,
  className,
  defaultExpandedIds,
  renderIcon,
  renderLabel,
}: TreeViewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => defaultExpandedIds ?? new Set(nodes.filter((n) => n.children?.length).map((n) => n.id)),
  )

  const onToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  return (
    <div className={cn("select-none", className)}>
      {nodes.map((node) => (
        <TreeItem
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          expandedIds={expandedIds}
          onToggle={onToggle}
          renderIcon={renderIcon}
          renderLabel={renderLabel}
        />
      ))}
    </div>
  )
}
