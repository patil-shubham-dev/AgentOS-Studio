import { useState, useEffect, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { loadHistory, restoreHistoryEntry, type HistoryEntry } from "@/components/workspace/timeline/chat-persistence"
import { Search, History, RotateCcw, Clock, Play, StepForward, ChevronRight, MessageSquare, FileText, Activity, Bot } from "lucide-react"

export function ChatHistoryViewer() {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [replaying, setReplaying] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    setEntries(loadHistory())
  }, [])

  const filtered = useMemo(() => {
    if (!search) return entries
    const q = search.toLowerCase()
    return entries.filter((e) => e.title.toLowerCase().includes(q))
  }, [entries, search])

  const handleRestore = useCallback((entry: HistoryEntry) => {
    restoreHistoryEntry(entry)
    window.location.reload()
  }, [])

  const handleReplay = useCallback((entry: HistoryEntry) => {
    setSelected(entry.id)
    setReplaying(true)
    setStepIndex(0)
  }, [])

  const handleStepForward = useCallback(() => {
    const entry = entries.find((e) => e.id === selected)
    if (!entry) return
    const eventCount = entry.state.events?.length ?? 0
    if (stepIndex < eventCount) {
      setStepIndex((i) => i + 1)
    }
  }, [selected, entries, stepIndex])

  const selectedEntry = entries.find((e) => e.id === selected)

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06]">
        <History className="h-4 w-4 text-blue-400" />
        <span className="text-sm font-medium text-white/70">Chat History</span>
        <span className="text-[10px] text-white/20 ml-auto">{entries.length} session{entries.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-white/[0.06]">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search history..."
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded pl-7 pr-2 py-1.5 text-[11px] text-white/70 outline-none placeholder-white/20 focus:border-blue-500/40 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <History className="h-8 w-8 mx-auto mb-2 text-white/10" />
            <p className="text-xs text-white/20">No history found</p>
            <p className="text-[10px] text-white/10 mt-1">Past chat sessions appear here</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            <AnimatePresence mode="popLayout">
              {filtered.map((entry) => {
                const eventCount = entry.state.events?.length ?? 0
                const sessionCount = entry.state.agentSessions?.length ?? 0
                const isSelected = selected === entry.id

                return (
                  <motion.div
                    key={entry.id}
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "rounded-lg border p-2.5 transition-all cursor-pointer",
                      isSelected
                        ? "border-blue-500/20 bg-blue-500/[0.04]"
                        : "border-white/[0.06] hover:border-white/[0.1] bg-white/[0.02]",
                    )}
                    onClick={() => setSelected(isSelected ? null : entry.id)}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
                        <MessageSquare className="h-3.5 w-3.5 text-white/30" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-white/60 truncate">{entry.title}</div>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-white/25">
                          <Clock className="h-2.5 w-2.5" />
                          <span>{new Date(entry.timestamp).toLocaleString()}</span>
                          <span className="text-white/15">·</span>
                          <span>{eventCount} events</span>
                          {sessionCount > 0 && (
                            <>
                              <span className="text-white/15">·</span>
                              <span>{sessionCount} agent sessions</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        className="mt-2 pt-2 border-t border-white/[0.06] space-y-1.5"
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRestore(entry) }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px] text-blue-400/60 hover:text-blue-400 hover:bg-blue-500/[0.06] transition-colors"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Restore this session
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReplay(entry) }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px] text-amber-400/60 hover:text-amber-400 hover:bg-amber-500/[0.06] transition-colors"
                        >
                          <Play className="h-3 w-3" />
                          Replay session
                        </button>
                        {replaying && isSelected && selectedEntry && (
                          <div className="mt-2 p-2 rounded bg-white/[0.03] border border-white/[0.06]">
                            <div className="flex items-center gap-2 text-[10px] text-white/30 mb-2">
                              <Activity className="h-2.5 w-2.5" />
                              Step {stepIndex} of {selectedEntry.state.events?.length ?? 0}
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleStepForward() }}
                              disabled={stepIndex >= (selectedEntry.state.events?.length ?? 0)}
                              className="flex items-center gap-1.5 text-[11px] text-blue-400/60 hover:text-blue-400 disabled:text-white/10 disabled:cursor-not-allowed"
                            >
                              <StepForward className="h-3 w-3" />
                              Next step
                            </button>
                            {selectedEntry.state.events?.[stepIndex] && (
                              <div className="mt-2 text-[10px] text-white/40 font-mono break-all max-h-20 overflow-y-auto">
                                {JSON.stringify(selectedEntry.state.events[stepIndex], null, 2)}
                              </div>
                            )}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
