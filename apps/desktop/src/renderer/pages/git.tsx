import { GitPanel } from "@/components/workspace/git-panel"
import { GitBranch } from "lucide-react"
import { useLeakTracker } from "@/performance/leak-detector"

export function GitPage() {
  useLeakTracker("GitPage")
  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0b]">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/10 border border-white/10">
              <GitBranch className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Git</h1>
              <p className="text-sm text-white/40 mt-0.5">
                Version control, commit history, and branch management
              </p>
            </div>
          </div>
        </div>
        <GitPanel />
      </div>
    </div>
  )
}
