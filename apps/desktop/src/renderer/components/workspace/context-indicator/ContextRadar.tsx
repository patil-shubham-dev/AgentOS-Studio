import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { Files, FileCode, Pin, GitBranch, AlertTriangle, Brain, Layers, Database, X } from "lucide-react"
import type { ContextPack, ContextSource, ContextSourceType } from "@/runtime/context/ContextPackBuilder"

const MAX_BUDGET = 100_000

const SOURCE_CONFIG: Record<string, { label: string; color: string }> = {
  system_prompt: { label: "System", color: "#6b7280" },
  explicit_file: { label: "File", color: "#5B9BFF" },
  open_file: { label: "Open", color: "#22d3ee" },
  pinned_file: { label: "Pinned", color: "#fbbf24" },
  git_diff: { label: "Git", color: "#34d399" },
  diagnostics: { label: "Issues", color: "#f87171" },
  memory: { label: "Memory", color: "#a78bfa" },
  workspace_summary: { label: "Workspace", color: "#6b7280" },
  execution_scratchpad: { label: "Scratchpad", color: "#6b7280" },
  search_result: { label: "Search", color: "#6b7280" },
  recent_file: { label: "Recent", color: "#6b7280" },
}

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function RadarArc({
  radius, thickness, progress, color, delay, label,
}: {
  radius: number
  thickness: number
  progress: number
  color: string
  delay: number
  label: string
}) {
  const circumference = 2 * Math.PI * radius
  const dashLength = circumference * progress
  return (
    <motion.circle
      cx="20" cy="20"
      r={radius}
      fill="none"
      stroke={color}
      strokeWidth={thickness}
      strokeLinecap="round"
      strokeDasharray={`${dashLength} ${circumference - dashLength}`}
      transform="rotate(-90, 20, 20)"
      initial={{ strokeDasharray: `0 ${circumference}` }}
      animate={{ strokeDasharray: `${dashLength} ${circumference - dashLength}` }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.32, 1] }}
      className="drop-shadow-[0_0_4px_rgba(91,155,255,0.1)]"
    />
  )
}

function SourceDot({ cx, cy, color, active }: { cx: number; cy: number; color: string; active: boolean }) {
  return (
    <motion.circle
      cx={cx} cy={cy} r="2"
      fill={color}
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: active ? 0.8 : 0.2,
        scale: active ? 1 : 0.6,
      }}
      transition={{ duration: 0.3 }}
    />
  )
}

export function ContextRadar() {
  const tokenUsage = useWorkspaceRuntime((s) => s.tokenUsage)
  const memoryPressure = useWorkspaceRuntime((s) => s.memoryPressure)
  const [expanded, setExpanded] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const used = tokenUsage ?? 0
  const pct = Math.min(100, Math.round((used / MAX_BUDGET) * 100))
  const pressure = memoryPressure ?? 0

  const danger = pressure > 80
  const warn = pressure > 50

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(false)
      }
    }
    if (expanded) {
      document.addEventListener("mousedown", handleClick)
      return () => document.removeEventListener("mousedown", handleClick)
    }
  }, [expanded])

  const segments = [
    { label: "Used", progress: pct / 100, color: danger ? "#f87171" : warn ? "#fbbf24" : "#5B9BFF", delay: 0 },
  ]

  if (used === 0) return null

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition-all",
          expanded ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
        )}
      >
        <div className="relative h-4 w-4 shrink-0">
          <svg viewBox="0 0 40 40" fill="none" className="h-full w-full">
            <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3" />
            {segments.map((s, i) => (
              <RadarArc key={i} radius={16} thickness={3} progress={s.progress} color={s.color} delay={s.delay} label={s.label} />
            ))}
            <circle cx="20" cy="20" r="4" fill="rgba(255,255,255,0.06)" />
            <text
              x="20" y="20"
              textAnchor="middle"
              dominantBaseline="central"
              fill="rgba(255,255,255,0.5)"
              fontSize="7"
              fontFamily="monospace"
            >
              {pct}
            </text>
          </svg>
          {danger && (
            <motion.span
              className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-red-400"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
        </div>
        <motion.span
          className={cn(
            "text-[9px] font-mono tabular-nums",
            danger ? "text-red-400" : warn ? "text-amber-400" : "text-white/40",
          )}
          animate={{ opacity: 1 }}
        >
          {pct}%
        </motion.span>
      </button>

      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.32, 1] }}
            className="absolute top-full right-0 mt-1 w-64 rounded-xl border border-white/[0.08] bg-[#121214] shadow-2xl overflow-hidden z-50"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
              <span className="text-[10px] font-medium text-white/50">Context Budget</span>
              <button
                onClick={() => setExpanded(false)}
                className="rounded p-0.5 text-white/20 hover:text-white/50 transition-all"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="px-3 py-2 space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-white/40">Used</span>
                <span className="text-white/70 font-mono">{fmt(used)} tok</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-white/40">Budget</span>
                <span className="text-white/70 font-mono">{fmt(MAX_BUDGET)} tok</span>
              </div>
              <div className="h-px bg-white/[0.04] my-1" />
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-white/40">Pressure</span>
                <span className={cn(
                  "font-mono",
                  danger ? "text-red-400" : warn ? "text-amber-400" : "text-emerald-400",
                )}>
                  {pressure}%
                </span>
              </div>
              {danger && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/15 px-2 py-1.5 text-[9px] text-red-400/80 mt-1">
                  Consider compacting context or starting a new session
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
