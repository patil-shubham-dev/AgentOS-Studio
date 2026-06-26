import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { useState, useMemo, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"

const ACTIVITY_ICONS: Record<string, string> = {
  reading: "📄",
  searching: "🔍",
  editing: "✏️",
  writing: "📝",
  analyzing: "🔬",
  building: "🏗️",
  verifying: "✅",
  testing: "🧪",
  browsing: "🌐",
  running: "⚡",
  planning: "📋",
  researching: "📚",
}

function inferActivity(toolName: string, args?: Record<string, unknown>): { icon: string; label: string; detail: string } {
  const name = toolName.toLowerCase()
  if (name.includes("read") || name.includes("file")) return { icon: "📄", label: "Reading file", detail: typeof args?.filePath === "string" ? args.filePath : "" }
  if (name.includes("grep") || name.includes("search")) return { icon: "🔍", label: "Searching", detail: typeof args?.pattern === "string" ? args.pattern.slice(0, 60) : "" }
  if (name.includes("write")) return { icon: "📝", label: "Writing file", detail: typeof args?.filePath === "string" ? args.filePath : "" }
  if (name.includes("edit")) return { icon: "✏️", label: "Editing file", detail: typeof args?.filePath === "string" ? args.filePath : "" }
  if (name.includes("list") || name.includes("glob")) return { icon: "📂", label: "Listing files", detail: typeof args?.pattern === "string" ? args.pattern : "" }
  if (name.includes("analyze") || name.includes("impact")) return { icon: "🔬", label: "Analyzing impact", detail: "" }
  if (name.includes("build") || name.includes("compile")) return { icon: "🏗️", label: "Building project", detail: "" }
  if (name.includes("test") || name.includes("check") || name.includes("verify")) return { icon: "🧪", label: "Running checks", detail: "" }
  if (name.includes("browser") || name.includes("navigate")) return { icon: "🌐", label: "Browsing", detail: typeof args?.url === "string" ? args.url.slice(0, 60) : "" }
  if (name.includes("run") || name.includes("command") || name.includes("bash")) return { icon: "⚡", label: "Running command", detail: typeof args?.command === "string" ? args.command.slice(0, 60) : "" }
  return { icon: "⚙️", label: name.replace(/_/g, " "), detail: "" }
}

export function ToolActivityFeed() {
  const agentSessions = useTimelineStore((s) => s.agentSessions)
  const events = useTimelineStore((s) => s.events)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const activities = useMemo(() => {
    const items: Array<{ id: string; toolName: string; args?: Record<string, unknown>; status: string; phase?: string; timestamp: number }> = []
    for (const [, session] of agentSessions) {
      for (const tc of session.toolCalls) {
        items.push({
          id: tc.id ?? `${session.stepId}_${tc.name}_${tc.timestamp}`,
          toolName: tc.name,
          args: tc.args as Record<string, unknown> | undefined,
          status: tc.status ?? "completed",
          phase: session.currentPhase,
          timestamp: tc.timestamp ?? Date.now(),
        })
      }
    }
    items.sort((a, b) => b.timestamp - a.timestamp)
    return items.slice(0, 20)
  }, [agentSessions])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [activities.length, autoScroll])

  if (activities.length === 0) return null

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/[0.06]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Activity</span>
        <span className="text-[10px] text-white/30">{activities.length} action{activities.length !== 1 ? "s" : ""}</span>
      </div>
      <div ref={scrollRef} className="max-h-[200px] overflow-y-auto" onScroll={() => { /* auto-scroll managed */ }}>
        <AnimatePresence initial={false}>
          {activities.map((item) => {
            const { icon, label, detail } = inferActivity(item.toolName, item.args)
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2 px-2 py-1 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]"
              >
                <span className="text-xs flex-shrink-0">{icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-white/70 truncate">{label}</span>
                    {item.status === "running" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                    )}
                  </div>
                  {detail && <div className="text-[10px] text-white/30 truncate font-mono">{detail}</div>}
                </div>
                {item.phase && (
                  <span className="text-[9px] text-white/20 uppercase whitespace-nowrap">{item.phase}</span>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
