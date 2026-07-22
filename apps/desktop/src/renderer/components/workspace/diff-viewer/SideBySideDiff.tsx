import { useRef, useCallback, useMemo, useState, useEffect } from "react"
import { DiffEditor } from "@monaco-editor/react"
import type { editor } from "monaco-editor"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { getReviewedContent } from "@/lib/diff-review"
import {
  Check, X, CheckCheck, XCircle, FileText,
  ChevronDown, ChevronRight, MessageSquare, Send, Sparkles,
} from "lucide-react"
import type { DiffFileEntry, DiffHunkStatus } from "@/stores/diff-store"
import { useDiffReviewStore, type ReviewComment } from "@/stores/diff-review-store"

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
    case "accepted": return "text-[var(--color-accent-green)] border-[var(--color-accent-green)]/20 bg-green-500/8"
    case "rejected": return "text-[var(--color-accent-red)] border-[var(--color-accent-red)]/20 bg-red-500/8"
    default: return "text-[var(--color-accent-amber)] border-[var(--color-accent-amber)]/20 bg-amber-500/8"
  }
}

function getHunkStatusIcon(status: DiffHunkStatus["status"]) {
  switch (status) {
    case "accepted": return <Check className="h-2.5 w-2.5 text-[var(--color-accent-green)]" />
    case "rejected": return <X className="h-2.5 w-2.5 text-[var(--color-accent-red)]" />
    default: return <div className="h-2 w-2 rounded-full bg-[var(--color-accent-amber)]/60" />
  }
}

function getHunkStatusColor(status: DiffHunkStatus["status"]): string {
  switch (status) {
    case "accepted": return "bg-[var(--color-accent-green)]/10 border-[var(--color-accent-green)]/20"
    case "rejected": return "bg-[var(--color-accent-red)]/10 border-[var(--color-accent-red)]/20"
    default: return "bg-[var(--border-subtle)] border-[var(--border-default)]"
  }
}

function parseHunkHeader(header: string): { newStart: number; newLines: number } | null {
  const match = header.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
  if (!match) return null
  return {
    newStart: parseInt(match[1], 10),
    newLines: match[2] ? parseInt(match[2], 10) : 1,
  }
}

function findHunkForLine(file: DiffFileEntry, lineNumber: number): number {
  for (let i = 0; i < file.hunks.length; i++) {
    const parsed = parseHunkHeader(file.hunks[i].header)
    if (parsed) {
      const endLine = parsed.newStart + parsed.newLines - 1
      if (lineNumber >= parsed.newStart && lineNumber <= endLine) {
        return i
      }
    }
  }
  return -1
}

function getSeverityColor(severity: ReviewComment["severity"]): string {
  switch (severity) {
    case "error": return "bg-red-500/15 text-red-400 border-red-500/20"
    case "warning": return "bg-amber-500/15 text-amber-400 border-amber-500/20"
    case "info": return "bg-blue-500/15 text-blue-400 border-blue-500/20"
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
  const modifiedEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const decorationsRef = useRef<string[]>([])
  const language = useMemo(() => detectLanguage(file.path), [file.path])

  const reviewComments = useDiffReviewStore((s) => s.comments)
  const activeDraft = useDiffReviewStore((s) => s.activeDraft)
  const setActiveDraft = useDiffReviewStore((s) => s.setActiveDraft)
  const addComment = useDiffReviewStore((s) => s.addComment)
  const getCommentsForHunk = useDiffReviewStore((s) => s.getCommentsForHunk)
  const getHunkCommentCount = useDiffReviewStore((s) => s.getHunkCommentCount)
  const reviewInProgress = useDiffReviewStore((s) => s.reviewInProgress)

  const [draftText, setDraftText] = useState("")
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())

  const handleMount = useCallback(
    (editor: editor.IStandaloneDiffEditor) => {
      editorRef.current = editor
      const modified = editor.getModifiedEditor()
      modifiedEditorRef.current = modified

      modified.onMouseDown((e) => {
        const pos = e.target.position
        if (!pos) return

        const lineNumber = pos.lineNumber
        const hunkIndex = findHunkForLine(file, lineNumber)
        if (hunkIndex === -1) return

        setActiveDraft({
          filePath: file.path,
          hunkIndex,
          lineNumber,
        })
        setDraftText("")
      })
    },
    [file, setActiveDraft],
  )

  const fileComments = useMemo(() => {
    const all: ReviewComment[] = []
    const seen = new Set<string>()
    for (const [, comments] of reviewComments) {
      for (const c of comments) {
        if (c.filePath === file.path && !seen.has(c.id)) {
          all.push(c)
          seen.add(c.id)
        }
      }
    }
    return all
  }, [reviewComments, file.path])

  const lineComments = useMemo(() => {
    const map = new Map<number, ReviewComment[]>()
    for (const c of fileComments) {
      const existing = map.get(c.lineNumber) ?? []
      existing.push(c)
      map.set(c.lineNumber, existing)
    }
    return map
  }, [fileComments])

  useEffect(() => {
    const modified = modifiedEditorRef.current
    if (!modified || typeof modified.createDecorationsCollection !== "function") return

    const commentLines = [...lineComments.keys()]
    const decorations = commentLines.map((line) => ({
      range: {
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: 1,
      },
      options: {
        isWholeLine: true,
        className: "bg-[var(--color-accent-amber)]/8",
      },
    }))

    try {
      decorationsRef.current = modified.deltaDecorations(decorationsRef.current, decorations as any)
    } catch {
      // Monaco may not be fully initialized
    }
  }, [fileComments, lineComments])

  const handleDraftSubmit = useCallback(() => {
    if (!activeDraft || !draftText.trim()) return

    addComment({
      id: `user-comment-${Date.now()}`,
      filePath: activeDraft.filePath,
      hunkIndex: activeDraft.hunkIndex,
      lineNumber: activeDraft.lineNumber,
      author: "user",
      content: draftText.trim(),
      parentId: null,
      severity: "info",
      category: "question",
      createdAt: Date.now(),
    })

    setDraftText("")
    setActiveDraft(null)
  }, [activeDraft, draftText, addComment, setActiveDraft])

  const handleReplySubmit = useCallback((parentId: string, content: string) => {
    if (!content.trim()) return
    addComment({
      id: `user-reply-${Date.now()}`,
      filePath: file.path,
      hunkIndex: 0,
      lineNumber: 0,
      author: "user",
      content: content.trim(),
      parentId,
      severity: "info",
      category: "question",
      createdAt: Date.now(),
    })
  }, [file.path, addComment])

  const toggleCommentThread = useCallback((threadId: string) => {
    setExpandedComments((prev) => {
      const next = new Set(prev)
      if (next.has(threadId)) next.delete(threadId)
      else next.add(threadId)
      return next
    })
  }, [])

  const fileName = file.path.split("/").pop() || file.path
  const totalAdditions = file.hunks.reduce((s, h) => s + h.additions, 0)
  const totalDeletions = file.hunks.reduce((s, h) => s + h.deletions, 0)
  const acceptedHunks = file.hunks.filter((h) => h.status === "accepted").length
  const rejectedHunks = file.hunks.filter((h) => h.status === "rejected").length
  const pendingHunks = file.hunks.filter((h) => h.status === "pending").length
  const isAllAccepted = file.status === "accepted"
  const isAllRejected = file.status === "rejected"
  const isPending = file.status === "pending"

  const maxComputationTime = useMemo(() => {
    const totalChars = (file.originalContent?.length ?? 0) + (getReviewedContent(file)?.length ?? 0)
    return Math.max(5000, Math.min(30000, Math.round(totalChars / 100) * 100))
  }, [file.originalContent, file])

  const diffEditorOptions = useMemo(() => ({
    ...MONACO_COMMON_OPTIONS,
    originalEditable: false,
    enableSplitViewResizing: true,
    splitViewDefaultRatio: 0.5,
    diffCodeLens: false,
    renderIndicators: true,
    ignoreTrimWhitespace: true,
    maxComputationTime,
  }), [maxComputationTime])

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)]/50 overflow-hidden",
        expanded && "flex flex-col flex-1 min-h-0",
      )}
    >
      {/* File header */}
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 border-b transition-colors",
        isAllAccepted ? "border-[var(--color-accent-green)]/10 bg-[var(--color-accent-green)]/[0.02]" :
        isAllRejected ? "border-[var(--color-accent-red)]/10 bg-[var(--color-accent-red)]/[0.02]" :
        "border-[var(--border-default)] bg-[var(--border-subtle)]",
      )}>
        {onToggleExpand && (
          <button
            onClick={() => onToggleExpand(file.path)}
            className="rounded p-0.5 text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        )}

        <FileText className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" />
        <span className="text-xs font-medium text-[var(--text-secondary)] truncate flex-1 min-w-0">
          {fileName}
        </span>

        <span className={cn(
          "px-1.5 py-0.5 rounded text-[9px] font-medium border",
          getFileStatusColor(file.status),
        )}>
          {isAllAccepted ? "Accepted" : isAllRejected ? "Rejected" : "Pending"}
        </span>

        {totalAdditions > 0 && (
          <span className="text-[10px] text-[var(--color-accent-green)]/70 font-mono shrink-0">
            +{totalAdditions}
          </span>
        )}
        {totalDeletions > 0 && (
          <span className="text-[10px] text-[var(--color-accent-red)]/70 font-mono shrink-0">
            -{totalDeletions}
          </span>
        )}

        <span className="text-[9px] text-[var(--text-quaternary)] font-mono hidden sm:inline shrink-0">
          {language}
        </span>
        {isPending && (onAcceptAll || onRejectAll) && (
          <div className="flex items-center gap-1 ml-auto shrink-0">
            {onRejectAll && (
              <button
                onClick={() => onRejectAll(file.path)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] text-[var(--color-accent-red)]/60 hover:text-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/10 transition-all border border-transparent hover:border-[var(--color-accent-red)]/20"
                title="Reject all changes in this file"
              >
                <XCircle className="h-2.5 w-2.5" />
                Reject
              </button>
            )}
            {onAcceptAll && (
              <button
                onClick={() => onAcceptAll(file.path)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] text-[var(--color-accent-green)]/60 hover:text-[var(--color-accent-green)] hover:bg-[var(--color-accent-green)]/10 transition-all border border-transparent hover:border-[var(--color-accent-green)]/20"
                title="Accept all changes in this file"
              >
                <CheckCheck className="h-2.5 w-2.5" />
                Accept
              </button>
            )}
          </div>
        )}

        {isAllAccepted && (
          <span className="text-[9px] text-[var(--color-accent-green)]/50 shrink-0">
            ✓ {acceptedHunks}/{file.hunks.length} hunks
          </span>
        )}
        {isAllRejected && (
          <span className="text-[9px] text-[var(--color-accent-red)]/50 shrink-0">
            ✗ All rejected
          </span>
        )}
      </div>

      {/* Monaco DiffEditor */}
      {expanded && (
        <div className="relative flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-[200px]">
            <DiffEditor
              original={file.originalContent}
              modified={getReviewedContent(file)}
              language={language}
              options={diffEditorOptions}
              onMount={handleMount}
              theme="vs-dark"
            />
          </div>

          {/* Comment indicators */}
          {fileComments.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 border-b border-[var(--border-subtle)] bg-[var(--surface-panel)]/10">
              <MessageSquare className="h-3 w-3 text-[var(--color-accent-amber)]" />
              <span className="text-[9px] text-[var(--text-tertiary)]">
                {fileComments.length} review comment{fileComments.length !== 1 ? "s" : ""}
              </span>
              {reviewInProgress && (
                <span className="flex items-center gap-1 text-[9px] text-[var(--text-quaternary)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--color-accent-amber)] animate-pulse" />
                  AI reviewing...
                </span>
              )}
            </div>
          )}

          {/* Hunk-level action bar */}
          {file.hunks.length > 0 && (
            <div className="border-t border-[var(--border-default)] bg-[var(--surface-panel)]/20">
              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[var(--border-subtle)]">
                <span className="text-[9px] font-medium text-[var(--text-quaternary)] uppercase tracking-wider">
                  Changes ({file.hunks.length})
                </span>
                <span className="text-[9px] text-[var(--color-accent-green)]/50">✓ {acceptedHunks}</span>
                <span className="text-[9px] text-[var(--color-accent-red)]/50">✗ {rejectedHunks}</span>
                <span className="text-[9px] text-[var(--color-accent-amber)]/50">○ {pendingHunks}</span>
              </div>

              {/* Hunk list */}
              <div className="max-h-[300px] overflow-y-auto divide-y divide-white/[0.03]">
                {file.hunks.map((hunk, idx) => {
                  const isHunkPending = hunk.status === "pending"
                  const isHunkAccepted = hunk.status === "accepted"
                  const isHunkRejected = hunk.status === "rejected"
                  const hunkCommentCount = getHunkCommentCount(file.path, idx)
                  const hunkCommentList = getCommentsForHunk(file.path, idx)
                  const isDraftTarget = activeDraft?.filePath === file.path && activeDraft?.hunkIndex === idx

                  return (
                    <div key={idx}>
                      {/* Hunk row */}
                      <div
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 transition-colors cursor-pointer hover:bg-[var(--border-subtle)]/50",
                          getHunkStatusColor(hunk.status),
                          isDraftTarget && "ring-1 ring-[var(--color-accent-amber)]/30",
                        )}
                        onClick={() => {
                          setActiveDraft({
                            filePath: file.path,
                            hunkIndex: idx,
                            lineNumber: activeDraft?.filePath === file.path && activeDraft?.hunkIndex === idx
                              ? activeDraft.lineNumber
                              : (parseHunkHeader(hunk.header)?.newStart ?? 1),
                          })
                          setDraftText("")
                        }}
                      >
                        <div className="shrink-0">
                          {getHunkStatusIcon(hunk.status)}
                        </div>

                        <code className="text-[10px] font-mono text-[var(--text-tertiary)] flex-1 min-w-0 truncate">
                          {hunk.header}
                        </code>

                        <span className="text-[9px] text-[var(--color-accent-green)]/50 font-mono shrink-0">
                          +{hunk.additions}
                        </span>
                        <span className="text-[9px] text-[var(--color-accent-red)]/50 font-mono shrink-0">
                          -{hunk.deletions}
                        </span>

                        {/* Comment count badge */}
                        {hunkCommentCount > 0 && (
                          <span className="flex items-center gap-0.5 text-[9px] text-[var(--color-accent-amber)]/70 font-mono shrink-0">
                            <MessageSquare className="h-2.5 w-2.5" />
                            {hunkCommentCount}
                          </span>
                        )}

                        {/* Action buttons — only when pending */}
                        {isHunkPending && (onRejectHunk || onAcceptHunk) && (
                          <div className="flex items-center gap-1 shrink-0">
                            {onRejectHunk && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onRejectHunk(file.path, hunk.hunkIndex) }}
                                className="rounded p-0.5 text-[var(--text-quaternary)] hover:text-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/10 transition-all"
                                title="Reject this hunk"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                            {onAcceptHunk && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onAcceptHunk(file.path, hunk.hunkIndex) }}
                                className="rounded p-0.5 text-[var(--text-quaternary)] hover:text-[var(--color-accent-green)] hover:bg-[var(--color-accent-green)]/10 transition-all"
                                title="Accept this hunk"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        )}

                        {isHunkAccepted && (
                          <span className="text-[9px] text-[var(--color-accent-green)]/40 shrink-0">Accepted</span>
                        )}
                        {isHunkRejected && (
                          <span className="text-[9px] text-[var(--color-accent-red)]/40 shrink-0">Rejected</span>
                        )}
                      </div>

                      {/* Draft comment input */}
                      <AnimatePresence>
                        {isDraftTarget && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 py-2 bg-[var(--surface-panel)]/30 border-t border-[var(--border-subtle)]">
                              {activeDraft && (
                                <div className="text-[8px] text-[var(--text-quaternary)] font-mono mb-1">
                                  Line {activeDraft.lineNumber}
                                </div>
                              )}
                              <textarea
                                value={draftText}
                                onChange={(e) => setDraftText(e.target.value)}
                                placeholder="Add a comment..."
                                rows={2}
                                className="w-full bg-[var(--surface-panel)] border border-[var(--border-default)] rounded px-2 py-1 text-[10px] text-[var(--text-secondary)] placeholder:text-[var(--text-quaternary)] resize-none outline-none focus:border-[var(--accent-code)]/40 transition-colors"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault()
                                    handleDraftSubmit()
                                  }
                                  if (e.key === "Escape") {
                                    setActiveDraft(null)
                                    setDraftText("")
                                  }
                                }}
                                autoFocus
                              />
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-[8px] text-[var(--text-quaternary)]">
                                  {activeDraft?.lineNumber && `Line ${activeDraft.lineNumber}`}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => { setActiveDraft(null); setDraftText("") }}
                                    className="text-[9px] text-[var(--text-quaternary)] hover:text-[var(--text-tertiary)] px-1.5 py-0.5 rounded transition-colors"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={handleDraftSubmit}
                                    disabled={!draftText.trim()}
                                    className="flex items-center gap-1 text-[9px] text-[var(--color-accent-amber)] disabled:text-[var(--text-quaternary)] px-1.5 py-0.5 rounded hover:bg-[var(--color-accent-amber)]/10 transition-colors disabled:cursor-not-allowed"
                                  >
                                    <Send className="h-2.5 w-2.5" />
                                    Comment
                                  </button>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Review comments for this hunk */}
                      {hunkCommentList.length > 0 && (
                        <div className="border-t border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
                          {hunkCommentList.map((comment) => {
                            const threadId = comment.parentId ?? comment.id
                            const isThreadExpanded = expandedComments.has(threadId)

                            return (
                              <div key={comment.id} className="px-4 py-1.5">
                                <div className="flex items-start gap-2">
                                  <span className={cn(
                                    "px-1 rounded text-[8px] font-medium border shrink-0 mt-0.5",
                                    comment.author === "ai" ? getSeverityColor(comment.severity) : "bg-[var(--border-subtle)] text-[var(--text-tertiary)] border-[var(--border-default)]",
                                  )}>
                                    {comment.author === "ai" ? (
                                      <span className="flex items-center gap-0.5">
                                        <Sparkles className="h-2 w-2" />
                                        {comment.category}
                                      </span>
                                    ) : "you"}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
                                      {comment.content}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-[8px] text-[var(--text-quaternary)]">
                                        {comment.lineNumber > 0 && `line ${comment.lineNumber}`}
                                        {comment.lineNumber > 0 && comment.createdAt && " · "}
                                        {new Date(comment.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                      </span>
                                      {comment.author === "ai" && !comment.parentId && (
                                        <button
                                          onClick={() => toggleCommentThread(threadId)}
                                          className="text-[8px] text-[var(--text-quaternary)] hover:text-[var(--text-tertiary)] transition-colors"
                                        >
                                          {isThreadExpanded ? "Hide replies" : "Reply"}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Reply input (expanded) */}
                                {comment.author === "ai" && !comment.parentId && isThreadExpanded && (
                                  <ReplyInput
                                    parentId={comment.id}
                                    onSubmit={handleReplySubmit}
                                    onCancel={() => toggleCommentThread(threadId)}
                                  />
                                )}
                              </div>
                            )
                          })}
                        </div>
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
          <span className="text-[10px] text-[var(--text-tertiary)]">{file.hunks.length} hunk(s)</span>
          <span className="text-[10px] text-[var(--color-accent-green)]/50">+{totalAdditions}</span>
          <span className="text-[10px] text-[var(--color-accent-red)]/50">-{totalDeletions}</span>
          {fileComments.length > 0 && (
            <span className="text-[9px] text-[var(--color-accent-amber)]/60">
              {fileComments.length} comment{fileComments.length !== 1 ? "s" : ""}
            </span>
          )}
          {isAllAccepted && <span className="text-[9px] text-[var(--color-accent-green)]/60">✓ Accepted</span>}
          {isAllRejected && <span className="text-[9px] text-[var(--color-accent-red)]/60">✗ Rejected</span>}
        </div>
      )}
    </motion.div>
  )
}

function ReplyInput({
  parentId,
  onSubmit,
  onCancel,
}: {
  parentId: string
  onSubmit: (parentId: string, content: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState("")

  return (
    <div className="mt-1 ml-6">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask a follow-up..."
        rows={2}
        className="w-full bg-[var(--surface-panel)] border border-[var(--border-default)] rounded px-2 py-1 text-[10px] text-[var(--text-secondary)] placeholder:text-[var(--text-quaternary)] resize-none outline-none focus:border-[var(--accent-code)]/40 transition-colors"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            onSubmit(parentId, text)
            setText("")
            onCancel()
          }
          if (e.key === "Escape") {
            onCancel()
          }
        }}
        autoFocus
      />
      <div className="flex items-center justify-end gap-1 mt-1">
        <button
          onClick={onCancel}
          className="text-[8px] text-[var(--text-quaternary)] hover:text-[var(--text-tertiary)] px-1 py-0.5 rounded transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => { onSubmit(parentId, text); setText(""); onCancel() }}
          disabled={!text.trim()}
          className="flex items-center gap-1 text-[8px] text-[var(--color-accent-amber)] disabled:text-[var(--text-quaternary)] px-1 py-0.5 rounded hover:bg-[var(--color-accent-amber)]/10 transition-colors disabled:cursor-not-allowed"
        >
          <Send className="h-2 w-2" />
          Reply
        </button>
      </div>
    </div>
  )
}
