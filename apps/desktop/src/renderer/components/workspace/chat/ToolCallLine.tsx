import { useState, memo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Clock, XCircle, ChevronDown, ChevronRight } from "lucide-react"
import { mapToolToActivity } from "../agent-visibility/AgentActivityMapper"
import type { ToolCallRecord } from "../timeline/types"
import { ANIM } from "./chat-animations"

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

function getToolCallDetail(tc: ToolCallRecord): string | null {
  try {
    const args = JSON.parse(tc.args) as Record<string, unknown>
    return (args.path as string) || (args.file as string) || (args.url as string) || (args.pattern as string) || null
  } catch { return null }
}

function getToolCategory(name: string): "read" | "search" | "edit" | "write" | "run" | "browse" | "other" {
  if (name === "read_file") return "read"
  if (name === "grep_files" || name === "glob_files") return "search"
  if (name === "edit_file") return "edit"
  if (name === "write_file") return "write"
  if (name === "run_command" || name === "execute_command") return "run"
  if (name.startsWith("browser_") || name === "web_fetch" || name === "web_search") return "browse"
  return "other"
}

function ToolIcon({ name, status }: { name: string; status: ToolCallRecord["status"] }) {
  const cat = getToolCategory(name)
  const colorComplete = "var(--color-accent-green)"
  const colorRunning = "var(--color-accent-brand)"
  const colorError = "var(--color-accent-red)"
  const colorDefault = "var(--text-quaternary)"

  const hue = status === "complete" ? colorComplete : status === "running" ? colorRunning : status === "error" ? colorError : colorDefault

  if (status === "running") {
    return (
      <span className="relative flex h-[10px] w-[10px] items-center justify-center shrink-0">
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: colorRunning }}
          animate={{ scale: [1, 1.8], opacity: [0.4, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
        />
        <span className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: colorRunning }} />
      </span>
    )
  }

  const icons: Record<string, React.ReactNode> = {
    read: (
      <svg viewBox="0 0 12 12" className="h-[10px] w-[10px] shrink-0" fill="none" stroke={hue} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 2h8v8H2z" />
        <path d="M4 4h4v4H4z" />
        <path d="M4 2v8" />
      </svg>
    ),
    search: (
      <svg viewBox="0 0 12 12" className="h-[10px] w-[10px] shrink-0" fill="none" stroke={hue} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="5" r="3" />
        <path d="M7.5 7.5L10 10" />
      </svg>
    ),
    edit: (
      <svg viewBox="0 0 12 12" className="h-[10px] w-[10px] shrink-0" fill="none" stroke={hue} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 1.5l2 2L4 10H2V8z" />
      </svg>
    ),
    write: (
      <svg viewBox="0 0 12 12" className="h-[10px] w-[10px] shrink-0" fill="none" stroke={hue} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2v8M2 6h8" />
        <path d="M2 10h8" />
      </svg>
    ),
    run: (
      <svg viewBox="0 0 12 12" className="h-[10px] w-[10px] shrink-0" fill="none" stroke={hue} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 2l5 4-5 4z" />
      </svg>
    ),
    browse: (
      <svg viewBox="0 0 12 12" className="h-[10px] w-[10px] shrink-0" fill="none" stroke={hue} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="4" />
        <path d="M2 6h8M6 2a5.5 5.5 0 010 8" />
        <path d="M6 2a5.5 5.5 0 000 8" />
      </svg>
    ),
    other: (
      <svg viewBox="0 0 12 12" className="h-[10px] w-[10px] shrink-0" fill="none" stroke={hue} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="4" />
        <path d="M6 4v4M4 6h4" />
      </svg>
    ),
  }

  return icons[cat] ?? icons.other
}

function ToolCallLineStatus({ status, name }: { status: ToolCallRecord["status"]; name: string }) {
  switch (status) {
    case "pending":
      return <Clock className="h-[10px] w-[10px] shrink-0" style={{ color: "var(--text-quaternary)" }} />
    case "complete":
      return (
        <svg viewBox="0 0 12 12" className="h-[10px] w-[10px] shrink-0" fill="none" stroke="var(--color-accent-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <motion.path
            d="M2.5 6L5 8.5L9.5 3"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          />
        </svg>
      )
    case "error":
      return <XCircle className="h-[10px] w-[10px] shrink-0" style={{ color: "var(--color-accent-red)" }} />
    default:
      return <ToolIcon name={name} status={status} />
  }
}

function ProgressBar({ isRunning }: { isRunning: boolean }) {
  if (!isRunning) return null
  return (
    <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden rounded-full" style={{ backgroundColor: "var(--border-subtle)" }}>
      <motion.div
        className="h-full"
        style={{ backgroundColor: "var(--color-accent-brand)" }}
        animate={{ x: ["-100%", "400%"] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      />
    </div>
  )
}

export function ToolCallLine({ tc, index = 0 }: { tc: ToolCallRecord; index?: number }) {
  const [showResult, setShowResult] = useState(tc.status === "error")
  const activity = mapToolToActivity(tc.name)
  const detail = getToolCallDetail(tc)
  const duration = tc.durationMs ? formatMs(tc.durationMs) : null
  const hasResult = tc.status === "complete" || tc.status === "error"
  const isRunning = tc.status === "running"

  return (
    <motion.div {...ANIM.slideRight} transition={{ ...ANIM.slideRight.transition, delay: Math.min(index * 0.03, 0.15) }}>
      <div className="relative">
        <ProgressBar isRunning={isRunning} />
        <button
          onClick={() => setShowResult(!showResult)}
          className="flex items-center gap-2 w-full text-left py-[3px] px-2 rounded-lg transition-all duration-100 group"
          style={{
            backgroundColor: tc.status === "error" ? "color-mix(in srgb, var(--color-accent-red) 10%, transparent)" : "transparent",
          }}
          onMouseEnter={(e) => {
            if (tc.status !== "error") {
              e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--color-accent-brand) 6%, transparent)"
            }
          }}
          onMouseLeave={(e) => {
            if (tc.status !== "error") {
              e.currentTarget.style.backgroundColor = "transparent"
            }
          }}
        >
          <ToolCallLineStatus status={tc.status} name={tc.name} />
          <span className="text-[11px] font-medium leading-tight" style={{
            color: tc.status === "complete" ? "var(--text-secondary)" :
                   tc.status === "running" ? "var(--color-accent-brand)" :
                   tc.status === "error" ? "var(--color-accent-red)" :
                   "var(--text-tertiary)"
          }}>
            {activity.label}
          </span>
          {detail && (
            <span className="text-[10px] font-mono truncate max-w-[200px] leading-tight" style={{ color: "var(--text-quaternary)" }}>
              {tc.status === "running" ? detail : detail}
            </span>
          )}
          {duration && (
            <span className="text-[8px] font-mono ml-auto tabular-nums shrink-0" style={{ color: "var(--text-quaternary)" }}>
              {duration}
            </span>
          )}
          {hasResult && (
            <span className="shrink-0" style={{ color: "var(--text-quaternary)" }}>
              {showResult ? <ChevronDown className="h-[9px] w-[9px]" /> : <ChevronRight className="h-[9px] w-[9px]" />}
            </span>
          )}
        </button>
      </div>
      <AnimatePresence>
        {showResult && hasResult && tc.result && (
          <motion.div {...ANIM.expandCollapse} className="overflow-hidden ml-[26px]">
            <pre className="text-[10px] font-mono whitespace-pre-wrap break-all leading-relaxed max-h-[120px] overflow-y-auto p-2 rounded-lg mt-[3px] scrollbar-thin"
              style={{
                color: "var(--text-tertiary)",
                backgroundColor: "var(--surface-panel)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {tc.result}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function ToolCallAccumulator({ session, isRunning }: { session: { toolCalls: ToolCallRecord[] }; isRunning: boolean }) {
  const count = session.toolCalls.length
  const hasError = session.toolCalls.some(tc => tc.status === "error")
  const runningCount = session.toolCalls.filter(tc => tc.status === "running").length
  const [expanded, setExpanded] = useState(true)

  if (count === 0) return null

  const label = `${count} tool call${count !== 1 ? "s" : ""}`

  return (
    <div className="py-[2px]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left transition-colors px-1 py-[2px] rounded-lg"
        style={{ color: "var(--text-tertiary)" }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--border-subtle)" }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent" }}
      >
        {expanded
          ? <ChevronDown className="h-[9px] w-[9px] shrink-0" style={{ color: "var(--text-quaternary)" }} />
          : <ChevronRight className="h-[9px] w-[9px] shrink-0" style={{ color: "var(--text-quaternary)" }} />
        }
        {isRunning ? (
          <span className="relative flex h-[9px] w-[9px] items-center justify-center shrink-0">
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: "var(--color-accent-brand)" }}
              animate={{ scale: [1, 1.8], opacity: [0.4, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
            />
            <span className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: "var(--color-accent-brand)" }} />
          </span>
        ) : (
          <svg viewBox="0 0 12 12" className="h-[9px] w-[9px] shrink-0" fill="none" stroke="var(--color-accent-brand-text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="4" />
            <path d="M6 3.5v3L8 8" />
          </svg>
        )}
        <span className="text-[10px] font-medium">{label}</span>
        {isRunning && runningCount > 0 && (
          <span className="text-[9px]" style={{ color: "var(--color-accent-brand)" }}>
            ({runningCount} active)
          </span>
        )}
        {!isRunning && hasError && (
          <span className="text-[9px] ml-auto" style={{ color: "var(--color-accent-red)" }}>
            {session.toolCalls.filter(tc => tc.status === "error").length} failed
          </span>
        )}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div {...ANIM.expandCollapse} className="overflow-hidden ml-[2px] mt-[1px] space-y-[1px]">
            {session.toolCalls.map((tc, i) => (
              <ToolCallLine key={tc.id} tc={tc} index={i} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function ToolErrorDisplay({ toolCalls }: { toolCalls: Array<{ name: string; status: string; result?: string }> }) {
  const errors = toolCalls.filter((tc) => tc.status === "error")
  if (errors.length === 0) return null
  return (
    <div className="py-1.5 space-y-1.5">
      {errors.map((tc, i) => (
        <motion.div key={i} {...ANIM.slideRight} transition={{ ...ANIM.slideRight.transition, delay: i * 0.03 }}
          className="rounded-xl px-3 py-2"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-accent-red) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-accent-red) 30%, transparent)",
          }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <XCircle className="h-[10px] w-[10px]" style={{ color: "var(--color-accent-red)" }} />
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-accent-red)" }}>
              {mapToolToActivity(tc.name).label}
            </span>
            <span className="text-[9px]" style={{ color: "var(--color-accent-red)" }}>failed</span>
          </div>
          <p className="text-[11px] font-mono break-words" style={{ color: "var(--text-secondary)" }}>{tc.result}</p>
        </motion.div>
      ))}
    </div>
  )
}
