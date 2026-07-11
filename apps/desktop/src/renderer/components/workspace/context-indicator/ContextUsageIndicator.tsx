import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"

const MAX_BUDGET = 100_000

export function ContextUsageIndicator() {
  const tokenUsage = useWorkspaceRuntime((s) => s.tokenUsage)
  const memoryPressure = useWorkspaceRuntime((s) => s.memoryPressure)

  const used = tokenUsage ?? 0
  const pct = Math.min(100, Math.round((used / MAX_BUDGET) * 100))
  const pressure = memoryPressure ?? 0

  if (used === 0) return null

  const color =
    pressure > 80
      ? "bg-red-500"
      : pressure > 60
        ? "bg-yellow-500"
        : pressure > 30
          ? "bg-blue-500"
          : "bg-green-500"

  const label =
    pressure > 80
      ? "Critical"
      : pressure > 60
        ? "High"
        : pressure > 30
          ? "Moderate"
          : "Low"

  return (
    <div className="group relative flex items-center gap-1.5 px-2 py-1">
      <div className="flex items-center gap-1">
        <div className="h-1.5 w-16 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${color}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[9px] text-white/30 font-medium">{pct}%</span>
      </div>

      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-50">
        <div className="rounded-lg border border-white/[0.08] bg-[#121214] shadow-xl px-2.5 py-1.5 whitespace-nowrap">
          <div className="text-[10px] font-medium text-white/70">Context Usage</div>
          <div className="text-[9px] text-white/40 mt-0.5">
            {used.toLocaleString()} / {MAX_BUDGET.toLocaleString()} tokens
          </div>
          <div className="flex items-center gap-1 mt-1">
            <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
            <span className="text-[9px] text-white/40">{label} pressure</span>
          </div>
        </div>
      </div>
    </div>
  )
}
