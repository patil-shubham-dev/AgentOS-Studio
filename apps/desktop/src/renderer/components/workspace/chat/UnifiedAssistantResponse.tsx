import { memo, useMemo, useCallback, useState, useEffect, useRef } from "react"
import { useShallow } from "zustand/shallow"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, Bug, ChevronRight, ChevronDown, Clock } from "lucide-react"
import { useAppStore } from "@/stores/app-store"
import { useTimelineStore, type AgentSession } from "../timeline/timeline-store"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { ChangeSetManager } from "@/runtime/changeset/ChangeSetManager"
import { useChangeSetStore } from "@/runtime/changeset/ChangeSetStore"
import { ThinkingCard } from "./ThinkingCard"
import { ToolCard, FileEditCard, TerminalCard } from "./ToolCard"
import { TerminalRetryChain } from "./TerminalRetryChain"
import { ResponseStream } from "./ResponseStream"
import { ProviderErrorCard } from "./ProviderErrorCard"
import { classifyProviderError } from "@/runtime/providers/ProviderError"
import { CollapsibleSection } from "./CollapsibleSection"
import { TerminalFeedbackLoop } from "./TerminalFeedbackLoop"
import type { TerminalRecord } from "../timeline/step-card"
import { cn } from "@/lib/utils"
import { ANIM } from "./chat-animations"

interface UnifiedAssistantResponseProps {
  stepIds: string[]
  isLatest: boolean
  onRetry?: (input: string) => void
  originalInput?: string
}

export const UnifiedAssistantResponse = memo(function UnifiedAssistantResponse({
  stepIds, isLatest, onRetry, originalInput,
}: UnifiedAssistantResponseProps) {
  const sessions = useTimelineStore(useShallow((s) => stepIds.map(id => s.agentSessions.get(id)).filter(Boolean) as AgentSession[]))
  const viewMode = useTimelineStore((s) => s.viewMode)

  // Derive all states from merged sessions
  const isThinking = useMemo(() =>
    sessions.some(s => s.streamState === "streaming" || s.streamState === "not_started" || s.streamState === "loading_slowly"),
    [sessions],
  )
  const isComplete = useMemo(() =>
    sessions.length > 0 && sessions.every(s => s.streamState === "completed"),
    [sessions],
  )
  const isError = useMemo(() =>
    sessions.some(s => s.streamState === "failed"),
    [sessions],
  )
  const hasContent = useMemo(() =>
    sessions.some(s => (s.streamingText?.length ?? 0) > 0),
    [sessions],
  )
  const hasReasoning = useMemo(() =>
    sessions.some(s => (s.reasoningText?.length ?? 0) > 0),
    [sessions],
  )
  const hasTools = useMemo(() =>
    sessions.some(s => s.toolCalls.length > 0),
    [sessions],
  )
  const hasFileEdits = useMemo(() =>
    sessions.some(s => s.fileEdits.length > 0),
    [sessions],
  )
  const hasTerminals = useMemo(() =>
    sessions.some(s => s.terminalOutputs.length > 0),
    [sessions],
  )

  const primarySession = sessions[0]
  const primaryText = primarySession?.streamingText ?? sessions.find(s => s.streamingText)?.streamingText ?? ""
  const reasoningText = sessions.find(s => s.reasoningText)?.reasoningText ?? ""
  const reasoningTokens = useMemo(() =>
    sessions.reduce((sum, s) => sum + (s.streamingMetrics?.tokensReceived ?? 0), 0),
    [sessions],
  )
  const allErrors = sessions.flatMap(s => s.toolCalls.filter(tc => tc.status === "error"))
  const firstError = sessions.find(s => s.error)

  // Flatten all tool calls, file edits, and terminal outputs across sessions
  const allToolCalls = useMemo(() =>
    sessions.flatMap(s => s.toolCalls).filter(Boolean),
    [sessions],
  )
  const allFileEdits = useMemo(() =>
    sessions.flatMap(s => s.fileEdits).filter(Boolean),
    [sessions],
  )
  const allTerminals = useMemo(() =>
    sessions.flatMap(s => s.terminalOutputs).filter(Boolean) as TerminalRecord[],
    [sessions],
  )

  // Group consecutive identical commands into retry chains
  const terminalGroups = useMemo(() => {
    const groups: Array<{ type: "single"; terminal: TerminalRecord } | { type: "chain"; attempts: TerminalRecord[] }> = []
    let i = 0
    while (i < allTerminals.length) {
      const current = allTerminals[i]
      const next = allTerminals[i + 1]
      if (
        next &&
        current.command === next.command &&
        current.exitCode !== 0 &&
        current.exitCode !== undefined
      ) {
        const attempts: TerminalRecord[] = [current]
        let j = i + 1
        while (j < allTerminals.length && allTerminals[j].command === current.command) {
          attempts.push(allTerminals[j])
          j++
        }
        groups.push({ type: "chain", attempts })
        i = j
      } else {
        groups.push({ type: "single", terminal: current })
        i++
      }
    }
    return groups
  }, [allTerminals])

  const startedAt = primarySession?.startedAt ?? Date.now()
  const liveStepTitle = primarySession?.currentPhase ?? primarySession?.phaseHistory.at(-1)?.label ?? "Analyzing context"

  // Conflict detection
  const [dismissedCommands, setDismissedCommands] = useState<Set<string>>(new Set())
  const [autoFixing, setAutoFixing] = useState<Set<string>>(new Set())
  const [autoFixResults, setAutoFixResults] = useState<Map<string, { success: boolean; message: string }>>(new Map())

  const [conflicts, setConflicts] = useState<{ file: string; hasConflict: boolean }[]>([])
  useEffect(() => {
    const mainStepId = stepIds[0]
    if (!mainStepId) return
    const changeSetId = useChangeSetStore.getState().getChangeSetsBySession(mainStepId)[0]?.id
    if (!changeSetId || !isComplete) return
    const root = useWorkspaceStore.getState().rootPath
    if (!root) return
    ChangeSetManager.getInstance().detectConflicts(changeSetId, root).then((results) => {
      setConflicts(results.filter((r) => r.hasConflict).map((r) => ({ file: r.file, hasConflict: true })))
    }).catch(() => {})
  }, [stepIds, isComplete])

  const handleOpenFile = useCallback((path: string) => {
    useWorkspaceStore.getState().openFileInDiffMode(path)
  }, [])

  const handleTerminalRetry = useCallback((command: string) => {
    if (!onRetry) return
    onRetry(`Run this command again:\n\n\`\`\`bash\n${command}\n\`\`\``)
  }, [onRetry])

  const handleTerminalFixAndRetry = useCallback((command: string, output: string) => {
    if (!onRetry) return
    setAutoFixing((prev) => new Set(prev).add(command))
    const truncatedOutput = output.length > 3000 ? output.slice(0, 3000) + "\n... [truncated]" : output
    onRetry(
      `The command \`${command}\` failed. Diagnose the error, apply a fix, and re-run the command.\n` +
      `Command: \`${command}\`\n\nError output:\n\`\`\`\n${truncatedOutput}\n\`\`\``
    )
    setTimeout(() => {
      setAutoFixing((prev) => { const next = new Set(prev); next.delete(command); return next })
      setAutoFixResults((prev) => { const next = new Map(prev); next.set(command, { success: true, message: "Diagnostic sent to AI" }); return next })
    }, 500)
  }, [onRetry])

  const handleTerminalSkip = useCallback((command: string) => {
    setDismissedCommands((prev) => new Set(prev).add(command))
  }, [])

  if (sessions.length === 0) return null

  return (
    <motion.div
      {...ANIM.slideUp}
      className="px-1 py-0.5 space-y-2"
    >
      {/* ── Thinking / Reasoning ── */}
      {viewMode === "verbose" && (isThinking || (isComplete && hasReasoning)) && (
        <ThinkingCard
          isThinking={isThinking}
          reasoningText={reasoningText}
          startedAt={startedAt}
          reasoningTokens={reasoningTokens}
          stepId={stepIds[0]}
          liveStepTitle={liveStepTitle}
        />
      )}

      {/* ── Tool Calls (collapsible) ── */}
      {viewMode !== "summary" && hasTools && (isThinking || isComplete) && allToolCalls.length > 0 && (
        <CollapsibleSection id={`tools-${stepIds[0]}`} label="Tool Calls" count={allToolCalls.length}>
          <div className="space-y-1.5">
            {allToolCalls.map((tc) => (
              <ToolCard key={tc.id} toolCall={tc} onOpenFile={handleOpenFile} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* ── File Edits (collapsible) ── */}
      {viewMode !== "summary" && hasFileEdits && (isThinking || isComplete) && allFileEdits.length > 0 && (
        <CollapsibleSection id={`edits-${stepIds[0]}`} label="File Edits" count={allFileEdits.length}>
          <div className="space-y-1.5">
            {allFileEdits.map((edit, i) => (
              <FileEditCard key={`${edit.path}-${i}`} edit={edit} onOpenFile={handleOpenFile} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* ── Terminal Commands (collapsible) ── */}
      {viewMode !== "summary" && hasTerminals && terminalGroups.length > 0 && (
        <CollapsibleSection id={`terms-${stepIds[0]}`} label="Terminal Commands" count={allTerminals.length}>
          <div className="space-y-1.5">
            {terminalGroups.map((group, i) => {
              if (group.type === "chain") {
                const lastFailed = group.attempts.findLast((a) => a.exitCode !== 0)
                return (
                  <div key={`chain-${i}`} className="space-y-1">
                    <TerminalRetryChain
                      attempts={group.attempts.map((a, idx) => ({
                        index: idx,
                        command: a.command,
                        exitCode: a.exitCode,
                        output: a.output,
                        durationMs: a.durationMs,
                      }))}
                      status={lastFailed ? "error" : "success"}
                    />
                    {lastFailed && !dismissedCommands.has(lastFailed.command) && (
                      <TerminalFeedbackLoop
                        command={lastFailed.command}
                        exitCode={lastFailed.exitCode}
                        output={lastFailed.output}
                        onRetry={() => handleTerminalRetry(lastFailed.command)}
                        onFixAndRetry={() => handleTerminalFixAndRetry(lastFailed.command, lastFailed.output)}
                        onSkip={() => handleTerminalSkip(lastFailed.command)}
                        isAutoFixing={autoFixing.has(lastFailed.command)}
                        autoFixResult={autoFixResults.get(lastFailed.command) ?? null}
                      />
                    )}
                  </div>
                )
              }
              const failed = group.terminal.exitCode != null && group.terminal.exitCode !== 0
              return (
                <div key={`term-${i}`} className="space-y-1">
                  <TerminalCard terminal={group.terminal} onOpenFile={handleOpenFile} />
                  {failed && !dismissedCommands.has(group.terminal.command) && (
                    <TerminalFeedbackLoop
                      command={group.terminal.command}
                      exitCode={group.terminal.exitCode}
                      output={group.terminal.output}
                      onRetry={() => handleTerminalRetry(group.terminal.command)}
                      onFixAndRetry={() => handleTerminalFixAndRetry(group.terminal.command, group.terminal.output)}
                      onSkip={() => handleTerminalSkip(group.terminal.command)}
                      isAutoFixing={autoFixing.has(group.terminal.command)}
                      autoFixResult={autoFixResults.get(group.terminal.command) ?? null}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* ── Response Content ── */}
      {hasContent && (
        <motion.div {...ANIM.slideUp} className="py-1">
          <div className="max-w-none text-[13px] leading-relaxed">
            <ResponseStream text={primaryText} stepId={primarySession?.stepId ?? ""} isStreaming={isThinking} />
          </div>
        </motion.div>
      )}

      {/* ── Error state ── */}
      <AnimatePresence>
        {isError && firstError && (
          <motion.div {...ANIM.slideDown} className="py-1">
            <ProviderErrorCard
              error={firstError.error ?? "Unknown error"}
              errorInfo={firstError.error ? classifyProviderError(firstError.error) : undefined}
              onRetry={onRetry && originalInput ? () => onRetry(originalInput!) : undefined}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tool errors summary ── */}
      {allErrors.length > 0 && !isError && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5"
          style={{ backgroundColor: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}
        >
          <AlertTriangle className="h-3 w-3 shrink-0 text-red-400/70" />
          <span className="text-[10px] text-red-400/70">
            {allErrors.length} tool call{allErrors.length > 1 ? "s" : ""} had errors
          </span>
        </motion.div>
      )}

      {/* ── Conflicts warning ── */}
      {conflicts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400/70" />
          <span className="text-[10px] text-amber-400/70">
            {conflicts.length} file{conflicts.length > 1 ? "s" : ""} modified externally — review carefully
          </span>
        </motion.div>
      )}

      {/* ── Completion indicator (subtle) ── */}
      {isComplete && !isError && !hasContent && !hasTools && !hasFileEdits && (
        <div className="flex items-center gap-2 py-1">
          <svg viewBox="0 0 12 12" className="h-[10px] w-[10px]" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6L5 8.5L9.5 3" />
          </svg>
          <span className="text-[10px] text-emerald-400/50 font-medium">Complete</span>
        </div>
      )}
    </motion.div>
  )
})
