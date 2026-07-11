import { LogsTab } from "@/components/settings/logs-tab"
import { ScrollText } from "lucide-react"
import { useLeakTracker } from "@/performance/leak-detector"

export function LogsPage() {
  useLeakTracker("LogsPage")
  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0b]">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-white/10">
              <ScrollText className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Logs</h1>
              <p className="text-sm text-white/40 mt-0.5">
                System logs, execution traces, and activity history
              </p>
            </div>
          </div>
        </div>
        <LogsTab />
      </div>
    </div>
  )
}
