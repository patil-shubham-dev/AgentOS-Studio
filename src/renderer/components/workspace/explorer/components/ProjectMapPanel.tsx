import { useState, useEffect, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Network, ChevronDown, ChevronRight, FileCode, GitBranch, Package, Layers, Hash, ArrowLeft, ArrowRight, GitFork } from "lucide-react"
import { getProjectMap, getArchitectureMap, getDependencyGraph, type ProjectMap, type ArchitectureMap } from "@/lib/workspace-intelligence"
import type { DependencyGraph } from "@/lib/dependency-scanner"
import { cn } from "@/lib/utils"
import { getSpringConfig } from "@/lib/motion"

function ProjectMapContent({ projectMap }: { projectMap: ProjectMap }) {
  const [expanded, setExpanded] = useState(true)
  const [archExpanded, setArchExpanded] = useState(false)
  const [archMap, setArchMap] = useState<ArchitectureMap | null>(null)

  useEffect(() => {
    if (archExpanded && !archMap) {
      setArchMap(getArchitectureMap())
    }
  }, [archExpanded, archMap])

  const symbolKinds = Object.entries(projectMap.symbolCountByKind)
    .sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-2 py-1">
      <div className="px-2 space-y-1">
        <div className="flex items-center gap-2 text-[10px] text-white/40">
          <FileCode className="h-3 w-3" />
          <span>{projectMap.totalFiles} files</span>
        </div>
        {symbolKinds.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {symbolKinds.slice(0, 6).map(([kind, count]) => (
              <span
                key={kind}
                className="inline-flex items-center gap-1 rounded bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-white/30"
              >
                <Hash className="h-2 w-2" />
                {kind} {count}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 text-[10px] text-white/40">
          <GitBranch className="h-3 w-3" />
          <span>{projectMap.totalSymbols} symbols</span>
          <span className="text-white/20">|</span>
          <span>{projectMap.totalEdges} call edges</span>
        </div>
      </div>

      {projectMap.topImported.length > 0 && (
        <div className="px-2">
          <button
            onClick={() => setArchExpanded(!archExpanded)}
            className="flex items-center gap-1 text-[9px] text-white/25 hover:text-white/50 transition-colors"
          >
            {archExpanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
            <Layers className="h-2.5 w-2.5" />
            Architecture
          </button>
          <AnimatePresence>
            {archExpanded && archMap && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={getSpringConfig("gentle")}
                className="mt-1 space-y-1 overflow-hidden"
              >
                {archMap.layers.filter((l) => l.symbols.length > 0).map((layer) => (
                  <div key={layer.name} className="rounded bg-white/[0.02] px-2 py-1">
                    <div className="text-[9px] font-medium text-white/30">{layer.name}</div>
                    <div className="text-[8px] text-white/15">{layer.files.length} files, {layer.symbols.length} symbols</div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {projectMap.topImported.length > 0 && (
        <div className="border-t border-white/[0.04] px-2 pt-1.5">
          <div className="flex items-center gap-1 text-[9px] text-white/25 mb-1">
            <Package className="h-2.5 w-2.5" />
            Most imported
          </div>
          <div className="space-y-0.5">
            {projectMap.topImported.slice(0, 5).map((node) => (
              <div key={node.path} className="flex items-center justify-between text-[9px]">
                <span className="text-white/40 truncate max-w-[140px]">{node.name}</span>
                <span className="text-white/15 shrink-0 ml-1">{node.importedBy.length}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DependencyGraphView({ graph }: { graph: DependencyGraph }) {
  const [expanded, setExpanded] = useState(false)
  const topNodes = useMemo(() => {
    const scored = graph.nodes
      .map((n) => ({ ...n, score: n.importedBy.length + n.imports.length }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
    return scored
  }, [graph])

  const edges = useMemo(() => {
    const inSet = new Set(topNodes.map((n) => n.path))
    return topNodes.flatMap((n) =>
      n.imports.filter((i) => inSet.has(i)).map((i) => ({ from: n.path, to: i }))
    ).slice(0, 20)
  }, [topNodes])

  if (graph.nodes.length === 0) return null

  const CIRCLE_R = 28
  const PADDING = 20
  const W = 260
  const positions = topNodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / topNodes.length - Math.PI / 2
    const cx = W / 2 + Math.cos(angle) * 80
    const cy = 50 + Math.sin(angle) * 40
    return { ...n, cx, cy }
  })

  return (
    <div className="border-t border-white/[0.04] px-2 pt-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[9px] text-white/25 hover:text-white/50 transition-colors"
      >
        {expanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
        <GitFork className="h-2.5 w-2.5" />
        Dependency Graph
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={getSpringConfig("gentle")}
            className="overflow-hidden"
          >
            <svg viewBox={`0 0 ${W} 100`} className="w-full h-24 mt-1">
              {edges.map((e) => {
                const from = positions.find((p) => p.path === e.from)
                const to = positions.find((p) => p.path === e.to)
                if (!from || !to) return null
                return (
                  <line
                    key={`${e.from}-${e.to}`}
                    x1={from.cx} y1={from.cy}
                    x2={to.cx} y2={to.cy}
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="1"
                  />
                )
              })}
              {positions.map((p) => (
                <g key={p.path} className="cursor-pointer">
                  <circle cx={p.cx} cy={p.cy} r="4" fill="rgba(99,102,241,0.5)" />
                  <text
                    x={p.cx} y={p.cy + 12}
                    textAnchor="middle"
                    className="fill-white/30 text-[6px] font-mono"
                  >
                    {p.name.length > 12 ? p.name.slice(0, 10) + ".." : p.name}
                  </text>
                </g>
              ))}
            </svg>
            <div className="text-[8px] text-white/15 text-center pb-1">
              {graph.nodes.length} modules, {graph.edges.length} connections
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function ProjectMapPanel() {
  const [projectMap, setProjectMap] = useState<ProjectMap | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const [depGraph, setDepGraph] = useState<DependencyGraph | null>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const { useWorkspaceStore } = await import("@/stores/workspace-store")
      const rootPath = useWorkspaceStore.getState().rootPath
      if (!rootPath) return
      const map = await getProjectMap(rootPath)
      setProjectMap(map)
      setDepGraph(getDependencyGraph())
    } catch {
      // not initialized
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen && !projectMap && !loading) {
      loadData()
    }
  }, [isOpen, projectMap, loading, loadData])

  return (
    <div className="border-t border-white/[0.06]">
      <button
        onClick={() => {
          setIsOpen(!isOpen)
          if (!isOpen && !projectMap) loadData()
        }}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-[10px] font-medium transition-colors",
          isOpen ? "text-blue-400/70" : "text-white/20 hover:text-white/40"
        )}
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Network className="h-3 w-3" />
        Project Intelligence
        {projectMap && !isOpen && (
          <span className="text-[8px] text-white/15 ml-auto">{projectMap.totalSymbols} symbols</span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={getSpringConfig("gentle")}
            className="overflow-hidden"
          >
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <div className="h-3 w-3 rounded-full border border-white/10 border-t-white/30 animate-spin" />
              </div>
            ) : projectMap ? (
              <>
                <ProjectMapContent projectMap={projectMap} />
                {depGraph && <DependencyGraphView graph={depGraph} />}
              </>
            ) : (
              <div className="px-3 pb-2 text-[10px] text-white/15 italic">
                Open a workspace to see project intelligence
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
