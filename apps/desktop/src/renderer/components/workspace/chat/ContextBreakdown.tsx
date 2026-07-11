import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Files, FileCode, Pin, GitBranch, AlertTriangle, Brain, Layers, Database, ChevronRight, ChevronDown } from "lucide-react"
import type { ContextPack, ContextSource, ContextSourceType } from "@/runtime/context/ContextPackBuilder"

const SOURCE_CONFIG: Record<ContextSourceType, { icon: typeof Files; color: string; bg: string; label: string }> = {
  system_prompt: { icon: Layers, color: "text-white/40", bg: "bg-white/[0.04]", label: "System" },
  explicit_file: { icon: FileCode, color: "text-blue-400", bg: "bg-blue-500/10", label: "File" },
  open_file: { icon: FileCode, color: "text-cyan-400", bg: "bg-cyan-500/10", label: "Open" },
  pinned_file: { icon: Pin, color: "text-amber-400", bg: "bg-amber-500/10", label: "Pinned" },
  git_diff: { icon: GitBranch, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Git" },
  diagnostics: { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10", label: "Issues" },
  memory: { icon: Database, color: "text-purple-400", bg: "bg-purple-500/10", label: "Memory" },
  workspace_summary: { icon: Layers, color: "text-white/40", bg: "bg-white/[0.04]", label: "Workspace" },
  execution_scratchpad: { icon: Brain, color: "text-white/40", bg: "bg-white/[0.04]", label: "Scratchpad" },
  search_result: { icon: Files, color: "text-white/40", bg: "bg-white/[0.04]", label: "Search" },
  recent_file: { icon: FileCode, color: "text-white/40", bg: "bg-white/[0.04]", label: "Recent" },
}

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function usagePercent(used: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((used / total) * 100)
}

function SourceRow({ source }: { source: ContextSource }) {
  const cfg = SOURCE_CONFIG[source.type] ?? SOURCE_CONFIG.system_prompt
  const Icon = cfg.icon
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-[10px]">
      <Icon className={`h-3 w-3 shrink-0 ${cfg.color}`} />
      <span className={`text-white/50 min-w-[2rem] ${cfg.color}`}>{cfg.label}</span>
      <span className="text-white/70 truncate flex-1">{source.path ?? source.reason}</span>
      <span className="text-white/30 font-mono tabular-nums">{fmt(source.tokenCount)} tok</span>
      <div className="w-12 h-1 bg-white/[0.06] rounded-full overflow-hidden shrink-0">
        <div
          className="h-full rounded-full bg-white/20 transition-all"
          style={{ width: `${Math.min(source.relevance * 100, 100)}%` }}
        />
      </div>
    </div>
  )
}

interface ContextBreakdownProps {
  pack: ContextPack
}

export function ContextBreakdown({ pack }: ContextBreakdownProps) {
  const [open, setOpen] = useState(false)
  const pct = usagePercent(pack.totalTokens, pack.tokenBudget)
  const groups = groupSources(pack.sources)

  return (
    <div className="border-t border-white/[0.04]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[9px] text-white/30 hover:text-white/50 transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Files className="h-3 w-3" />
        <span>Context</span>
        <span className="font-mono">{pack.sources.length} sources</span>
        <span className="font-mono text-white/20">{fmt(pack.totalTokens)} / {fmt(pack.tokenBudget)} tok</span>
        <div className="flex-1 h-px bg-gradient-to-r from-white/[0.04] to-transparent" />
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct > 50 ? "bg-amber-400/60" : pct > 80 ? "bg-red-400/60" : "bg-white/20"}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <span className="font-mono text-[8px]">{pct}%</span>
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {groups.map(([type, sources]) => (
              <div key={type}>
                {sources.map((s, i) => (
                  <SourceRow key={`${type}-${i}`} source={s} />
                ))}
              </div>
            ))}
            {pack.remainingTokens > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 text-[9px] text-white/20">
                <span className="font-mono">{fmt(pack.remainingTokens)} tok remaining</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function groupSources(sources: ContextSource[]): [ContextSourceType, ContextSource[]][] {
  const groups = new Map<ContextSourceType, ContextSource[]>()
  for (const s of sources) {
    const arr = groups.get(s.type)
    if (arr) arr.push(s)
    else groups.set(s.type, [s])
  }
  const order: ContextSourceType[] = ["system_prompt", "explicit_file", "open_file", "pinned_file", "diagnostics", "git_diff", "memory", "workspace_summary", "execution_scratchpad", "search_result", "recent_file"]
  return order.filter((t) => groups.has(t)).map((t) => [t, groups.get(t)!])
}
