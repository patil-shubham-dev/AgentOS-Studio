import { useMemo, useState, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import type { AgentRoleConfig } from "@/types"
import { Badge } from "@agentic-os/ui"
import {
  ZoomIn, ZoomOut, RotateCcw, Brain, Code2, Eye, Search,
  Terminal, Globe, Zap, CheckCircle2, Palette, Users,
  Maximize2, Minimize2,
} from "lucide-react"

const ROLE_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  manager: { fill: "#f59e0b20", stroke: "#f59e0b", text: "#fbbf24" },
  coder: { fill: "#3b82f620", stroke: "#3b82f6", text: "#60a5fa" },
  vision: { fill: "#ec489920", stroke: "#ec4899", text: "#f472b6" },
  research: { fill: "#8b5cf620", stroke: "#8b5cf6", text: "#a78bfa" },
  runtime: { fill: "#06b6d420", stroke: "#06b6d4", text: "#22d3ee" },
  design: { fill: "#a855f720", stroke: "#a855f7", text: "#c084fc" },
  "fast-inference": { fill: "#10b98120", stroke: "#10b981", text: "#34d399" },
  browser: { fill: "#0ea5e920", stroke: "#0ea5e9", text: "#38bdf8" },
  qa: { fill: "#22c55e20", stroke: "#22c55e", text: "#4ade80" },
  memory: { fill: "#6366f120", stroke: "#6366f1", text: "#818cf8" },
}

const ROLE_ICONS: Record<string, typeof Brain> = {
  manager: Brain, coder: Code2, vision: Eye, research: Search,
  runtime: Terminal, design: Palette, "fast-inference": Zap,
  browser: Globe, qa: CheckCircle2, memory: Brain,
}

const NODE_RADIUS = 28
const LEVEL_HEIGHT = 110
const NODE_WIDTH = 160

interface Node {
  id: string
  role: AgentRoleConfig
  x: number
  y: number
  vx: number
  vy: number
  icon: typeof Brain
}

interface Edge {
  source: string
  target: string
  type: "parent-child" | "collaboration"
}

interface RoleDependencyGraphProps {
  roles: AgentRoleConfig[]
  onSelect: (role: AgentRoleConfig) => void
  selectedId: string | null
}

function generateGraphLayout(roles: AgentRoleConfig[]): { nodes: Node[]; edges: Edge[] } {
  const roleMap = new Map(roles.map((r) => [r.id, r]))

  // Build edges from parentRole
  const edges: Edge[] = []
  roles.forEach((r) => {
    if (r.parentRole && roleMap.has(r.parentRole)) {
      edges.push({ source: r.parentRole, target: r.id, type: "parent-child" })
    }
  })

  // Build edges from collaboration tags
  const tagGroups = new Map<string, AgentRoleConfig[]>()
  roles.forEach((r) => {
    r.collaborationTags.forEach((tag) => {
      const group = tagGroups.get(tag) || []
      group.push(r)
      tagGroups.set(tag, group)
    })
  })

  // Connect roles that share collaboration tags (limit to avoid clutter)
  tagGroups.forEach((group) => {
    if (group.length >= 2 && group.length <= 4) {
      for (let i = 0; i < group.length - 1; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const edgeExists = edges.some(
            (e) =>
              (e.source === group[i].id && e.target === group[j].id) ||
              (e.source === group[j].id && e.target === group[i].id),
          )
          if (!edgeExists) {
            edges.push({ source: group[i].id, target: group[j].id, type: "collaboration" })
          }
        }
      }
    }
  })

  // Level-based layout
  const levels = new Map<number, AgentRoleConfig[]>()
  const visited = new Set<string>()

  function assignDepth(roleId: string, depth: number) {
    if (visited.has(roleId)) return
    visited.add(roleId)
    const existing = levels.get(depth) || []
    const role = roleMap.get(roleId)
    if (role) existing.push(role)
    levels.set(depth, existing)

    roles
      .filter((r) => r.parentRole === roleId)
      .forEach((child) => assignDepth(child.id, depth + 1))
  }

  // Start from roots (no parent)
  roles
    .filter((r) => !r.parentRole || !roleMap.has(r.parentRole))
    .sort((a, b) => a.priority - b.priority)
    .forEach((r) => assignDepth(r.id, 0))

  // Unassigned (cyclic or orphaned) go to level 0
  roles.forEach((r) => {
    if (!visited.has(r.id)) {
      const existing = levels.get(0) || []
      existing.push(r)
      levels.set(0, existing)
    }
  })

  const nodes: Node[] = []
  const maxInLevel = Math.max(...Array.from(levels.keys()).map((l) => (levels.get(l) || []).length))

  levels.forEach((levelRoles, depth) => {
    const count = levelRoles.length
    const totalWidth = Math.max(count, 1) * NODE_WIDTH
    levelRoles.forEach((role, i) => {
      const x = i * NODE_WIDTH - totalWidth / 2 + NODE_WIDTH / 2
      const y = depth * LEVEL_HEIGHT
      const Icon = ROLE_ICONS[role.runtimeRole ?? role.id.split("-")[1]] || Users
      nodes.push({ id: role.id, role, x, y, vx: 0, vy: 0, icon: Icon })
    })
  })

  // Center the graph
  const minX = Math.min(...nodes.map((n) => n.x))
  const maxX = Math.max(...nodes.map((n) => n.x))
  const offsetX = -(minX + maxX) / 2
  nodes.forEach((n) => { n.x += offsetX; n.y += 30 })

  return { nodes, edges }
}

export function RoleDependencyGraph({ roles, onSelect, selectedId }: RoleDependencyGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)

  const { nodes, edges } = useMemo(() => generateGraphLayout(roles), [roles])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((z) => Math.max(0.3, Math.min(3, z * delta)))
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as SVGElement).tagName === "svg") {
      setIsDragging(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }, [pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
    }
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  // Highlight edges connected to hovered node
  const connectedEdges = useMemo(() => {
    if (!hoveredNode) return new Set<string>()
    const connected = new Set<string>()
    edges.forEach((e) => {
      if (e.source === hoveredNode || e.target === hoveredNode) {
        connected.add(`${e.source}->${e.target}`)
      }
    })
    return connected
  }, [hoveredNode, edges])

  const svgWidth = fullscreen ? window.innerWidth - 48 : 800
  const svgHeight = fullscreen ? window.innerHeight - 48 : 500

  if (roles.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] rounded-2xl border border-dashed border-white/5 bg-white/[0.01]">
        <div className="text-center">
          <Users className="h-8 w-8 text-white/10 mx-auto mb-2" />
          <p className="text-xs text-white/30">No roles to visualize</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("relative", fullscreen ? "fixed inset-4 z-50" : "")}>
      {/* Controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-xl border border-white/5 bg-black/60 backdrop-blur-xl p-1">
        <button
          onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
          className="rounded-lg p-1.5 text-white/40 hover:text-white hover:bg-white/5 transition-all"
          title="Zoom in"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <span className="text-[10px] text-white/30 w-8 text-center">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))}
          className="rounded-lg p-1.5 text-white/40 hover:text-white hover:bg-white/5 transition-all"
          title="Zoom out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <button
          onClick={resetView}
          className="rounded-lg p-1.5 text-white/40 hover:text-white hover:bg-white/5 transition-all"
          title="Reset view"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setFullscreen(!fullscreen)}
          className="rounded-lg p-1.5 text-white/40 hover:text-white hover:bg-white/5 transition-all"
          title={fullscreen ? "Minimize" : "Fullscreen"}
        >
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded-xl border border-white/5 bg-black/60 backdrop-blur-xl px-3 py-2">
        <div className="flex items-center gap-1.5">
          <div className="h-px w-4 bg-blue-400/60" />
          <span className="text-[9px] text-white/40">Parent-child</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-px w-4 border-t border-dashed border-purple-400/40" />
          <span className="text-[9px] text-white/40">Collaboration</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-green-400/60 bg-green-400/10" />
          <span className="text-[9px] text-white/40">Selected</span>
        </div>
      </div>

      {/* SVG */}
      <svg
        ref={svgRef}
        width={svgWidth}
        height={svgHeight}
        className={cn(
          "w-full rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.01] to-white/[0.005]",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <g transform={`translate(${pan.x + svgWidth / 2}, ${pan.y + svgHeight / 2}) scale(${zoom})`}>
          {/* Edges */}
          {edges.map((edge) => {
            const source = nodes.find((n) => n.id === edge.source)
            const target = nodes.find((n) => n.id === edge.target)
            if (!source || !target) return null

            const edgeKey = `${edge.source}->${edge.target}`
            const isHighlighted = connectedEdges.has(edgeKey) || hoveredNode === edge.source || hoveredNode === edge.target

            return (
              <g key={edgeKey}>
                {/* Glow line */}
                {isHighlighted && (
                  <line
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={edge.type === "parent-child" ? "#3b82f6" : "#a855f7"}
                    strokeOpacity={0.3}
                    strokeWidth={4}
                    strokeLinecap="round"
                  />
                )}
                {/* Main line */}
                <line
                  x1={source.x}
                  y1={source.y + NODE_RADIUS}
                  x2={target.x}
                  y2={target.y - NODE_RADIUS}
                  stroke={edge.type === "parent-child" ? "#3b82f680" : "#a855f740"}
                  strokeWidth={isHighlighted ? 2 : 1}
                  strokeDasharray={edge.type === "collaboration" ? "4,3" : "none"}
                  strokeLinecap="round"
                  className="transition-all duration-200"
                />
                {/* Arrowhead */}
                <polygon
                  points={`${target.x - 4},${target.y - NODE_RADIUS - 8} ${target.x + 4},${target.y - NODE_RADIUS - 8} ${target.x},${target.y - NODE_RADIUS}`}
                  fill={edge.type === "parent-child" ? "#3b82f680" : "#a855f740"}
                  opacity={isHighlighted ? 1 : 0.6}
                />
              </g>
            )
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const Icon = node.icon
            const colors = ROLE_COLORS[node.role.runtimeRole ?? node.role.id.split("-")[1]] || ROLE_COLORS.manager
            const isSelected = selectedId === node.role.id
            const isHovered = hoveredNode === node.id

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => onSelect(node.role)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer"
                style={{ cursor: "pointer" }}
              >
                {/* Selection glow */}
                {(isSelected || isHovered) && (
                  <circle
                    r={NODE_RADIUS + 8}
                    fill="none"
                    stroke={isSelected ? "#3b82f6" : "#ffffff40"}
                    strokeWidth={2}
                    opacity={isSelected ? 0.8 : 0.4}
                  >
                    {isSelected && (
                      <animate attributeName="r" values={`${NODE_RADIUS + 8};${NODE_RADIUS + 12};${NODE_RADIUS + 8}`} dur="2s" repeatCount="indefinite" />
                    )}
                  </circle>
                )}

                {/* Node circle */}
                <circle
                  r={NODE_RADIUS}
                  fill={colors.fill}
                  stroke={isSelected ? "#3b82f6" : isHovered ? "#ffffff60" : colors.stroke}
                  strokeWidth={isSelected || isHovered ? 2.5 : 1.5}
                  className="transition-all duration-200"
                />

                {/* Icon */}
                <foreignObject x={-12} y={-12} width={24} height={24}>
                  <div className="flex items-center justify-center w-full h-full">
                    <Icon className="h-4 w-4" style={{ color: colors.text }} />
                  </div>
                </foreignObject>

                {/* Label */}
                <text
                  x={0}
                  y={NODE_RADIUS + 16}
                  textAnchor="middle"
                  fill={isSelected ? "#ffffff" : isHovered ? "#ffffff80" : "#ffffff60"}
                  fontSize={11}
                  fontWeight={isSelected ? 600 : 400}
                  className="transition-all duration-200"
                >
                  {node.role.name.length > 14 ? node.role.name.slice(0, 13) + "…" : node.role.name}
                </text>

                {/* Status dot */}
                <circle
                  cx={NODE_RADIUS - 4}
                  cy={-NODE_RADIUS + 4}
                  r={4}
                  fill={
                    node.role.runtimeState === "executing" ? "#22c55e" :
                    node.role.runtimeState === "thinking" ? "#3b82f6" :
                    node.role.runtimeState === "failed" ? "#ef4444" :
                    node.role.runtimeState === "planning" ? "#f59e0b" :
                    "#ffffff20"
                  }
                  stroke="#00000040"
                  strokeWidth={1}
                >
                  {(node.role.runtimeState === "executing" || node.role.runtimeState === "thinking") && (
                    <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
                  )}
                </circle>
              </g>
            )
          })}
        </g>
      </svg>

      {/* Tooltip for hovered node */}
      <AnimatePresence>
        {hoveredNode && nodes.find((n) => n.id === hoveredNode) && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute top-3 left-3 rounded-xl border border-white/10 bg-black/80 backdrop-blur-2xl px-3 py-2 shadow-2xl max-w-[220px]"
          >
            {(() => {
              const node = nodes.find((n) => n.id === hoveredNode)
              if (!node) return null
              return (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-white">{node.role.name}</span>
                    {node.role.runtimeState && (
                      <span className={cn(
                        "text-[9px] font-medium",
                        node.role.runtimeState === "executing" ? "text-green-400" :
                        node.role.runtimeState === "failed" ? "text-red-400" :
                        "text-white/40",
                      )}>{node.role.runtimeState}</span>
                    )}
                  </div>
                  <p className="text-[10px] text-white/40 leading-relaxed">{node.role.description}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {node.role.model && (
                      <Badge variant="success" size="sm">{node.role.model.split("/").pop()}</Badge>
                    )}
                    {node.role.parentRole && (
                      <Badge variant="info" size="sm">child of {roles.find((r) => r.id === node.role.parentRole)?.name || node.role.parentRole}</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {node.role.collaborationTags.slice(0, 3).map((tag) => (
                      <span key={tag} className="text-[8px] text-purple-300/60 font-mono">#{tag}</span>
                    ))}
                  </div>
                </>
              )
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
