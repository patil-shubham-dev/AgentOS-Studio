import { useMemo, useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useAgentStore, type AgentTreeNode } from "@/stores/agent-store"
import { Badge } from "@agentic-os/ui"
import {
  Search, X, Shield, Activity, GitBranch,
  ChevronRight, ChevronDown, Loader2,
} from "lucide-react"

const STATE_COLORS: Record<string, string> = {
  idle: "bg-white/10 text-white/30",
  planning: "bg-blue-500/10 text-blue-400",
  researching: "bg-purple-500/10 text-purple-400",
  browsing: "bg-sky-500/10 text-sky-400",
  editing: "bg-amber-500/10 text-amber-400",
  validating: "bg-green-500/10 text-green-400",
  complete: "bg-emerald-500/10 text-emerald-400",
  failed: "bg-red-500/10 text-red-400",
  pending: "bg-white/[0.04] text-white/20",
  waiting: "bg-yellow-500/10 text-yellow-400",
}

const TYPE_ICONS: Record<string, string> = {
  explore: "🔍",
  plan: "📋",
  verify: "✅",
  general: "⚙️",
  main: "🧠",
}

interface TreeViewNodeProps {
  node: AgentTreeNode
  allNodes: Record<string, AgentTreeNode>
  depth: number
  searchQuery: string
  expandedIds: Set<string>
  onToggle: (id: string) => void
}

function TreeNodeRow({
  node, allNodes, depth, searchQuery, expandedIds, onToggle,
}: TreeViewNodeProps) {
  const hasChildren = node.children.length > 0
  const isExpanded = expandedIds.has(node.id)
  const isSearching = searchQuery.length > 0
  const isProcessing = node.state === "planning" || node.state === "researching"

  const matchesSearch = searchQuery
    ? node.currentTask.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.role.toLowerCase().includes(searchQuery.toLowerCase())
    : true

  const childMatches = searchQuery
    ? node.children.some((cid) => {
        const child = allNodes[cid]
        if (!child) return false
        return child.currentTask.toLowerCase().includes(searchQuery.toLowerCase()) ||
               child.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
               child.children.some((gcid) => {
                 const gc = allNodes[gcid]
                 return gc && (gc.currentTask.toLowerCase().includes(searchQuery.toLowerCase()) ||
                   gc.role.toLowerCase().includes(searchQuery.toLowerCase()))
               })
      })
    : false

  if (searchQuery && !matchesSearch && !childMatches) return null

  const stateColor = STATE_COLORS[node.state] ?? STATE_COLORS.idle

  return (
    <div>
      <motion.div
        layout
        className={cn(
          "group flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all duration-150",
          "border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10",
          isProcessing && "border-blue-500/10",
          node.state === "failed" && "border-red-500/10",
          node.state === "complete" && "border-emerald-500/10",
        )}
        style={{ marginLeft: depth * 20 }}
      >
        {/* Expand/collapse */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(node.id) }}
          className={cn(
            "shrink-0 rounded p-0.5 transition-all",
            hasChildren
              ? "text-white/30 hover:text-white hover:bg-white/5"
              : "text-white/10 cursor-default",
          )}
        >
          {hasChildren ? (
            isExpanded
              ? <ChevronDown className="h-3 w-3" />
              : <ChevronRight className="h-3 w-3" />
          ) : (
            <span className="block h-3 w-3" />
          )}
        </button>

        {/* Type icon */}
        <span className="text-xs shrink-0">
          {TYPE_ICONS[node.type] ?? "⚙️"}
        </span>

        {/* Role + task */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-white capitalize">{node.role}</span>
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
              stateColor,
            )}>
              {isProcessing && (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              )}
              {node.state}
            </span>
            <span className="text-[9px] text-white/20">
              d{depth}
            </span>
          </div>
          <p className="text-[10px] text-white/40 truncate leading-tight mt-0.5">
            {node.currentTask}
          </p>
        </div>

        {/* Progress bar for active nodes */}
        {node.progress !== undefined && (
          <div className="w-12 h-1 rounded-full bg-white/5 overflow-hidden shrink-0">
            <div
              className="h-full rounded-full bg-blue-400/60 transition-all"
              style={{ width: `${node.progress}%` }}
            />
          </div>
        )}
      </motion.div>

      {/* Children */}
      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {node.children.map((childId) => {
              const child = allNodes[childId]
              if (!child) return null
              return (
                <TreeNodeRow
                  key={child.id}
                  node={child}
                  allNodes={allNodes}
                  depth={depth + 1}
                  searchQuery={searchQuery}
                  expandedIds={expandedIds}
                  onToggle={onToggle}
                />
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function AgentTreeView() {
  const agentTree = useAgentStore((s) => s.agentTree)
  const agentTreeRootId = useAgentStore((s) => s.agentTreeRootId)
  const [searchQuery, setSearchQuery] = useState("")
  const [autoExpand, setAutoExpand] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const rootNodes = useMemo(() => {
    if (agentTreeRootId && agentTree[agentTreeRootId]) {
      return [agentTree[agentTreeRootId]]
    }
    return Object.values(agentTree).filter((n) => n.parentId === null)
  }, [agentTree, agentTreeRootId])

  const allNodeIds = useMemo(() => Object.keys(agentTree), [agentTree])

  // Auto-expand all when tree changes
  useEffect(() => {
    if (autoExpand) {
      setExpandedIds(new Set(allNodeIds))
    }
  }, [allNodeIds, autoExpand])

  function handleToggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function collapseAll() {
    setExpandedIds(new Set())
    setAutoExpand(false)
  }

  function expandAll() {
    setExpandedIds(new Set(allNodeIds))
    setAutoExpand(true)
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter agents..."
            className="w-full h-8 rounded-lg border border-white/5 bg-white/[0.03] pl-8 pr-3 text-xs text-white outline-none placeholder:text-white/20 focus:border-white/10 transition-all"
          />
        </div>
        <button
          onClick={expandAll}
          className="rounded-lg border border-white/5 px-2.5 py-1 text-[10px] text-white/40 hover:text-white hover:border-white/10 transition-all"
        >
          <ChevronDown className="h-3 w-3 inline mr-1" />
          Expand
        </button>
        <button
          onClick={collapseAll}
          className="rounded-lg border border-white/5 px-2.5 py-1 text-[10px] text-white/40 hover:text-white hover:border-white/10 transition-all"
        >
          <ChevronRight className="h-3 w-3 inline mr-1" />
          Collapse
        </button>
        <div className="text-[10px] text-white/20">
          {Object.keys(agentTree).length} agents
        </div>
      </div>

      {/* Tree */}
      <div className="space-y-1">
        {rootNodes.length > 0 ? (
          rootNodes.map((node) => (
            <TreeNodeRow
              key={node.id}
              node={node}
              allNodes={agentTree}
              depth={0}
              searchQuery={searchQuery}
              expandedIds={expandedIds}
              onToggle={handleToggle}
            />
          ))
        ) : (
          <div className="text-center py-12">
            <GitBranch className="h-8 w-8 text-white/10 mx-auto mb-3" />
            <p className="text-xs text-white/30 mb-1">No Sub-Agents Running</p>
            <p className="text-[10px] text-white/20">
              Sub-agents will appear here when delegated from the runtime
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
