/**
 * SideBySideDiff — Monaco-based side-by-side diff viewer with per-hunk accept/reject.
 *
 * Features:
 *   - Monaco DiffEditor with split view
 *   - Per-hunk accept/reject buttons inline in the diff gutter
 *   - Accept All / Reject All controls in the toolbar
 *   - File-level status tracking
 *   - Syntax highlighting via Monaco
 *   - Line number gutter with change indicators
 */

import { useRef, useCallback, useMemo } from "react"
import { DiffEditor } from "@monaco-editor/react"
import type { editor } from "monaco-editor"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { getReviewedContent } from "@/lib/diff-review"
import {
  Check, X, CheckCheck, XCircle, FileText,
  ChevronDown, ChevronRight,
} from "lucide-react"
import type { DiffFileEntry, DiffHunkStatus } from "@/stores/diff-store"

interface SideBySideDiffProps {
  file: DiffFileEntry
  onAcceptAll?: (path: string) => void
  onRejectAll?: (path: string) => void
  onAcceptHunk?: (path: string, hunkIndex: number) => void
  onRejectHunk?: (path: string, hunkIndex: number) => void
  expanded?: boolean
  onToggleExpand?: (path: string) => void
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || ""
  const langMap: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rb: "ruby", rs: "rust", go: "go", java: "java",
    cs: "csharp", php: "php", css: "css", scss: "scss", less: "less",
    html: "html", json: "json", yaml: "yaml", yml: "yaml",
    md: "markdown", sql: "sql", sh: "shell", bash: "shell",
    tf: "hcl", vue: "html", svelte: "html", xml: "xml",
    toml: "ini", cfg: "ini", kt: "kotlin", dart: "dart",
    swift: "swift", lua: "lua",
  }
  return langMap[ext] || "plaintext"
}

function getFileStatusColor(status: DiffFileEntry["status"]): string {
  switch (status) {
    case "accepted": return "text-green-400 border-green-500/20 bg-green-500/8"
    case "rejected": return "text-red-400 border-red-500/20 bg-red-500/8"
    default: return "text-amber-400 border-amber-500/20 bg-amber-500/8"
  }
}

function getHunkStatusIcon(status: DiffHunkStatus["status"]) {
  switch (status) {
    case "accepted": return <Check className="h-2.5 w-2.5 text-green-400" />
    case "rejected": return <X className="h-2.5 w-2.5 text-red-400" />
    default: return <div className="h-2 w-2 rounded-full bg-amber-400/60" />
  }
}

function getHunkStatusColor(status: DiffHunkStatus["status"]): string {
  switch (status) {
    case "accepted": return "bg-green-500/10 border-green-500/20"
    case "rejected": return "bg-red-500/10 border-red-500/20"
    default: return "bg-white/[0.02] border-white/[0.06]"
  }
}

const MONACO_COMMON_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  fontSize: 11,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  lineNumbers: "on",
  renderSideBySide: true,
  readOnly: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  folding: true,
  automaticLayout: true,
  wordWrap: "off",
  lineDecorationsWidth: 4,
  lineNumbersMinChars: 3,
  glyphMargin: false,
  renderWhitespace: "boundary",
  scrollbar: {
    verticalScrollbarSize: 6,
    horizontalScrollbarSize: 6,
    useShadows: false,
  },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  bracketPairColorization: { enabled: true },
}

export function SideBySideDiff({
  file,
  onAcceptAll,
  onRejectAll,
  onAcceptHunk,
  onRejectHunk,
  expanded = true,
  onToggleExpand,
}: SideBySideDiffProps) {
  const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null)
  const language = useMemo(() => detectLanguage(file.path), [file.path])

  const handleMount = useCallback(
    (editor: editor.IStandaloneDiffEditor) => {
      editorRef.current = editor
    },
    [],
  )

  const fileName = file.path.split("/").pop() || file.path
  const totalAdditions = file.hunks.reduce((s, h) => s + h.additions, 0)
  const totalDeletions = file.hunks.reduce((s, h) => s + h.deletions, 0)
  const acceptedHunks = file.hunks.filter((h) => h.status === "accepted").length
  const rejectedHunks = file.hunks.filter((h) => h.status === "rejected").length
  const pendingHunks = file.hunks.filter((h) => h.status === "pending").length
  const isAllAccepted = file.status === "accepted"
  const isAllRejected = file.status === "rejected"
  const isPending = file.status === "pending"

  const diffEditorOptions = useMemo(() => ({
    ...MONACO_COMMON_OPTIONS,
    originalEditable: false,
    enableSplitViewResizing: true,
    splitViewDefaultRatio: 0.5,
    diffCodeLens: false,
    renderIndicators: true,
    ignoreTrimWhitespace: true,
    maxComputationTime: 5000,
  }), [])

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/[0.06] bg-black/20 overflow-hidden"
    >
      {/* File header */}
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 border-b transition-colors",
        isAllAccepted ? "border-green-500/10 bg-green-500/[0.02]" :
        isAllRejected ? "border-red-500/10 bg-red-500/[0.02]" :
        "border-white/[0.06] bg-white/[0.02]",
      )}>
        {/* Expand/collapse */}
        {onToggleExpand && (
          <button
            onClick={() => onToggleExpand(file.path)}
            className="rounded p-0.5 text-white/20 hover:text-white/50 transition-colors"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        )}

        {/* File icon + name */}
        <FileText className="h-3.5 w-3.5 text-white/30 shrink-0" />
        <span className="text-xs font-medium text-white/70 truncate flex-1 min-w-0">
          {fileName}
        </span>

        {/* Status badge */}
        <span className={cn(
          "px-1.5 py-0.5 rounded text-[9px] font-medium border",
          getFileStatusColor(file.status),
        )}>
          {isAllAccepted ? "Accepted" : isAllRejected ? "Rejected" : "Pending"}
        </span>

        {/* Additions/deletions counts */}
        {totalAdditions > 0 && (
          <span className="text-[10px] text-green-400/70 font-mono shrink-0">
            +{totalAdditions}
          </span>
        )}
        {totalDeletions > 0 && (
          <span className="text-[10px] text-red-400/70 font-mono shrink-0">
            -{totalDeletions}
          </span>
        )}

        {/* Language */}
        <span className="text-[9px] text-white/20 font-mono hidden sm:inline shrink-0">
          {language}
        </span>        {/* Accept All / Reject All — only when pending and callbacks provided */}
          {isPending && (onAcceptAll || onRejectAll) && (
            <div className="flex items-center gap-1 ml-auto shrink-0">
              {onRejectAll && (
                <button
                  onClick={() => onRejectAll(file.path)}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20"
                  title="Reject all changes in this file"
                >
                  <XCircle className="h-2.5 w-2.5" />
                  Reject
                </button>
              )}
              {onAcceptAll && (
                <button
                  onClick={() => onAcceptAll(file.path)}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] text-green-400/60 hover:text-green-400 hover:bg-green-500/10 transition-all border border-transparent hover:border-green-500/20"
                  title="Accept all changes in this file"
                >
                  <CheckCheck className="h-2.5 w-2.5" />
                  Accept
                </button>
              )}
            </div>
          )}

        {/* Completed status indicators */}
        {isAllAccepted && (
          <span className="text-[9px] text-green-400/50 shrink-0">
            ✓ {acceptedHunks}/{file.hunks.length} hunks
          </span>
        )}
        {isAllRejected && (
          <span className="text-[9px] text-red-400/50 shrink-0">
            ✗ All rejected
          </span>
        )}
      </div>

      {/* Monaco DiffEditor */}
      {expanded && (
        <div className="relative">
          <div className="h-[300px] min-h-[200px] max-h-[500px]">
            <DiffEditor
              original={file.originalContent}
              modified={getReviewedContent(file)}
              language={language}
              options={diffEditorOptions}
              onMount={handleMount}
              theme="vs-dark"
            />
          </div>

          {/* Hunk-level action bar — shows per-hunk accept/reject */}
          {file.hunks.length > 0 && (
            <div className="border-t border-white/[0.06] bg-white/[0.01]">
              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/[0.04]">
                <span className="text-[9px] font-medium text-white/20 uppercase tracking-wider">
                  Changes ({file.hunks.length})
                </span>
                <span className="text-[9px] text-green-400/50">✓ {acceptedHunks}</span>
                <span className="text-[9px] text-red-400/50">✗ {rejectedHunks}</span>
                <span className="text-[9px] text-amber-400/50">○ {pendingHunks}</span>
              </div>

              {/* Hunk list */}
              <div className="max-h-[120px] overflow-y-auto divide-y divide-white/[0.03]">
                {file.hunks.map((hunk, idx) => {
                  const isHunkPending = hunk.status === "pending"
                  const isHunkAccepted = hunk.status === "accepted"
                  const isHunkRejected = hunk.status === "rejected"

                  return (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 transition-colors",
                        getHunkStatusColor(hunk.status),
                      )}
                    >
                      {/* Status indicator */}
                      <div className="shrink-0">
                        {getHunkStatusIcon(hunk.status)}
                      </div>

                      {/* Hunk header */}
                      <code className="text-[10px] font-mono text-white/40 flex-1 min-w-0 truncate">
                        {hunk.header}
                      </code>

                      {/* Line counts */}
                      <span className="text-[9px] text-green-400/50 font-mono shrink-0">
                        +{hunk.additions}
                      </span>
                      <span className="text-[9px] text-red-400/50 font-mono shrink-0">
                        -{hunk.deletions}
                      </span>

                      {/* Action buttons — only when pending */}
                      {isHunkPending && (onRejectHunk || onAcceptHunk) && (
                        <div className="flex items-center gap-1 shrink-0">
                          {onRejectHunk && (
                            <button
                              onClick={() => onRejectHunk(file.path, hunk.hunkIndex)}
                              className="rounded p-0.5 text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
                              title="Reject this hunk"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                          {onAcceptHunk && (
                            <button
                              onClick={() => onAcceptHunk(file.path, hunk.hunkIndex)}
                              className="rounded p-0.5 text-white/20 hover:text-green-400 hover:bg-green-500/10 transition-all"
                              title="Accept this hunk"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Accepted/rejected indicator */}
                      {isHunkAccepted && (
                        <span className="text-[9px] text-green-400/40 shrink-0">
                          Accepted
                        </span>
                      )}
                      {isHunkRejected && (
                        <span className="text-[9px] text-red-400/40 shrink-0">
                          Rejected
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsed state — show summary */}
      {!expanded && (
        <div className="px-3 py-2 flex items-center gap-2">
          <span className="text-[10px] text-white/30">{file.hunks.length} hunk(s)</span>
          <span className="text-[10px] text-green-400/50">+{totalAdditions}</span>
          <span className="text-[10px] text-red-400/50">-{totalDeletions}</span>
          {isAllAccepted && <span className="text-[9px] text-green-400/60">✓ Accepted</span>}
          {isAllRejected && <span className="text-[9px] text-red-400/60">✗ Rejected</span>}
        </div>
      )}
    </motion.div>
  )
}
