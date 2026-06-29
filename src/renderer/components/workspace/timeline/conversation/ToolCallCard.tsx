import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, XCircle, Loader2, Clock, ExternalLink, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { mapToolToActivity } from "../../agent-visibility/AgentActivityMapper"
import type { ToolCallRecord } from "../types"
import { useWorkspaceStore } from "@/stores/workspace-store"

interface ToolCallCardProps {
  toolCall: ToolCallRecord
  index?: number
}

function formatToolDuration(tc: ToolCallRecord): string | null {
  const ms = tc.durationMs
  if (ms === undefined || ms === null) return null
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

function getToolDetail(tc: ToolCallRecord): { text: string; path?: string; editPreview?: string } | undefined {
  try {
    const args = JSON.parse(tc.args) as Record<string, unknown>
    if (args.path && typeof args.path === "string") {
      const oldStr = args.old_string as string | undefined
      const newStr = args.new_string as string | undefined
      if (oldStr && newStr) {
        const diff = oldStr.split("\n").map(l => `- ${l}`).concat(newStr.split("\n").map(l => `+ ${l}`)).join("\n")
        return { text: args.path as string, path: args.path as string, editPreview: diff.slice(0, 300) }
      }
      return { text: args.path as string, path: args.path as string }
    }
    if (args.file && typeof args.file === "string") return { text: args.file as string, path: args.file as string }
    if (args.url && typeof args.url === "string") return { text: args.url as string }
    if (args.pattern && typeof args.pattern === "string") return { text: args.pattern as string }
    if (args.command && typeof args.command === "string") {
      return { text: args.command.length > 40 ? args.command.slice(0, 40) + "..." : args.command }
    }
  } catch { console.warn("[ToolCallCard] Failed to parse tool call args") }
  return undefined
}

const STATUS_COLORS = {
  pending: "border-white/[0.06] text-white/30",
  running: "border-amber-500/15 text-amber-400/70",
  complete: "border-emerald-500/15 text-emerald-400/70",
  error: "border-red-500/15 text-red-400/70",
}

const STATUS_BG = {
  pending: "",
  running: "bg-amber-500/[0.03]",
  complete: "bg-emerald-500/[0.02]",
  error: "bg-red-500/[0.03]",
}

const SPRING = { type: "spring" as const, stiffness: 400, damping: 30, mass: 0.8 }
const SPRING_HEAVY = { type: "spring" as const, stiffness: 350, damping: 25, mass: 1 }

const StatusIcon = memo(function StatusIcon({ status, name }: { status: ToolCallRecord["status"]; name: string }) {
  switch (status) {
    case "pending":
      return (
        <span className="relative flex h-4 w-4 items-center justify-center">
          <Clock className="h-3 w-3 text-white/30" />
        </span>
      )
    case "running":
      return (
        <span className="relative flex h-4 w-4 items-center justify-center">
          <span className="absolute inset-0 rounded-full animate-pulse-ring-soft" />
          <Loader2 className="h-3 w-3 text-amber-400/70 animate-spin" />
        </span>
      )
    case "complete":
      return (
        <span className="relative flex h-4 w-4 items-center justify-center">
          <span className="absolute inset-0 rounded-full animate-pulse-ring-green" />
          <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5 text-emerald-400/80"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.path
              d="M3 8.5L6.5 12L13 4.5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            />
          </svg>
        </span>
      )
    case "error":
      return (
        <span className="relative flex h-4 w-4 items-center justify-center">
          <XCircle className="h-3.5 w-3.5 text-red-400/70" />
        </span>
      )
  }
})

function getResultSummary(tc: ToolCallRecord): string | null {
  if (tc.status !== "complete" || !tc.result) return null
  const r = tc.result
  const lines = r.split("\n").filter(l => l.trim())

  // Check for search/grep results
  const fileMatch = r.match(/(\d+) files?/i)
  const lineMatch = r.match(/(\d+) lines?/i)
  const foundMatch = r.match(/found (\d+)/i)
  const errMatch = r.match(/(\d+) (errors?|warnings?|issues?)/i)

  if (foundMatch) return `Found ${foundMatch[1]} results`
  if (fileMatch && lineMatch) return `${fileMatch[1]} files, ${lineMatch[1]} lines`
  if (fileMatch) return `${fileMatch[1]} files`
  if (lineMatch) return `${lineMatch[1]} lines`
  if (errMatch) return `${errMatch[1]} ${errMatch[2]}`
  if (lines.length === 1) return lines[0].length > 80 ? lines[0].slice(0, 80) + "…" : lines[0]
  if (lines.length > 0) {
    const first = lines[0]
    return first.length > 80 ? first.slice(0, 80) + "…" : (lines.length > 1 ? `${first} +${lines.length - 1} more` : first)
  }
  return null
}

function ImpactBadge({ result }: { result?: string }) {
  if (!result) return null
  const hasWarning = result.toLowerCase().includes("warning") || result.toLowerCase().includes("impact")
  if (!hasWarning) return null
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400/60 text-[9px] font-medium">
      <AlertTriangle className="h-2.5 w-2.5" />
      Impact
    </span>
  )
}

function ClickablePath({ path, text }: { path: string; text: string }) {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    useWorkspaceStore.getState().openFile({ path, name: path.split(/[\\/]/).pop() || path, content: "", isDirty: false })
  }, [path])
  return (
    <button
      onClick={handleClick}
      className="text-[11px] text-white/35 font-mono truncate flex-1 min-w-0 leading-tight hover:text-blue-400/60 transition-colors text-left"
      title={`Open ${path}`}
    >
      {text}
      <ExternalLink className="h-2.5 w-2.5 inline ml-1 opacity-40" />
    </button>
  )
}

function InlineDiff({ preview }: { preview?: string }) {
  if (!preview) return null
  return (
    <div className="mt-1.5 rounded-lg bg-black/30 border border-white/[0.04] overflow-hidden">
      <div className="px-2 py-1 text-[9px] font-medium text-white/25 border-b border-white/[0.04]">Diff Preview</div>
      <pre className="text-[10px] font-mono whitespace-pre-wrap break-all leading-relaxed max-h-[80px] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-white/[0.03] scrollbar-track-transparent">
        {preview.split("\n").map((line, i) => {
          const type = line.startsWith("- ") ? "del" : line.startsWith("+ ") ? "add" : "ctx"
          const content = line.slice(2)
          return (
            <span key={i} className={cn(
              "block",
              type === "del" && "text-red-400/60 bg-red-500/[0.04]",
              type === "add" && "text-emerald-400/60 bg-emerald-500/[0.04]",
              type === "ctx" && "text-white/20",
            )}>
              {line[0] === "-" ? "−" : line[0] === "+" ? "+" : " "} {content}
            </span>
          )
        })}
      </pre>
    </div>
  )
}

function VerificationDetails({ result }: { result?: string }) {
  if (!result) return null
  const isVerification = result.includes("lintErrors") || result.includes("typeErrors") || result.includes("buildErrors") || result.includes("tests passed") || result.includes("✓") || result.includes("✗")
  if (!isVerification) return null
  return (
    <div className="mt-1.5 rounded-lg bg-black/30 border border-white/[0.04] overflow-hidden">
      <div className="px-2 py-1 text-[9px] font-medium text-white/25 border-b border-white/[0.04]">Verification</div>
      <pre className="text-[10px] font-mono whitespace-pre-wrap break-all leading-relaxed max-h-[100px] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-white/[0.03] scrollbar-track-transparent text-white/40">
        {result}
      </pre>
    </div>
  )
}

export const ToolCallCard = memo(function ToolCallCard({ toolCall, index = 0 }: ToolCallCardProps) {
  const { status, name, result } = toolCall
  const activity = mapToolToActivity(name)
  const detail = getToolDetail(toolCall)
  const durationText = status !== "running" ? formatToolDuration(toolCall) : null
  const [expanded, setExpanded] = useState(status === "running")
  const hasResult = status === "complete" || status === "error"
  const autoCollapseTimer = useRef<ReturnType<typeof setTimeout>>()
  const isEditTool = name === "edit_file" || name === "write_file"
  const resultSummary = status === "complete" ? getResultSummary(toolCall) : null

  useEffect(() => {
    if (status === "running") {
      setExpanded(true)
    } else if (hasResult) {
      autoCollapseTimer.current = setTimeout(() => setExpanded(false), 3000)
    }
    return () => {
      if (autoCollapseTimer.current) clearTimeout(autoCollapseTimer.current)
    }
  }, [status, hasResult])

  const toggleExpand = useCallback(() => {
    setExpanded((e) => !e)
  }, [])

  const cardTransition = useMemo(() => ({
    ...SPRING,
    delay: index * 0.04,
  }), [index])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, scale: 0.96 }}
      transition={cardTransition}
      className="py-0.5"
    >
      <motion.button
        layout
        onClick={toggleExpand}
        className={cn(
          "flex items-center gap-2.5 w-full text-left",
          "rounded-xl border px-3 py-2",
          "transition-colors duration-200",
          STATUS_BG[status],
          STATUS_COLORS[status],
          hasResult && !expanded && "opacity-60 hover:opacity-100",
        )}
        whileHover={hasResult && !expanded ? { opacity: 1 } : undefined}
        whileTap={{ scale: 0.995 }}
      >
        <StatusIcon status={status} name={name} />
        <span className="text-[12px] font-medium text-white/75 flex-shrink-0 leading-tight">
          {activity.label}
        </span>
        <span className="flex-1 min-w-0 flex items-center gap-2">
          {detail?.path ? (
            <ClickablePath path={detail.path} text={detail.text} />
          ) : detail ? (
            <span className="text-[11px] text-white/35 font-mono truncate leading-tight">{detail.text}</span>
          ) : null}
          <ImpactBadge result={result} />
          {durationText && (
            <span className="text-[9px] font-mono text-white/25 flex-shrink-0 ml-1">{durationText}</span>
          )}
        </span>
        {hasResult && !expanded && (
          <motion.span
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn(
              "text-[9px] font-medium ml-auto flex-shrink-0 truncate max-w-[120px] text-right",
              status === "complete" ? "text-emerald-400/50" : "text-red-400/50",
            )}
            title={resultSummary ?? (status === "complete" ? "Done" : "Failed")}
          >
            {resultSummary ?? (status === "complete" ? "Done" : "Failed")}
          </motion.span>
        )}
      </motion.button>
      <AnimatePresence>
        {expanded && hasResult && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_HEAVY}
            className="overflow-hidden"
          >
            <motion.div
              initial={{ y: -4 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="mx-3 mt-1.5 mb-2 px-3 py-2 rounded-lg bg-black/25 border border-white/[0.04]"
            >
              {durationText && (
                <div className="flex items-center gap-1.5 mb-2 text-[10px] font-mono text-white/25">
                  <Clock className="h-3 w-3" />
                  {durationText}
                </div>
              )}
              {isEditTool && detail?.editPreview && <InlineDiff preview={detail.editPreview} />}
              {result && <VerificationDetails result={result} />}
              {result && !result.includes("lintErrors") && !result.includes("tests passed") && (
                <pre className="text-[10px] font-mono text-white/35 whitespace-pre-wrap break-all leading-relaxed max-h-[120px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/[0.03] scrollbar-track-transparent">
                  {result}
                </pre>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})
