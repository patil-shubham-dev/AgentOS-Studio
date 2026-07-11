import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import type { AgentRoleConfig } from "@/types"
import { Badge } from "@agentic-os/ui"
import {
  Plus, Minus, Users, Brain, Code2, Eye, Search,
  Terminal, Globe, Zap, CheckCircle2, Palette,
} from "lucide-react"

const ROLE_COLORS: Record<string, string> = {
  manager: "from-amber-500/20 to-orange-500/10 border-amber-500/20",
  coder: "from-blue-500/20 to-cyan-500/10 border-blue-500/20",
  vision: "from-pink-500/20 to-rose-500/10 border-pink-500/20",
  research: "from-purple-500/20 to-violet-500/10 border-purple-500/20",
  runtime: "from-cyan-500/20 to-teal-500/10 border-cyan-500/20",
  design: "from-purple-500/20 to-fuchsia-500/10 border-purple-500/20",
  "fast-inference": "from-green-500/20 to-emerald-500/10 border-green-500/20",
  browser: "from-sky-500/20 to-blue-500/10 border-sky-500/20",
  qa: "from-green-500/20 to-lime-500/10 border-green-500/20",
  memory: "from-indigo-500/20 to-blue-500/10 border-indigo-500/20",
}

const ROLE_ICONS: Record<string, typeof Brain> = {
  manager: Brain,
  coder: Code2,
  vision: Eye,
  research: Search,
  runtime: Terminal,
  design: Palette,
  "fast-inference": Zap,
  browser: Globe,
  qa: CheckCircle2,
  memory: Brain,
}

interface TreeNode {
  role: AgentRoleConfig
  children: TreeNode[]
  depth: number
  isExpanded: boolean
}

interface RoleHierarchyTreeProps {
  roles: AgentRoleConfig[]
  onSelect: (role: AgentRoleConfig) => void
  selectedId: string | null
}

function buildTree(roles: AgentRoleConfig[]): TreeNode[] {
  const roleMap = new Map<string, AgentRoleConfig>()
  roles.forEach((r) => roleMap.set(r.id, r))

  const childrenMap = new Map<string, AgentRoleConfig[]>()
  roles.forEach((r) => {
    const parentId = r.parentRole
    if (parentId && roleMap.has(parentId)) {
      const existing = childrenMap.get(parentId) || []
      existing.push(r)
      childrenMap.set(parentId, existing)
    }
  })

  const roots = roles.filter((r) => !r.parentRole || !roleMap.has(r.parentRole))

  function buildNodes(roleList: AgentRoleConfig[], depth: number = 0): TreeNode[] {
    return roleList
      .sort((a, b) => a.priority - b.priority)
      .map((role) => ({
        role,
        children: buildNodes(childrenMap.get(role.id) || [], depth + 1),
        depth,
        isExpanded: true,
      }))
  }

  return buildNodes(roots)
}

function TreeNodeRow({
  node,
  selectedId,
  onSelect,
  onToggle,
  searchQuery,
}: {
  node: TreeNode
  selectedId: string | null
  onSelect: (role: AgentRoleConfig) => void
  onToggle: (roleId: string) => void
  searchQuery: string
}) {
  const Icon = ROLE_ICONS[node.role.runtimeRole ?? node.role.id.split("-")[1]] || Users
  const hasChildren = node.children.length > 0
  const isSelected = selectedId === node.role.id
  const isManager = node.role.name.toLowerCase() === "manager"

  const matchesSearch = searchQuery
    ? node.role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.role.description.toLowerCase().includes(searchQuery.toLowerCase())
    : true

  const childMatches = searchQuery
    ? node.children.some(
        (c) =>
          c.role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.role.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : false

  if (searchQuery && !matchesSearch && !childMatches) return null

  return (
    <div>
      <motion.div
        layout
        className={cn(
          "group flex items-center gap-2 rounded-xl border px-3 py-2.5 cursor-pointer transition-all duration-150",
          isSelected
            ? "border-blue-500/30 bg-blue-500/8 shadow-[0_0_20px_rgba(59,130,246,0.06)]"
            : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10",
          !node.role.isEnabled && "opacity-50",
        )}
        style={{ marginLeft: node.depth * 24 }}
        onClick={() => onSelect(node.role)}
      >
        {/* Expand/collapse */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(node.role.id) }}
          className={cn(
            "shrink-0 rounded-md p-0.5 transition-all",
            hasChildren
              ? "text-white/30 hover:text-white hover:bg-white/5"
              : "text-white/10 cursor-default",
          )}
        >
          {hasChildren ? (
            <Minus className={cn("h-3 w-3 transition-transform", !node.isExpanded && "-rotate-90")} />
          ) : (
            <span className="block h-3 w-3" />
          )}
        </button>

        {/* Connector line */}
        {node.depth > 0 && (
          <div className="absolute top-0 bottom-0 w-px bg-white/5 group-hover:bg-white/10 transition-colors" style={{ left: -12 }} />
        )}

        {/* Icon */}
        <div className={cn(
          "flex items-center justify-center h-7 w-7 rounded-lg border shrink-0",
          node.role.runtimeRole ? ROLE_COLORS[node.role.runtimeRole]?.split(" ")[0]?.replace("from-", "bg-").replace("/20", "/10") ?? "bg-white/[0.04]" : "bg-white/[0.04]",
          node.role.runtimeRole ? ROLE_COLORS[node.role.runtimeRole]?.split(" ")[2] ?? "border-white/5" : "border-white/5",
        )}>
          <Icon className={cn(
            "h-3.5 w-3.5",
            isManager ? "text-amber-400" : "text-white/50",
          )} />
        </div>

        {/* Name + description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white">{node.role.name}</span>
            {node.role.isBuiltIn && (
              <Badge variant="info" size="sm">built-in</Badge>
            )}
          </div>
          <p className="text-[10px] text-white/30 truncate">{node.role.description}</p>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 shrink-0">
          {node.role.runtimeState && (
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
              node.role.runtimeState === "executing" ? "bg-green-500/10 text-green-400" :
              node.role.runtimeState === "thinking" ? "bg-blue-500/10 text-blue-400" :
              node.role.runtimeState === "failed" ? "bg-red-500/10 text-red-400" :
              "bg-white/[0.04] text-white/30",
            )}>
              <span className={cn(
                "h-1.5 w-1.5 rounded-full",
                node.role.runtimeState === "executing" ? "bg-green-400 animate-pulse" :
                node.role.runtimeState === "thinking" ? "bg-blue-400 animate-pulse" :
                node.role.runtimeState === "failed" ? "bg-red-500" :
                "bg-white/20",
              )} />
              {node.role.runtimeState}
            </span>
          )}
          {node.role.model && (
            <Badge variant="success" size="sm" className="max-w-[80px] truncate">
              {node.role.model.split("/").pop()}
            </Badge>
          )}
        </div>
      </motion.div>

      {/* Children */}
      <AnimatePresence>
        {node.isExpanded && hasChildren && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {node.children.map((child) => (
              <TreeNodeRow
                key={child.role.id}
                node={child}
                selectedId={selectedId}
                onSelect={onSelect}
                onToggle={onToggle}
                searchQuery={searchQuery}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function RoleHierarchyTree({ roles, onSelect, selectedId }: RoleHierarchyTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(roles.map((r) => r.id)))
  const [searchQuery, setSearchQuery] = useState("")
  const [collapseAll, setCollapseAll] = useState(false)

  const tree = useMemo(() => buildTree(roles), [roles])

  function handleToggle(roleId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(roleId)) next.delete(roleId)
      else next.add(roleId)
      return next
    })
  }

  function expandAll() {
    setExpandedIds(new Set(roles.map((r) => r.id)))
    setCollapseAll(false)
  }

  function collapseAllFn() {
    setExpandedIds(new Set())
    setCollapseAll(true)
  }

  // Apply expanded state to tree nodes
  const treeWithState = useMemo(() => {
    function applyExpanded(nodes: TreeNode[]): TreeNode[] {
      return nodes.map((node) => ({
        ...node,
        isExpanded: !collapseAll && expandedIds.has(node.role.id),
        children: applyExpanded(node.children),
      }))
    }
    return applyExpanded(tree)
  }, [tree, expandedIds, collapseAll])

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter roles..."
            className="w-full h-8 rounded-lg border border-white/5 bg-white/[0.03] pl-8 pr-3 text-xs text-white outline-none placeholder:text-white/20 focus:border-white/10 transition-all"
          />
        </div>
        <button
          onClick={expandAll}
          className="rounded-lg border border-white/5 px-2.5 py-1 text-[10px] text-white/40 hover:text-white hover:border-white/10 transition-all"
        >
          <Plus className="h-3 w-3 inline mr-1" />
          Expand All
        </button>
        <button
          onClick={collapseAllFn}
          className="rounded-lg border border-white/5 px-2.5 py-1 text-[10px] text-white/40 hover:text-white hover:border-white/10 transition-all"
        >
          <Minus className="h-3 w-3 inline mr-1" />
          Collapse All
        </button>
        <div className="text-[10px] text-white/20">
          {roles.length} roles · {roles.filter((r) => r.isEnabled).length} enabled
        </div>
      </div>

      {/* Tree */}
      <div className="space-y-1">
        {treeWithState.length > 0 ? (
          treeWithState.map((node) => (
            <TreeNodeRow
              key={node.role.id}
              node={node}
              selectedId={selectedId}
              onSelect={onSelect}
              onToggle={handleToggle}
              searchQuery={searchQuery}
            />
          ))
        ) : (
          <div className="text-center py-8">
            <Users className="h-6 w-6 text-white/10 mx-auto mb-2" />
            <p className="text-xs text-white/30">No roles match your filter</p>
          </div>
        )}
      </div>
    </div>
  )
}
