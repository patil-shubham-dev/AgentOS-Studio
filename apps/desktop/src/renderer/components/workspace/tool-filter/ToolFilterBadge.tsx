import { useState, useRef, useEffect } from "react"
import { useToolFilterStore } from "@/stores/tool-filter-store"
import { cn } from "@/lib/utils"
import { Filter, ChevronDown, CheckCircle2, XCircle, ChevronRight, Wrench } from "lucide-react"

export function ToolFilterBadge() {
  const latest = useToolFilterStore((s) => s.latest)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  if (!latest || latest.totalAvailable === 0) return null

  const filteredPct = latest.totalAvailable > 0
    ? Math.round((latest.totalFiltered / latest.totalAvailable) * 100)
    : 0

  const isActive = latest.totalFiltered > 0

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium transition-all",
          isActive
            ? "text-cyan-400 border-cyan-500/20 bg-cyan-500/8 hover:bg-cyan-500/12"
            : "text-white/30 border-white/[0.06] hover:text-white/50 hover:bg-white/[0.03]",
        )}
        title={`${latest.totalExposed} of ${latest.totalAvailable} tools exposed (${latest.totalFiltered} filtered)`}
      >
        <Filter className="h-2.5 w-2.5" />
        <span>{latest.totalExposed}/{latest.totalAvailable}</span>
        <ChevronDown className={cn("h-2 w-2 transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown detail */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 rounded-lg border border-white/[0.08] bg-[#0f0f10] shadow-xl shadow-black/40 overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
            <span className="text-[9px] font-medium text-white/30 uppercase tracking-wider">
              Tool Filtering
            </span>
          </div>

          <div className="p-3 space-y-2">
            {/* Stats row */}
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-white/40">Available</span>
              <span className="text-white/70 font-mono font-medium">{latest.totalAvailable}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-white/40">Exposed</span>
              <span className="text-green-400 font-mono font-medium">{latest.totalExposed}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-white/40">Filtered</span>
              <span className={cn("font-mono font-medium", filteredPct > 0 ? "text-cyan-400" : "text-white/30")}>
                {latest.totalFiltered} ({filteredPct}%)
              </span>
            </div>

            {/* Visual bar */}
            <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-cyan-500 rounded-full transition-all"
                style={{
                  width: `${latest.totalAvailable > 0 ? (latest.totalExposed / latest.totalAvailable) * 100 : 0}%`,
                }}
              />
            </div>

            {/* Token savings estimate */}
            {latest.totalFiltered > 0 && (
              <div className="flex items-center justify-between pt-1 border-t border-white/[0.06]">
                <span className="text-[9px] text-white/30 flex items-center gap-1">
                  <Filter className="h-2.5 w-2.5 text-cyan-400/60" />
                  Est. token savings
                </span>
                <span className="text-[9px] font-mono font-medium text-green-400">
                  ~{latest.totalFiltered * 150} tok/round
                </span>
              </div>
            )}

            {/* Always-load vs relevance breakdown hint */}
            <div className="pt-1 space-y-1">
              <div className="flex items-center gap-1.5 text-[9px] text-white/25">
                <CheckCircle2 className="h-2.5 w-2.5 text-green-400/60" />
                Always-load tools always included
              </div>
              <div className="flex items-center gap-1.5 text-[9px] text-white/25">
                <Filter className="h-2.5 w-2.5 text-cyan-400/60" />
                Relevance-matched keywords drive filtering
              </div>
            </div>

            {/* Exposed tool list */}
            {latest.exposedTools.length > 0 && (
              <ToolList names={latest.exposedTools} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Collapsible list of exposed tool names */
function ToolList({ names }: { names: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? names : names.slice(0, 8)
  const remaining = names.length - 8

  return (
    <div className="border-t border-white/[0.06] pt-2 mt-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-[9px] text-white/30 hover:text-white/50 transition-colors mb-1.5"
      >
        <ChevronRight
          className={cn("h-2.5 w-2.5 transition-transform", expanded && "rotate-90")}
        />
        <Wrench className="h-2.5 w-2.5" />
        <span className="font-medium">
          Exposed Tools ({names.length})
        </span>
      </button>

      <div className="flex flex-wrap gap-1">
        {visible.map((name) => (
          <span
            key={name}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.05] text-[8px] font-mono text-white/55"
          >
            {name}
          </span>
        ))}
        {!expanded && remaining > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-mono text-cyan-400/60 hover:text-cyan-400 hover:bg-cyan-500/5 transition-colors"
          >
            +{remaining} more
          </button>
        )}
      </div>
    </div>
  )
}
