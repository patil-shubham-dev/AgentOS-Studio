import { useState, memo, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { ANIM } from "./chat-animations"
import { ClickableTerminalOutput } from "./ClickableTerminalOutput"
import type { ToolCallRecord } from "../timeline/types"
import type { FileEditRecord, TerminalRecord } from "../timeline/step-card"
import { getSpringConfig } from "@/lib/motion"

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

function parseArgs(args: string): Record<string, unknown> {
  try { return JSON.parse(args) } catch { return {} }
}

function getArg(args: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = args[k]
    if (typeof v === "string" && v) return v
  }
  return undefined
}

interface ToolCardTheme {
  cssVar: string
  label: string
}

// Maps tool names to CSS custom properties (theme-aware, see index.css --tool-*)
const TOOL_THEMES: Record<string, ToolCardTheme> = {
  write_file: { cssVar: "--tool-write", label: "Created" },
  create_file: { cssVar: "--tool-write", label: "Created" },
  edit_file: { cssVar: "--tool-edit", label: "Edited" },
  replace: { cssVar: "--tool-edit", label: "Replaced" },
  read_file: { cssVar: "--tool-read", label: "Read" },
  grep_files: { cssVar: "--tool-search", label: "Searched" },
  glob_files: { cssVar: "--tool-search", label: "Found" },
  run_command: { cssVar: "--tool-terminal", label: "Ran" },
  bash: { cssVar: "--tool-terminal", label: "Executed" },
  browser_navigate: { cssVar: "--tool-browser", label: "Navigated" },
  browser_click: { cssVar: "--tool-browser", label: "Clicked" },
  browser_type: { cssVar: "--tool-browser", label: "Typed" },
  browser_snapshot: { cssVar: "--tool-browser", label: "Captured" },
  web_fetch: { cssVar: "--tool-read", label: "Fetched" },
  web_search: { cssVar: "--tool-search", label: "Searched" },
  git_commit: { cssVar: "--tool-git", label: "Committed" },
  git_diff: { cssVar: "--tool-git", label: "Diffed" },
  git_status: { cssVar: "--tool-git", label: "Checked" },
  delegate_subtask: { cssVar: "--tool-thinking", label: "Delegated" },
  question: { cssVar: "--tool-thinking", label: "Asked" },
  code_completion: { cssVar: "--tool-write", label: "Completed" },
  search_content: { cssVar: "--tool-search", label: "Searched" },
  rename: { cssVar: "--tool-edit", label: "Renamed" },
  delete: { cssVar: "--color-accent-red", label: "Deleted" },
}

const DEFAULT_TOOL_VAR = "--tool-read"

function toolCssVar(name: string): string {
  return TOOL_THEMES[name]?.cssVar ?? DEFAULT_TOOL_VAR
}

function getDisplayName(name: string): string {
  return TOOL_THEMES[name]?.label ?? name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function ToolIcon({ name, cssVar, status }: { name: string; cssVar: string; status: string }) {
  const color = status === "error" ? "var(--color-accent-red)" : `var(${cssVar})`
  const running = status === "running" || status === "pending"

  if (running) {
    return (
      <span className="relative flex h-[14px] w-[14px] items-center justify-center shrink-0">
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: `var(${cssVar})` }}
          animate={{ scale: [1, 2], opacity: [0.3, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
        />
        <span className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: `var(${cssVar})` }} />
      </span>
    )
  }

  const icons: Record<string, React.ReactNode> = {
    write_file: (
      <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 2v10M2 7h10" />
        <path d="M2 12h10" />
      </svg>
    ),
    read_file: (
      <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h10v8H2z" />
        <path d="M5 5h4v4H5z" />
        <path d="M5 3v8" />
      </svg>
    ),
    edit_file: (
      <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 1.5l2.5 2.5L4 12.5H1.5V10z" />
        <path d="M8.5 4L10 5.5" />
      </svg>
    ),
    run_command: (
      <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3.5l4 3.5-4 3.5" />
        <path d="M8 10.5h4" />
      </svg>
    ),
    grep_files: (
      <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3.5" />
        <path d="M9 9l3 3" />
      </svg>
    ),
    glob_files: (
      <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 2h10v10H2z" />
        <path d="M7 2v10M2 7h10" />
      </svg>
    ),
    browser_navigate: (
      <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="7" r="5" />
        <path d="M2 7h10M7 2a6 6 0 010 10" />
        <path d="M7 2a6 6 0 000 10" />
      </svg>
    ),
    web_fetch: (
      <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="7" r="5" />
        <path d="M3.5 4.5l3 2.5-3 2.5" />
        <path d="M7 7h4" />
      </svg>
    ),
    web_search: (
      <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3.5" />
        <path d="M9 9l3 3" />
        <path d="M1 1l2 2M12 12l1 1" />
      </svg>
    ),
    git_commit: (
      <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="7" r="2" />
        <path d="M7 7h5" />
        <path d="M2 7H1" />
      </svg>
    ),
    question: (
      <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="7" r="5" />
        <path d="M5.5 5.5a1.5 1.5 0 012.8.8c0 1-1.3 1.3-1.3 1.3" />
        <path d="M7 9.5v.01" />
      </svg>
    ),
    rename: (
      <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3l3 3-6 6H2v-3z" />
        <path d="M6 3h5.5" />
      </svg>
    ),
    delete: (
      <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3.5h10" />
        <path d="M4.5 3.5V2a.5.5 0 01.5-.5h4a.5.5 0 01.5.5v1.5" />
        <path d="M3 3.5l.7 8.4a1 1 0 001 .9h4.6a1 1 0 001-.9L11 3.5" />
      </svg>
    ),
    delegate_subtask: (
      <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h6" />
        <path d="M7 4l3 3-3 3" />
      </svg>
    ),
  }

  return icons[name] ?? (
    <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="4" />
      <path d="M7 5v4M5 7h4" />
    </svg>
  )
}

function StatusBadge({ status, cssVar }: { status: string; cssVar: string }) {
  switch (status) {
    case "running":
    case "pending":
      return (
        <span className="flex items-center gap-1 text-[9px] font-medium" style={{ color: `var(${cssVar})` }}>
          <span className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: `var(${cssVar})` }} />
          Running
        </span>
      )
    case "complete":
      return (
        <span className="flex items-center gap-1 text-[9px] font-medium" style={{ color: "var(--color-accent-green)" }}>
          <svg viewBox="0 0 10 10" className="h-[9px] w-[9px]" fill="none" stroke="var(--color-accent-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 5l2 2 4-4" />
          </svg>
          Done
        </span>
      )
    case "error":
      return (
        <span className="flex items-center gap-1 text-[9px] font-medium" style={{ color: "var(--color-accent-red)" }}>
          <svg viewBox="0 0 10 10" className="h-[9px] w-[9px]" fill="none" stroke="var(--color-accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="5" r="4" />
            <path d="M3.5 3.5l3 3M6.5 3.5l-3 3" />
          </svg>
          Failed
        </span>
      )
    default:
      return null
  }
}

function getDetail(tc: ToolCallRecord): string | undefined {
  const args = parseArgs(tc.args)
  return getArg(args, "path", "file", "url", "pattern", "command", "target")
}

function formatResult(result: string): string {
  if (!result) return ""
  const pre = result.length > 300 ? result.slice(0, 300) + "\n… (truncated)" : result
  return pre
}

interface ToolCardProps {
  toolCall: ToolCallRecord
  onOpenFile?: (path: string) => void
}

export const ToolCard = memo(function ToolCard({ toolCall, onOpenFile }: ToolCardProps) {
  const [expanded, setExpanded] = useState(false)
  const name = toolCall.name
  const cssVar = toolCssVar(name)
  const detail = getDetail(toolCall)
  const isRunning = toolCall.status === "running" || toolCall.status === "pending"
  const isError = toolCall.status === "error"
  const isComplete = toolCall.status === "complete"
  const hasResult = !!toolCall.result && toolCall.result.length > 0

  const displayName = getDisplayName(name)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={getSpringConfig("fast")}
      className={cn(
        "relative rounded-xl border overflow-hidden transition-all duration-200",
        isError && "border-red-500/20",
      )}
      style={{
        backgroundColor: isError ? "color-mix(in srgb, var(--color-accent-red) 4%, transparent)" : `color-mix(in srgb, var(${cssVar}) 6%, transparent)`,
        borderColor: isError ? "color-mix(in srgb, var(--color-accent-red) 20%, transparent)" : isRunning ? `color-mix(in srgb, var(${cssVar}) 20%, transparent)` : `color-mix(in srgb, var(${cssVar}) 15%, transparent)`,
      }}
    >
      {/* Running shimmer */}
      {isRunning && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(${cssVar}) 3%, transparent) 50%, transparent 100%)`,
            backgroundSize: "200% 100%",
          }}
          animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        />
      )}

      <div className="flex items-center gap-2.5 px-3 py-2">
        {/* Icon */}
        <div
          className="flex items-center justify-center h-[24px] w-[24px] rounded-lg shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, var(${cssVar}) 12%, transparent)` }}
        >
          <ToolIcon name={name} cssVar={cssVar} status={toolCall.status} />
        </div>

        {/* Label + Detail */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] font-semibold truncate"
              style={{
                color: isError ? "var(--color-accent-red)" : isRunning ? `var(${cssVar})` : "var(--text-secondary)",
              }}
            >
              {displayName}
            </span>
            {detail && (
              <span
                className="text-[10px] font-mono truncate"
                style={{ color: "var(--text-tertiary)" }}
                title={detail}
              >
                {detail}
              </span>
            )}
          </div>
          {toolCall.progress && isRunning && (
            <div className="text-[9px] mt-0.5" style={{ color: "var(--text-quaternary)" }}>
              {toolCall.progress}
            </div>
          )}
          {toolCall.durationMs && isComplete && !hasResult && (
            <div className="text-[9px] mt-0.5" style={{ color: "var(--text-quaternary)" }}>
              {formatMs(toolCall.durationMs)}
            </div>
          )}
        </div>

        {/* Provenance + Status + Duration */}
        <div className="flex items-center gap-1.5 shrink-0">
          {toolCall.confidence && (
            <span
              className="flex items-center gap-1 rounded px-1 py-0.5 text-[8px] font-medium"
              title={toolCall.reason ?? `Confidence: ${toolCall.confidence}`}
              style={{
                color: toolCall.confidence === "high" ? "var(--color-accent-green)" : toolCall.confidence === "medium" ? "var(--color-accent-amber)" : "var(--color-accent-red)",
                backgroundColor: toolCall.confidence === "high" ? "color-mix(in srgb, var(--color-accent-green) 8%, transparent)" : toolCall.confidence === "medium" ? "color-mix(in srgb, var(--color-accent-amber) 8%, transparent)" : "color-mix(in srgb, var(--color-accent-red) 8%, transparent)",
              }}
            >
              <span
                className="h-1 w-1 rounded-full"
                style={{
                  backgroundColor: toolCall.confidence === "high" ? "var(--color-accent-green)" : toolCall.confidence === "medium" ? "var(--color-accent-amber)" : "var(--color-accent-red)",
                }}
              />
              {toolCall.confidence}
            </span>
          )}
          <StatusBadge status={toolCall.status} cssVar={cssVar} />
          {toolCall.durationMs && (
            <span className="text-[9px] font-mono tabular-nums" style={{ color: "var(--text-quaternary)" }}>
              {formatMs(toolCall.durationMs)}
            </span>
          )}
          {hasResult && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center justify-center h-[18px] w-[18px] rounded transition-colors"
              style={{ color: "var(--text-quaternary)" }}
            >
              <motion.svg viewBox="0 0 10 10" className="h-[10px] w-[10px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                animate={{ rotate: expanded ? 180 : 0 }}
              >
                <path d="M2 3.5l3 3 3-3" />
              </motion.svg>
            </button>
          )}
        </div>
      </div>

      {/* Tool-specific visualizations */}

      {/* Search scanning animation */}
      {isRunning && (name === "grep_files" || name === "search_content" || name === "glob_files") && (
        <div className="px-3 pb-2">
          <div className="h-[2px] rounded-full overflow-hidden" style={{ backgroundColor: "var(--border-default)" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: `var(${cssVar})` }}
              initial={{ x: "-100%" }}
              animate={{ x: "200%" }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
            />
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex gap-[2px]">
              {[0, 1, 2, 3].map((i) => (
                <motion.span
                  key={i}
                  className="h-[4px] w-[4px] rounded-full"
                  style={{ backgroundColor: `var(${cssVar})` }}
                  animate={{ opacity: [0.15, 0.8, 0.15] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
                />
              ))}
            </div>
            <span className="text-[9px] font-mono" style={{ color: "var(--text-quaternary)" }}>
              {detail ? `Scanning ${detail}` : "Searching"}
            </span>
          </div>
        </div>
      )}

      {/* Build/shell pipeline visualization */}
      {isRunning && (name === "run_command" || name === "bash") && detail && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2">
            <motion.div
              className="flex items-center gap-1.5 rounded-lg px-2 py-1"
              style={{
                backgroundColor: `color-mix(in srgb, var(${cssVar}) 6%, transparent)`,
                border: `1px solid color-mix(in srgb, var(${cssVar}) 13%, transparent)`,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <motion.span
                className="h-[3px] w-[3px] rounded-full"
                style={{ backgroundColor: `var(${cssVar})` }}
                animate={{ scale: [1, 1.4, 1] }}
                transition={{ duration: 0.6, repeat: Infinity }}
              />
              <span className="text-[9px] font-mono" style={{ color: `var(${cssVar})` }}>
                {detail.length > 40 ? detail.slice(0, 40) + "..." : detail}
              </span>
            </motion.div>
          </div>
        </div>
      )}

      {/* Expandable result */}
      <AnimatePresence>
        {expanded && hasResult && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div
              className="px-3 pb-2 pt-0"
              style={{ borderTop: `1px solid color-mix(in srgb, var(--color-accent-red) 10%, transparent)` }}
            >
              <pre
                className="mt-2 text-[10px] leading-relaxed font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto rounded-lg p-2"
                style={{
                  backgroundColor: isError ? "color-mix(in srgb, var(--color-accent-red) 4%, transparent)" : "var(--surface-elevated)",
                  color: isError ? "var(--color-accent-red)" : "var(--text-tertiary)",
                }}
              >
                {formatResult(toolCall.result ?? "")}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})

// ── File Edit Card ──
interface FileEditCardProps {
  edit: FileEditRecord
  onOpenFile?: (path: string) => void
}

export const FileEditCard = memo(function FileEditCard({ edit, onOpenFile }: FileEditCardProps) {
  const [expanded, setExpanded] = useState(false)
  const isCreate = edit.deletions === 0 && edit.additions > 0
  const fileName = edit.path.split(/[/\\]/).pop() ?? edit.path

  const cssVar = isCreate ? "--tool-write" : "--tool-edit"

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={getSpringConfig("fast")}
      className="rounded-xl overflow-hidden transition-all duration-200"
      style={{ backgroundColor: `color-mix(in srgb, var(${cssVar}) 6%, transparent)`, border: `1px solid color-mix(in srgb, var(${cssVar}) 15%, transparent)` }}
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        <div
          className="flex items-center justify-center h-[24px] w-[24px] rounded-lg shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, var(${cssVar}) 12%, transparent)` }}
        >
          {isCreate ? (
            <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke={`var(${cssVar})`} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 2v10M2 7h10" />
            </svg>
          ) : (
            <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke={`var(${cssVar})`} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 1.5l2.5 2.5L4 12.5H1.5V10z" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold" style={{ color: `var(${cssVar})` }}>
              {isCreate ? "Created" : "Edited"}
            </span>
            <div className="flex items-center gap-1 text-[10px] font-mono truncate" style={{ color: "var(--text-tertiary)" }}>
              <span className="truncate" title={edit.path}>{fileName}</span>
              {isCreate && (
                <motion.span
                  className="inline-block h-[3px] w-[3px] rounded-full"
                  style={{ backgroundColor: `var(${cssVar})` }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                />
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {edit.additions > 0 && (
              <span className="text-[9px] font-mono" style={{ color: "var(--color-accent-green)" }}>+{edit.additions}</span>
            )}
            {edit.deletions > 0 && (
              <span className="text-[9px] font-mono" style={{ color: "var(--color-accent-red)" }}>-{edit.deletions}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-center h-[18px] w-[18px] rounded transition-colors"
          style={{ color: "var(--text-quaternary)" }}
        >
          <motion.svg viewBox="0 0 10 10" className="h-[10px] w-[10px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            animate={{ rotate: expanded ? 180 : 0 }}
          >
            <path d="M2 3.5l3 3 3-3" />
          </motion.svg>
        </button>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2" style={{ borderTop: `1px solid color-mix(in srgb, var(${cssVar}) 15%, transparent)` }}>
              <div
                className="mt-2 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto rounded-lg p-2"
                style={{ backgroundColor: "var(--surface-elevated)", color: "var(--text-tertiary)" }}
              >
                {edit.diffContent || `${edit.oldContent ? edit.oldContent : ""}\n→\n${edit.newContent || ""}`}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})

// ── Terminal Card ──
interface TerminalCardProps {
  terminal: TerminalRecord
  onOpenFile?: (path: string) => void
}

export const TerminalCard = memo(function TerminalCard({ terminal, onOpenFile }: TerminalCardProps) {
  const [expanded, setExpanded] = useState(false)
  const isRunning = terminal.status === "running"
  const isError = terminal.status === "error"
  const hasOutput = terminal.output.length > 0
  const cssVar = "--tool-terminal"

  // Auto-expand on error or non-zero exit
  useEffect(() => {
    if (isError || (terminal.status === "success" && terminal.exitCode !== 0 && terminal.exitCode !== undefined)) {
      setExpanded(true)
    }
  }, [isError, terminal.status, terminal.exitCode])

  const effectiveStatus = terminal.status === "success" && terminal.exitCode !== 0 && terminal.exitCode !== undefined ? "error" : terminal.status

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={getSpringConfig("fast")}
      className="rounded-xl overflow-hidden transition-all duration-200"
      style={{
        backgroundColor: `color-mix(in srgb, ${isError ? "var(--color-accent-red)" : `var(${cssVar})`} 6%, transparent)`,
        border: `1px solid color-mix(in srgb, ${isError ? "var(--color-accent-red)" : `var(${cssVar})`} ${isRunning ? 20 : 15}%, transparent)`,
      }}
    >
      {/* Running shimmer */}
      {isRunning && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(${cssVar}) 3%, transparent) 50%, transparent 100%)`,
            backgroundSize: "200% 100%",
          }}
          animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        />
      )}

      <div className="flex items-center gap-2.5 px-3 py-2">
        <div className="flex items-center justify-center h-[24px] w-[24px] rounded-lg shrink-0" style={{ backgroundColor: `color-mix(in srgb, ${isError ? "var(--color-accent-red)" : `var(${cssVar})`} 12%, transparent)` }}>
          <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke={isError ? "var(--color-accent-red)" : `var(${cssVar})`} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 4.5l3 2.5-3 2.5" />
            <path d="M8 9.5h3" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold" style={{ color: isRunning ? `var(${cssVar})` : isError ? "var(--color-accent-red)" : "var(--text-secondary)" }}>
              {isRunning ? "Running" : effectiveStatus === "error" ? "Failed" : "Command"}
            </span>
            <span className="text-[10px] font-mono truncate" style={{ color: isError ? "var(--color-accent-red)" : "var(--text-tertiary)" }}>
              {terminal.command}
            </span>
          </div>
          {terminal.cwd && (
            <div className="text-[9px] mt-0.5 font-mono truncate" style={{ color: "var(--text-quaternary)" }}>
              {terminal.cwd}
            </div>
          )}
          {terminal.durationMs && !isRunning && (
            <div className="text-[9px] mt-0.5 tabular-nums" style={{ color: "var(--text-quaternary)" }}>
              {formatMs(terminal.durationMs)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isRunning ? (
            <span className="flex items-center gap-1 text-[9px] font-medium" style={{ color: `var(${cssVar})` }}>
              <span className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: `var(${cssVar})` }} />
              Running
            </span>
          ) : (
            <span className={`text-[9px] font-medium tabular-nums ${terminal.exitCode === 0 ? "text-emerald-400" : "text-red-400"}`}>
              Exit {terminal.exitCode ?? 0}
            </span>
          )}
          {hasOutput && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center justify-center h-[18px] w-[18px] rounded transition-colors"
              style={{ color: "var(--text-quaternary)" }}
            >
              <motion.svg viewBox="0 0 10 10" className="h-[10px] w-[10px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                animate={{ rotate: expanded ? 180 : 0 }}
              >
                <path d="M2 3.5l3 3 3-3" />
              </motion.svg>
            </button>
          )}
        </div>
      </div>
      <AnimatePresence>
        {expanded && hasOutput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2" style={{ borderTop: `1px solid color-mix(in srgb, ${isError ? "var(--color-accent-red)" : `var(${cssVar})`} 15%, transparent)` }}>
              <div className="mt-2 rounded-lg p-2 overflow-hidden" style={{ backgroundColor: isError ? "color-mix(in srgb, var(--color-accent-red) 4%, transparent)" : "var(--surface-elevated)" }}>
                <ClickableTerminalOutput
                  text={terminal.output}
                  maxLength={5000}
                  maxHeight={300}
                  isError={isError}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})
