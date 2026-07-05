import { UnifiedExecutionGateway } from "@/runtime/execution/UnifiedExecutionGateway"
import type { ExecutionMode } from "@/runtime/execution/UnifiedExecutor"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import type { RuntimeRole } from "@/types"
import { useAgentStore } from "@/stores/agent-store"
import { useLedgerStore } from "@/stores/ledger-store"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { adaptEvent } from "@/runtime/execution/canonical-adapter"
import { useCommandLogStore } from "@/stores/command-log-store"
import { StreamManager } from "@/runtime/streaming/StreamManager"
import type { ToolCallRecord, FileEditRecord, TerminalRecord } from "@/components/workspace/timeline/step-card"
import { normalizeError } from "@/lib/normalize-error"
import { emitTelemetry } from "@/lib/telemetry"
import { getStateForToolCall, getActivityForToolCall, getAgentLabel } from "@/components/workspace/agent-visibility/AgentActivityMapper"
import { ReliabilityManager } from "@/runtime/reliability/ReliabilityManager"
import { FeatureFlagManager } from "@/runtime/feature-flags/FeatureFlagManager"
import { ObservabilityManager } from "@/runtime/observability/ObservabilityManager"
import { DeterministicToolRecorder } from "@/runtime/tools/execution/DeterministicToolRecord"
import { EventBus } from "@/runtime/EventBus"
import type { SessionCompletedEvent } from "@/runtime/RuntimeTypes"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useToolFilterStore } from "@/stores/tool-filter-store"
import { pluginRegistry } from "@/runtime/plugins/PluginRegistry"
import { useDiffStore } from "@/stores/diff-store"
import { buildDiffFileEntry } from "@/lib/diff-review"
import { ChangeSetManager } from "@/runtime/changeset/ChangeSetManager"
import { useChangeSetStore } from "@/runtime/changeset/ChangeSetStore"

export interface ExecuteOptions {
  input: string
  activeRole: RuntimeRole
  correlationId?: string
  goalId?: string
  mode?: ExecutionMode
  signal?: AbortSignal
  onPreview?: (files: string[]) => Promise<boolean>
}

function extractEditedFiles(input: string): string[] {
  const files: string[] = []
  const pattern = /(?:file|path|edit|update|change|modify)\s+(?:`([^`]+)`|([^\s,.]+))/gi
  let match
  while ((match = pattern.exec(input)) !== null) {
    const path = (match[1] ?? match[2]).trim()
    if (path && path.match(/\.(ts|tsx|js|jsx|json|css|html|md)$/)) {
      files.push(path)
    }
  }
  return files
}

export interface ExecutionSession {
  id: string
  traceId: string
  startedAt: number
  completedAt?: number
  status: "running" | "completed" | "failed" | "cancelled"
  input: string
  error?: string
  goalId?: string
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export class ExecutionSessionManager {
  private static instance: ExecutionSessionManager
  private sessions: Map<string, ExecutionSession> = new Map()
  private gateway = UnifiedExecutionGateway.getInstance()
  private stepByExecId = new Map<string, string>()
  private initStepIds = new Map<string, string>()
  private sessionToExecId = new Map<string, string>()
  private execRoleMap = new Map<string, string>()
  private activeSessionId: string | null = null
  private streamManagerFlushSet = false
  private forceStopTimer: ReturnType<typeof setTimeout> | null = null
  /** Tracks correlationIds that are currently being executed — prevents duplicate sends */
  private activeCorrelationIds = new Set<string>()
  private loadingSlowTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

  // ── Observability ──
  private obsManager = ObservabilityManager.getInstance()
  private toolRecorder = new DeterministicToolRecorder()
  /** Maps toolId → TOOL_START args for matching with COMPLETE/ERROR */
  private pendingToolArgs = new Map<string, { toolName: string; args: string; executionId: string }>()
  /** Maps executionId → commandLogId for full log storage */
  private commandLogIds = new Map<string, string>()
  /** Maps sessionId → changeSetId for routing file edits through ChangeSetManager */
  private sessionChangeSets = new Map<string, string>()

  // ── Runtime telemetry ──
  private runtimeTelemetry = {
    count: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    verificationsPassed: 0,
    verificationsFailed: 0,
    toolCompletes: 0,
    toolErrors: 0,
    durations: new Array<number>(),
    tokenCounts: new Array<number>(),
    recoveries: 0,
  }

  /** Max total session duration before force-cancel */
  private static readonly SESSION_MAX_DURATION_MS = 300_000
  /** Max events to buffer per session for memory extraction */
  private static readonly MAX_BUFFERED_EVENTS = 1000
  private static readonly MAX_TELEMETRY_ENTRIES = 1000

  /** Buffers ExecutionEvents per session ID for cross-session memory extraction */
  private sessionEventBuffer = new Map<string, ExecutionEvent[]>()

  /**
   * Buffer an ExecutionEvent for cross-session memory extraction.
   * Caps at MAX_BUFFERED_EVENTS to prevent unbounded memory growth.
   */
  private bufferEvent(event: ExecutionEvent): void {
    if (!this.activeSessionId) return
    const buf = this.sessionEventBuffer.get(this.activeSessionId)
    if (!buf) return
    if (buf.length >= ExecutionSessionManager.MAX_BUFFERED_EVENTS) return
    buf.push(event)
  }

  static getInstance(): ExecutionSessionManager {
    if (!ExecutionSessionManager.instance) {
      ExecutionSessionManager.instance = new ExecutionSessionManager()
    }
    return ExecutionSessionManager.instance
  }

  async initObservability(): Promise<void> {
    await this.obsManager.init()
  }

  static cancelCurrent(): void {
    const inst = ExecutionSessionManager.getInstance()
    if (inst.activeSessionId) {
      inst.cancel(inst.activeSessionId)
    }
  }

  async start(options: ExecuteOptions): Promise<ExecutionSession> {
    const mgrTag = "[SessionManager]"
    const sessionStartTime = Date.now()
    console.log(`${mgrTag} ▶ start (inputLen=${options.input.length}, role=${options.activeRole}, correlationId=${options.correlationId})`)

    // Dedup: reject if same correlationId is already executing
    if (options.correlationId) {
      if (this.activeCorrelationIds.has(options.correlationId)) {
        console.log(`${mgrTag} ✗ duplicate correlationId ${options.correlationId}`)
        throw new Error("This message is already being processed")
      }
      this.activeCorrelationIds.add(options.correlationId)
    }
    if (this.activeSessionId) {
      const existing = this.sessions.get(this.activeSessionId)
      if (existing?.status === "running") {
        if (options.correlationId) this.activeCorrelationIds.delete(options.correlationId)
        console.log(`${mgrTag} ✗ already executing`)
        throw new Error("An execution is already in progress. Please wait for it to complete or cancel it.")
      }
    }
    if (this.forceStopTimer !== null) {
      clearTimeout(this.forceStopTimer)
      this.forceStopTimer = null
    }
    StreamManager.getInstance().resetCancelled()
    const id = generateId()
    this.activeSessionId = id
    const session: ExecutionSession = {
      id,
      traceId: `msg_${Date.now()}`,
      startedAt: sessionStartTime,
      status: "running",
      input: options.input,
    }

    this.sessions.set(id, session)
    this.sessionEventBuffer.set(id, [])

    if (!this.streamManagerFlushSet) {
      this.streamManagerFlushSet = true
      StreamManager.getInstance().setFlushCallback((stepId, delta) => {
        useTimelineStore.getState().appendStreamingText(stepId, delta)
      })
    }

    const observabilityEnabled = FeatureFlagManager.getInstance().isEnabled("observability")

    // ── Dispatch plugin onSessionStart hook ──
    pluginRegistry.dispatchOnSessionStart(id, options.input).catch((err) => {
      console.warn('[SessionManager] Plugin onSessionStart hook failed:', err)
    })

    try {
      const editedFiles = extractEditedFiles(options.input)

      if (options.onPreview && editedFiles.length > 0) {
        const approved = await options.onPreview(editedFiles)
        if (!approved) {
          session.status = "cancelled"
          session.completedAt = Date.now()
          this.recordRuntimeTelemetry(session, 0)
          return session
        }
      }

      // ── Observability: start replay session + trace ──
      if (observabilityEnabled) {
        this.obsManager.startTrace(id)
        await this.obsManager.getReplay().startSession(id)
      }

      const durationTimeout = setTimeout(() => {
        this.gateway.cancel()
      }, ExecutionSessionManager.SESSION_MAX_DURATION_MS)

      let eventCount = 0
      try {
        const result = await this.gateway.execute({
          input: options.input,
          activeRole: options.activeRole,
          correlationId: options.correlationId,
          goalId: options.goalId,
          mode: options.mode ?? "full",
          signal: options.signal,
          editedFiles,
        })

        for (const event of result.events) {
          eventCount++
          this.handleEvent(event, options)
        }

        if (!result.engineeringResult.passed) {
          this.handleEvent({
            type: "EXECUTION_FAILED" as any,
            executionId: "",
            error: result.engineeringResult.summary,
            durationMs: result.engineeringResult.durationMs,
            timestamp: Date.now(),
          } as ExecutionEvent, options)
        }
      } finally {
        clearTimeout(durationTimeout)
      }

      console.log(`${mgrTag} ✓ event stream ended (${Math.round(performance.now() - sessionStartTime)}ms, events=${eventCount})`)

      if (session.status !== "cancelled") {
        session.status = "completed"
      }
      session.completedAt = Date.now()

      // Propose and submit ChangeSet for review on successful completion
      if (session.status === "completed") {
        const changeSetId = this.sessionChangeSets.get(id)
        if (changeSetId) {
          const changesetMgr = ChangeSetManager.getInstance()
          changesetMgr.proposeChangeSet(changeSetId)
          changesetMgr.submitForReview(changeSetId)
        }
      }

      this.recordRuntimeTelemetry(session, eventCount)

      if (observabilityEnabled) {
        this.obsManager.endTrace(id)
        await this.obsManager.getReplay().endSession(`Session ${id}: ${eventCount} events, status=${session.status}`)
      }

      // ── Dispatch plugin onSessionEnd hook ──
      pluginRegistry.dispatchOnSessionEnd(id, session.status).catch((err) => {
        console.warn('[SessionManager] Plugin onSessionEnd hook failed:', err)
      })

      // ── Emit SESSION_COMPLETED on EventBus ──
      // SessionMemoryExtractor subscribes to this event to extract and store
      // session summaries asynchronously, decoupling extraction from execution
      if (session.status === 'completed' || session.status === 'failed') {
        const rootPath = useWorkspaceStore.getState().rootPath
        const bufferedEvents = this.sessionEventBuffer.get(session.id) ?? []
        const durationMs = (session.completedAt ?? Date.now()) - session.startedAt

        const completedEvent: SessionCompletedEvent = {
          type: "SESSION_COMPLETED",
          sessionId: session.id,
          input: session.input,
          status: session.status,
          eventCount,
          durationMs,
          rootPath,
          events: bufferedEvents,
        }
        EventBus.getInstance().emit(completedEvent)
      }
    } catch (e) {
      const msg = normalizeError(e, "Execution failed")
      if (observabilityEnabled) {
        this.obsManager.addSpan(id, "execution_error", { error: msg })
        this.obsManager.endTrace(id)
        await this.obsManager.getReplay().endSession(`Session ${id}: failed — ${msg}`)
      }
      session.error = msg
      session.status = msg.includes("abort") || msg.includes("cancel") ? "cancelled" : "failed"
      session.completedAt = Date.now()

      // Clean up ChangeSet on failure/cancellation — discard draft changes
      const changeSetId = this.sessionChangeSets.get(id)
      if (changeSetId) {
        const changesetMgr = ChangeSetManager.getInstance()
        const cs = useChangeSetStore.getState().getChangeSet(changeSetId)
        if (cs && cs.status === "draft") {
          useChangeSetStore.getState().removeChangeSet(changeSetId)
        } else if (cs) {
          changesetMgr.rejectChangeSet(changeSetId)
        }
        this.sessionChangeSets.delete(id)
      }

      this.recordRuntimeTelemetry(session, 0)

      console.log(`${mgrTag} ✗ ${session.status} at ${Math.round(performance.now() - sessionStartTime)}ms: ${msg}`)
        emitTelemetry({ type: "execution_complete", timestamp: Date.now(), durationMs: Date.now() - session.startedAt, error: msg, metadata: { status: session.status, sessionId: id } })
      if (msg.includes("abort") || msg.includes("cancel")) {
        emitTelemetry({ type: "cancellation", timestamp: Date.now(), metadata: { sessionId: id, reason: msg } })
      }
      // Safety net: finalize any remaining timeline sessions
      const timeline = useTimelineStore.getState()
      for (const [execId, stepId] of this.stepByExecId) {
        StreamManager.getInstance().clearStep(stepId)
        // pendingStreamTexts recovery buffer preserves text if session doesn't exist yet
        timeline.commitStreamingText(stepId)
        timeline.flushPendingText(stepId)
        timeline.updateAgentSession(stepId, { status: "complete", streamState: "cancelled" })
      }
      for (const [execId, initStepId] of this.initStepIds) {
        timeline.updateAgentSession(initStepId, { status: "complete", streamState: "cancelled" })
        this.initStepIds.delete(execId)
      }
      this.stepByExecId.clear()
      this.sessionToExecId.clear()
      this.pendingToolArgs.clear()
      // Clean up optimistic session via correlationId
      if (options.correlationId) {
        const optimisticStepId = `optimistic_${options.correlationId}`
        if (timeline.agentSessions.has(optimisticStepId)) {
          // Flush any pending text before marking as failed
          timeline.flushPendingText(optimisticStepId)
          timeline.updateAgentSession(optimisticStepId, {
            status: "error",
            streamState: "failed",
            error: msg,
          })
        }
      }
    } finally {
      if (options.correlationId) this.activeCorrelationIds.delete(options.correlationId)
    }

    // Prune old sessions to prevent unbounded map growth
    this.pruneSessions()

    this.activeSessionId = null
    console.log(`${mgrTag} ✓ return session ${id} (${Date.now() - sessionStartTime}ms, status=${session.status})`)
    return session
  }

  private handleEvent(event: ExecutionEvent, options: ExecuteOptions): void {
    const timeline = useTimelineStore.getState()

    // ── Buffer event for cross-session memory extraction ──
    this.bufferEvent(event)

    // ── Observability: record every event ──
    if (FeatureFlagManager.getInstance().isEnabled("observability")) {
      this.obsManager.getReplay().recordEvent(event).catch((err) => {
        console.error("[SessionManager] replay record error:", err)
      })
      this.recordObservabilityEvent(event)
    }

    switch (event.type) {
      case "AGENT_ASSIGNED": {
        // Redact internal agent labels per feature flag (mutate event in-place)
        if (!FeatureFlagManager.getInstance().isEnabled("showInternalAgentLabels")) {
          ;(event as any).roleName = "Assistant"
        }

        // Track agent role for this execution
        this.execRoleMap.set(event.executionId, event.roleId)
        useAgentStore.getState().setAgentStatus(event.roleId, {
          id: event.roleId,
          role: event.roleId,
          state: "planning",
          currentTask: getAgentLabel(event.roleId),
          lastAction: "Assigned to task",
        })

        // Upgrade optimistic session in-place instead of destroy+recreate
        // This prevents scroll jumps, flicker, and lost animation state
        const optimisticStepId = event.correlationId ? `optimistic_${event.correlationId}` : null
        if (optimisticStepId && timeline.agentSessions.has(optimisticStepId)) {
          // Remove the init session from EXECUTION_CREATED — it's a stub, not a real session
          const initBeforeUpgrade = this.initStepIds.get(event.executionId)
          if (initBeforeUpgrade) {
            timeline.removeAgentSession(initBeforeUpgrade)
            this.initStepIds.delete(event.executionId)
          }
          timeline.upgradeOptimisticSession(optimisticStepId, event.stepId, {
            roleId: event.roleId,
            roleName: event.roleName,
            modelName: event.modelName,
            providerName: event.providerName,
            executionStrategy: event.executionStrategy,
            currentPhase: undefined,
            phaseHistory: [{ label: "Thinking", timestamp: Date.now() }, { label: "Connecting", timestamp: Date.now() }],
          })
        } else {
          // No optimistic session — create fresh, but remove the init stub
          const initBeforeReal = this.initStepIds.get(event.executionId)
          if (initBeforeReal) {
            timeline.removeAgentSession(initBeforeReal)
            this.initStepIds.delete(event.executionId)
          }
          timeline.addAgentSession({
            stepId: event.stepId,
            roleId: event.roleId,
            roleName: event.roleName,
            status: "running",
            streamState: "streaming",
            streamingText: "",
            toolCalls: [],
            fileEdits: [],
            fileOps: [],
            terminalOutputs: [],
            modelName: event.modelName,
            providerName: event.providerName,
            executionStrategy: event.executionStrategy,
            startedAt: Date.now(),
            tokenAppended: 0,
          }, event.correlationId)
        }
        this.stepByExecId.set(event.executionId, event.stepId)

        // Start a 5-second timeout: if no TOKEN arrives, mark as loading_slowly
        const slowTimeout = setTimeout(() => {
          const tl = useTimelineStore.getState()
          const sid = this.stepByExecId.get(event.executionId)
          if (sid) {
            tl.updateAgentSession(sid, {
              streamState: "loading_slowly",
              currentPhase: "Still working...",
            })
          }
          this.loadingSlowTimeouts.delete(event.executionId)
        }, 5000)
        this.loadingSlowTimeouts.set(event.executionId, slowTimeout)
        break
      }

      case "MESSAGE_COMPLETE": {
        const slowTimeout = this.loadingSlowTimeouts.get(event.executionId)
        if (slowTimeout) { clearTimeout(slowTimeout); this.loadingSlowTimeouts.delete(event.executionId) }
        StreamManager.getInstance().clearStep(event.stepId)
        timeline.commitStreamingText(event.stepId)
        timeline.updateAgentSession(event.stepId, { status: "complete" })
        this.stepByExecId.delete(event.executionId)
        if (event.content) {
          useAgentStore.getState().addMessage(options.activeRole, {
            role: "assistant",
            content: event.content,
            timestamp: Date.now(),
          })
        }
        // Mark agent as complete
        const role = this.execRoleMap.get(event.executionId)
        if (role) {
          useAgentStore.getState().setAgentStatus(role, {
            state: "complete",
            currentTask: "Complete",
            lastAction: "Task finished",
          })
          this.execRoleMap.delete(event.executionId)
        }
        // Track token usage per runtime
        const tokens = (event as any).tokens ?? (event.content ? Math.round(event.content.length / 4) : 0)
        if (tokens > 0) {
          this.runtimeTelemetry.tokenCounts.push(tokens)
          if (this.runtimeTelemetry.tokenCounts.length > ExecutionSessionManager.MAX_TELEMETRY_ENTRIES) {
            this.runtimeTelemetry.tokenCounts = this.runtimeTelemetry.tokenCounts.slice(-ExecutionSessionManager.MAX_TELEMETRY_ENTRIES)
          }
        }
        break
      }

      case "TOOL_START": {
        const stepId = this.stepByExecId.get(event.executionId)
        if (!stepId) break
        const argsStr = typeof event.args === 'string' ? event.args : JSON.stringify(event.args).slice(0, 200)
        const toolCall: ToolCallRecord = {
          id: event.toolId,
          name: event.toolName,
          args: argsStr,
          status: "running",
          parallelGroup: (event as any).parallelGroup,
        }
        timeline.addToolCallToAgent(stepId, toolCall)

        // Update agent status based on tool being used
        const role = this.execRoleMap.get(event.executionId)
        if (role) {
          const activity = getActivityForToolCall(event.toolName, typeof event.args === 'object' ? event.args as Record<string, unknown> : undefined)
          useAgentStore.getState().setAgentStatus(role, {
            id: role,
            role,
            state: getStateForToolCall(event.toolName) as any,
            currentTask: activity.label,
            lastAction: activity.detail ?? activity.label,
          })
        }
        break
      }

      case "TOOL_COMPLETE": {
        const stepId = this.stepByExecId.get(event.executionId)
        if (!stepId) break
        timeline.updateToolCall(stepId, event.toolId, {
          status: "complete",
          result: event.result,
          durationMs: event.durationMs,
        })
        const role = this.execRoleMap.get(event.executionId)
        if (role) {
          useAgentStore.getState().setAgentStatus(role, {
            lastAction: `${getActivityForToolCall(event.toolName).label} completed`,
          })
        }
        this.runtimeTelemetry.toolCompletes++
        break
      }

      case "TOOL_ERROR": {
        const teStepId = this.stepByExecId.get(event.executionId)
        if (!teStepId) break
        timeline.updateToolCall(teStepId, event.toolId, {
          status: "error",
          result: event.error,
          durationMs: event.durationMs,
        })
        const role = this.execRoleMap.get(event.executionId)
        if (role) {
          useAgentStore.getState().setAgentStatus(role, {
            state: "validating",
            currentTask: "Handling error",
            lastAction: `Error: ${event.error?.slice(0, 80)}`,
          })
        }
        this.runtimeTelemetry.toolErrors++
        break
      }

      case "FILE_EDIT": {
        const stepId = this.stepByExecId.get(event.executionId)
        if (!stepId) break
        const diffEntry = buildDiffFileEntry(
          event.path,
          event.oldContent ?? "",
          event.newContent ?? "",
          "agent",
        )
        const fileEdit: FileEditRecord = {
          path: event.path,
          additions: event.additions ?? 0,
          deletions: event.deletions ?? 0,
          diffContent: diffEntry.rawDiff,
          oldContent: event.oldContent,
          newContent: event.newContent,
        }
        timeline.addFileEditToAgent(stepId, fileEdit)
        useDiffStore.getState().setCorrelationId(options.correlationId ?? event.executionId)
        useDiffStore.getState().addFileDiff(diffEntry)

        // Route through ChangeSetManager — create or get the ChangeSet for this session
        const changesetMgr = ChangeSetManager.getInstance()
        let changeSetId = this.sessionChangeSets.get(stepId)
        if (!changeSetId) {
          const session = timeline.agentSessions.get(stepId)
          const cs = changesetMgr.createChangeSet({
            sessionId: stepId,
            correlationId: session?.correlationId ?? options.correlationId ?? event.executionId,
            title: `File changes for ${stepId}`,
            reason: "Agent file modifications",
            sourceToolCallIds: [event.executionId],
          })
          changeSetId = cs.id
          this.sessionChangeSets.set(stepId, changeSetId)
        }
        changesetMgr.addFileToChangeSet({
          changeSetId,
          path: event.path,
          changeType: event.oldContent ? "modify" : "create",
          beforeContent: event.oldContent ?? undefined,
          afterContent: event.newContent ?? undefined,
        })

        // Update agent status for editing activity + track file activity
        const role = this.execRoleMap.get(event.executionId)
        if (role) {
          useAgentStore.getState().setAgentStatus(role, {
            id: role,
            role,
            state: "editing",
            currentTask: "Editing files",
            lastAction: `Editing ${event.path.split("/").pop() ?? event.path}`,
          })
          useAgentStore.getState().setFileActivity(event.path, role, "editing")
        }
        break
      }

      case "COMMAND_START": {
        const cmdStepId = this.stepByExecId.get(event.executionId)
        if (!cmdStepId) break
        const terminal: TerminalRecord = {
          command: event.command,
          output: "",
          status: "running",
          cwd: event.cwd,
        }
        timeline.addTerminalToAgent(cmdStepId, terminal)

        const commandLogId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        this.commandLogIds.set(event.executionId, commandLogId)
        useCommandLogStore.getState().addLog({
          id: commandLogId,
          sessionId: this.activeSessionId ?? "",
          correlationId: options.correlationId,
          command: event.command,
          cwd: event.cwd,
          fullOutput: "",
          status: "running",
          startedAt: Date.now(),
        })

        const role = this.execRoleMap.get(event.executionId)
        if (role) {
          useAgentStore.getState().setAgentStatus(role, {
            state: "validating",
            currentTask: "Running command",
            lastAction: event.command.slice(0, 60),
          })
        }
        break
      }

      case "COMMAND_COMPLETE": {
        const ccStepId = this.stepByExecId.get(event.executionId)
        if (!ccStepId) break
        const session = timeline.agentSessions.get(ccStepId)
        if (!session) break
        const lastIdx = session.terminalOutputs.length - 1
        if (lastIdx < 0) break
        const updated = [...session.terminalOutputs]
        updated[lastIdx] = { ...updated[lastIdx], status: "success", exitCode: event.exitCode, durationMs: event.durationMs, output: session.terminalOutputs[lastIdx].output }
        timeline.updateAgentSession(ccStepId, { terminalOutputs: updated })

        const ccClId = this.commandLogIds.get(event.executionId)
        if (ccClId) {
          useCommandLogStore.getState().updateLog(ccClId, { status: "success", exitCode: event.exitCode, durationMs: event.durationMs, completedAt: Date.now() })
          this.commandLogIds.delete(event.executionId)
        }
        break
      }

      case "COMMAND_ERROR": {
        const ceStepId = this.stepByExecId.get(event.executionId)
        if (!ceStepId) break
        const ceSession = timeline.agentSessions.get(ceStepId)
        if (!ceSession) break
        const ceLastIdx = ceSession.terminalOutputs.length - 1
        if (ceLastIdx < 0) break
        const ceUpdated = [...ceSession.terminalOutputs]
        const wasCancelled = this.activeSessionId
          ? this.sessions.get(this.activeSessionId)?.status === "cancelled"
          : false
        ceUpdated[ceLastIdx] = {
          ...ceUpdated[ceLastIdx],
          status: wasCancelled ? "cancelled" : "error",
          exitCode: 1,
          output: wasCancelled ? "" : event.error,
        }
        timeline.updateAgentSession(ceStepId, { terminalOutputs: ceUpdated })

        const ceClId = this.commandLogIds.get(event.executionId)
        if (ceClId) {
          useCommandLogStore.getState().updateLog(ceClId, {
            status: wasCancelled ? "cancelled" : "error",
            exitCode: 1,
            completedAt: Date.now(),
          })
          this.commandLogIds.delete(event.executionId)
        }
        break
      }

      case "ACTION": {
        useLedgerStore.getState().addAction({
          agentRole: event.agentRole,
          action: event.action,
          status: event.status,
          summary: event.summary,
        })
        break
      }

      case "SYNTHESIS_COMPLETE": {
        useAgentStore.getState().addMessage(event.role as any, {
          role: "assistant",
          content: event.content,
          timestamp: Date.now(),
        })
        break
      }

      case "EXECUTION_FAILED": {
        // Record failure with circuit breaker
        ReliabilityManager.getInstance().circuitBreakers.getOrCreate("execution").recordFailure(event.error)

        // Check if this execution's session was already cancelled
        let wasCancelled = false
        for (const [, execId] of this.sessionToExecId) {
          if (execId === event.executionId) {
            const s = this.activeSessionId ? this.sessions.get(this.activeSessionId) : undefined
            if (s?.status === "cancelled") wasCancelled = true
            break
          }
        }
        const efTimeout = this.loadingSlowTimeouts.get(event.executionId)
        if (efTimeout) { clearTimeout(efTimeout); this.loadingSlowTimeouts.delete(event.executionId) }

        const efStepId = this.stepByExecId.get(event.executionId)
        if (efStepId) {
          StreamManager.getInstance().clearStep(efStepId)
          timeline.commitStreamingText(efStepId)
          timeline.updateAgentSession(efStepId, {
            status: wasCancelled ? "complete" : "error",
            streamState: wasCancelled ? "cancelled" : "failed",
            error: wasCancelled ? undefined : event.error,
          })
          if (wasCancelled) {
            timeline.flushPendingText(efStepId)
          }
          this.stepByExecId.delete(event.executionId)
        }
        const initFailId = this.initStepIds.get(event.executionId)
        if (initFailId) {
          timeline.updateAgentSession(initFailId, {
            status: "complete",
            streamState: wasCancelled ? "cancelled" : "completed",
          })
          this.initStepIds.delete(event.executionId)
        }
        // Mark agent as failed
        const role = this.execRoleMap.get(event.executionId)
        if (role) {
          useAgentStore.getState().setAgentStatus(role, {
            state: wasCancelled ? "complete" : "failed",
            currentTask: wasCancelled ? "Cancelled" : "Failed",
            lastAction: wasCancelled ? "Cancelled by user" : `Error: ${event.error?.slice(0, 80)}`,
          })
          this.execRoleMap.delete(event.executionId)
        }
        if (!wasCancelled) {
          useAgentStore.getState().addMessage(options.activeRole, {
            role: "assistant",
            content: `Error: ${event.error}`,
            timestamp: Date.now(),
          })
        }
        break
      }

      case "COMMAND_OUTPUT": {
        const coStepId = this.stepByExecId.get(event.executionId)
        if (!coStepId) break
        const coSession = timeline.agentSessions.get(coStepId)
        if (!coSession) break
        const coLastIdx = coSession.terminalOutputs.length - 1
        if (coLastIdx < 0) break
        const coTerminal = coSession.terminalOutputs[coLastIdx]
        if (coTerminal.status !== "running") {
          const coBuf = [...coSession.terminalOutputs]
          coBuf[coLastIdx] = { ...coTerminal, output: coTerminal.output + event.output }
          timeline.updateAgentSession(coStepId, { terminalOutputs: coBuf })
          break
        }
        const coUpdated = [...coSession.terminalOutputs]
        coUpdated[coLastIdx] = { ...coUpdated[coLastIdx], output: coUpdated[coLastIdx].output + event.output }
        timeline.updateAgentSession(coStepId, { terminalOutputs: coUpdated })
        const outClId = this.commandLogIds.get(event.executionId)
        if (outClId) {
          useCommandLogStore.getState().appendOutput(outClId, event.output)
        }
        break
      }

      case "EXECUTION_CREATED": {
        if (this.activeSessionId) {
          this.sessionToExecId.set(this.activeSessionId, event.executionId)
        }
        const initStepId = `${event.executionId}_init`
        this.initStepIds.set(event.executionId, initStepId)
        timeline.addAgentSession({
          stepId: initStepId,
          roleId: options.activeRole,
          roleName: "Assistant",
          status: "running",
          streamState: "not_started",
          streamingText: "",
          toolCalls: [],
          fileEdits: [],
          fileOps: [],
          terminalOutputs: [],
          startedAt: Date.now(),
          tokenAppended: 0,
          currentPhase: "Preparing...",
        }, options.correlationId)
        this.stepByExecId.set(event.executionId, initStepId)
        // Don't overwrite agent status here — sendMessage already set it
        // AGENT_ASSIGNED will set the correct role-specific status
        break
      }

      case "THINKING_STARTED": {
        const tsStepId = this.stepByExecId.get(event.executionId)
        if (tsStepId) {
          timeline.setNote(tsStepId, event.label)
        }
        break
      }

      case "THINKING_UPDATE": {
        const tuStepId = this.stepByExecId.get(event.executionId)
        if (tuStepId) {
          timeline.setNote(tuStepId, event.label)
        }
        break
      }

      case "TOOL_PROGRESS": {
        const tpStepId = this.stepByExecId.get(event.executionId)
        if (tpStepId) {
          timeline.setPhase(tpStepId, event.progress)
          timeline.updateToolCall(tpStepId, event.toolId, { progress: event.progress })
        }
        break
      }

      case "CONTEXT_LOADING": {
        const clStepId = this.stepByExecId.get(event.executionId)
        if (clStepId) {
          timeline.setNote(clStepId, `Loading ${event.source}...`)
        }
        break
      }

      case "CONTEXT_READY": {
        const crStepId = this.stepByExecId.get(event.executionId)
        if (crStepId) {
          timeline.setNote(crStepId, `${event.source} loaded`)
        }
        break
      }

      case "PROVIDER_CONNECTING": {
        const pcnStepId = this.stepByExecId.get(event.executionId)
        if (pcnStepId) {
          timeline.setNote(pcnStepId, `Connecting to ${event.provider}...`)
        }
        break
      }

      case "PROVIDER_CONNECTED": {
        const pcdStepId = this.stepByExecId.get(event.executionId)
        if (pcdStepId) {
          timeline.setNote(pcdStepId, `Connected to ${event.provider}`)
        }
        break
      }

      case "EXECUTION_COMPLETE": {
        const initCompleteId = this.initStepIds.get(event.executionId)
        if (initCompleteId) {
          timeline.removeAgentSession(initCompleteId)
          this.initStepIds.delete(event.executionId)
        }
        break
      }

      case "VERIFY_PASSED": {
        const vpRole = this.execRoleMap.get(event.executionId)
        if (vpRole) {
          useAgentStore.getState().setAgentStatus(vpRole, {
            state: "validating",
            currentTask: "Verification passed",
            lastAction: `All checks passed (${event.details.length} checks)`,
          })
        }
        if (event.recovered) {
          this.runtimeTelemetry.recoveries++
        }
        this.runtimeTelemetry.verificationsPassed++
        break
      }

      case "VERIFY_FAILED": {
        const vfRole = this.execRoleMap.get(event.executionId)
        if (vfRole) {
          useAgentStore.getState().setAgentStatus(vfRole, {
            state: "validating",
            currentTask: "Verification failed",
            lastAction: `Lint:${event.lintErrors} Type:${event.typeErrors} Build:${event.buildErrors} Test:${event.testFailures}`,
          })
        }
        this.runtimeTelemetry.verificationsFailed++
        break
      }

      case "PLAN_PROPOSED": {
        // Plan is already in the store
        // Just set the phase on the timeline
        const propStepId = this.stepByExecId.get(event.executionId)
        if (propStepId) {
          timeline.setPhase(propStepId, "Plan proposed — awaiting approval")
        }
        break
      }

      case "PLAN_APPROVED": {
        const appStepId = this.stepByExecId.get(event.executionId)
        if (appStepId) {
          timeline.setPhase(appStepId, "Plan approved — executing")
        }
        break
      }

      case "PLAN_REJECTED": {
        const rejStepId = this.stepByExecId.get(event.executionId)
        if (rejStepId) {
          timeline.setPhase(rejStepId, "Plan rejected")
        }
        // Clean up
        this.stepByExecId.delete(event.executionId)
        break
      }

      case "GOAL_ACHIEVED": {
        // Goal achieved — final cleanup
        for (const [eid, stepId] of this.stepByExecId) {
          StreamManager.getInstance().clearStep(stepId)
          timeline.commitStreamingText(stepId)
          timeline.updateAgentSession(stepId, { status: "complete", streamState: "completed" })
        }
        this.stepByExecId.clear()
        useAgentStore.getState().addMessage(options.activeRole, {
          role: "assistant",
          content: `Goal achieved after ${event.iterations} iteration(s) and ${event.stepsCompleted} step(s).`,
          timestamp: Date.now(),
        })
        break
      }

      case "TOOLS_EXPOSED": {
        useToolFilterStore.getState().setLatest({
          totalAvailable: (event as any).totalAvailable ?? 0,
          totalExposed: (event as any).tools?.length ?? 0,
          totalFiltered: (event as any).totalFiltered ?? 0,
          exposedTools: (event as any).tools ?? [],
          role: (event as any).role ?? "",
          lastUpdated: Date.now(),
        })
        break
      }

      case "TOKEN": {
        const tokenStepId = this.stepByExecId.get(event.executionId)
        if (tokenStepId) {
          StreamManager.getInstance().append(tokenStepId, (event as any).token ?? "")
        }
        // First token arrived — clear the loading_slowly timeout
        const tTimeout = this.loadingSlowTimeouts.get(event.executionId)
        if (tTimeout) { clearTimeout(tTimeout); this.loadingSlowTimeouts.delete(event.executionId) }
        break
      }
      case "MESSAGE_UPDATE":
        break
    }

    // ── Canonical event adapter ──
    // Record canonical events in the timeline store for replay
    const sid = this.activeSessionId ?? "unknown"
    const cid = (event as any).correlationId ?? options.correlationId ?? sid
    const canonicalEvents = adaptEvent(event, sid, cid)
    if (canonicalEvents.length > 0) {
      timeline.addCanonicalEventLog(canonicalEvents)
    }
  }

  /** Record an ExecutionEvent to ObservabilityManager spans + counters + DeterministicToolRecorder */
  private recordObservabilityEvent(event: ExecutionEvent): void {
    switch (event.type) {
      case "AGENT_ASSIGNED":
        this.obsManager.addSpan(event.executionId, "agent_assigned", { roleId: event.roleId, roleName: event.roleName })
        this.obsManager.incrementCounter("agent_assignments")
        break

      case "TOOL_START":
        this.pendingToolArgs.set(event.toolId, {
          toolName: event.toolName,
          args: event.args,
          executionId: event.executionId,
        })
        this.obsManager.addSpan(event.executionId, `tool:${event.toolName}`, { toolId: event.toolId, args: event.args.slice(0, 200) })
        this.obsManager.incrementCounter(`tool_start:${event.toolName}`)
        this.obsManager.incrementCounter("tool_starts")
        break

      case "TOOL_COMPLETE": {
        this.obsManager.incrementCounter(`tool_complete:${event.toolName}`)
        this.obsManager.incrementCounter("tool_completes")
        this.obsManager.recordHistogram(`tool_duration:${event.toolName}`, event.durationMs)

        const pending = this.pendingToolArgs.get(event.toolId)
        if (pending) {
          this.pendingToolArgs.delete(event.toolId)
          this.toolRecorder.record({
            executionId: event.executionId,
            action: event.toolName,
            toolName: event.toolName,
            inputHash: this.simpleHash(pending.args),
            inputArgs: this.parseArgs(pending.args),
            outputHash: this.simpleHash(event.result),
            outputResult: event.result,
            durationMs: event.durationMs,
            sandboxMode: "workspace-write",
          })
        }
        break
      }

      case "TOOL_ERROR": {
        this.obsManager.incrementCounter(`tool_error:${event.toolName}`)
        this.obsManager.incrementCounter("tool_errors")

        const pending = this.pendingToolArgs.get(event.toolId)
        if (pending) {
          this.pendingToolArgs.delete(event.toolId)
          this.toolRecorder.record({
            executionId: event.executionId,
            action: event.toolName,
            toolName: event.toolName,
            inputHash: this.simpleHash(pending.args),
            inputArgs: this.parseArgs(pending.args),
            outputHash: this.simpleHash(event.error),
            outputResult: event.error,
            durationMs: event.durationMs,
            error: event.error,
            sandboxMode: "workspace-write",
          })
        }
        break
      }

      case "FILE_EDIT":
        this.obsManager.incrementCounter("file_edits")
        this.obsManager.addSpan(event.executionId, "file_edit", { path: event.path })
        break

      case "MESSAGE_COMPLETE":
        this.obsManager.incrementCounter("messages_complete")
        this.obsManager.recordHistogram("message_tokens", (event as any).tokens ?? 0)
        break

      case "EXECUTION_FAILED":
        this.obsManager.incrementCounter("execution_failures")
        this.obsManager.addSpan(event.executionId, "execution_failed", { error: event.error })
        this.cleanupPendingToolArgs(event.executionId)
        break

      case "EXECUTION_CREATED":
        this.obsManager.incrementCounter("executions_created")
        break

      case "EXECUTION_COMPLETE":
        this.obsManager.incrementCounter("executions_complete")
        this.cleanupPendingToolArgs(event.executionId)
        break

      case "VERIFY_PASSED":
        this.obsManager.incrementCounter("verifications_passed")
        this.obsManager.addSpan(event.executionId, "verify_passed")
        break

      case "VERIFY_FAILED":
        this.obsManager.incrementCounter("verifications_failed")
        this.obsManager.addSpan(event.executionId, "verify_failed", { lintErrors: event.lintErrors, typeErrors: event.typeErrors })
        break

      case "GOAL_ACHIEVED":
        this.obsManager.incrementCounter("goals_achieved")
        this.obsManager.addSpan(event.executionId, "goal_achieved", { objective: event.objective.slice(0, 100), iterations: event.iterations })
        break
    }
  }

  /** Remove all pending tool args for a given executionId (cleanup on execution end) */
  private cleanupPendingToolArgs(executionId: string): void {
    for (const [toolId, pending] of this.pendingToolArgs) {
      if (pending.executionId === executionId) {
        this.pendingToolArgs.delete(toolId)
      }
    }
  }

  /** Record per-runtime telemetry for side-by-side validation */
  private recordRuntimeTelemetry(session: ExecutionSession, eventCount: number): void {
    const duration = session.completedAt ? session.completedAt - session.startedAt : 0

    if (session.status === "completed") this.runtimeTelemetry.completed++
    else if (session.status === "failed") this.runtimeTelemetry.failed++
    else if (session.status === "cancelled") this.runtimeTelemetry.cancelled++
    if (duration > 0) {
      this.runtimeTelemetry.durations.push(duration)
      if (this.runtimeTelemetry.durations.length > ExecutionSessionManager.MAX_TELEMETRY_ENTRIES) {
        this.runtimeTelemetry.durations = this.runtimeTelemetry.durations.slice(-ExecutionSessionManager.MAX_TELEMETRY_ENTRIES)
      }
    }

    // Log telemetry summary every 10 sessions for observability
    this.runtimeTelemetry.count++
    if (this.runtimeTelemetry.count > 0 && this.runtimeTelemetry.count % 10 === 0) {
      emitTelemetry({
        type: "runtime_telemetry",
        timestamp: Date.now(),
        metadata: {
          count: this.runtimeTelemetry.count,
          completed: this.runtimeTelemetry.completed,
          failed: this.runtimeTelemetry.failed,
          cancelled: this.runtimeTelemetry.cancelled,
          verificationsPassed: this.runtimeTelemetry.verificationsPassed,
          verificationsFailed: this.runtimeTelemetry.verificationsFailed,
          toolCompletes: this.runtimeTelemetry.toolCompletes,
          toolErrors: this.runtimeTelemetry.toolErrors,
          avgDurationMs: this.runtimeTelemetry.durations.length > 0
            ? Math.round(this.runtimeTelemetry.durations.reduce((a, b) => a + b, 0) / this.runtimeTelemetry.durations.length)
            : 0,
          recoveries: this.runtimeTelemetry.recoveries,
        },
      })
    }
  }

  private simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash |= 0
    }
    return hash.toString(36)
  }

  private parseArgs(args: string): Record<string, unknown> {
    try {
      return JSON.parse(args)
    } catch {
      return { raw: args.slice(0, 500) }
    }
  }

  cancel(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== "running") return

    session.status = "cancelled"
    session.completedAt = Date.now()

    // 1. Stop all streams immediately
    StreamManager.getInstance().clearAll()

    // 2. Abort any active runtime
    this.gateway.cancel()

    // 3. Finalize all store state immediately
    const timeline = useTimelineStore.getState()
    for (const [execId, stepId] of this.stepByExecId) {
      timeline.commitStreamingText(stepId)
      timeline.flushPendingText(stepId)
      timeline.updateAgentSession(stepId, { status: "complete", streamState: "cancelled", completedAt: Date.now() })
    }
    for (const [execId, initStepId] of this.initStepIds) {
      timeline.updateAgentSession(initStepId, { status: "complete", streamState: "cancelled", completedAt: Date.now() })
    }

    this.stepByExecId.clear()
    this.initStepIds.clear()
    this.sessionToExecId.delete(sessionId)
    this.activeSessionId = null

    // Discard or reject ChangeSet for this session on cancel
    const csId = this.sessionChangeSets.get(sessionId)
    if (csId) {
      const cs = useChangeSetStore.getState().getChangeSet(csId)
      if (cs && cs.status === "draft") {
        useChangeSetStore.getState().removeChangeSet(csId)
      } else if (cs) {
        ChangeSetManager.getInstance().rejectChangeSet(csId)
      }
      this.sessionChangeSets.delete(sessionId)
    }

    // Observability teardown on cancel
    if (FeatureFlagManager.getInstance().isEnabled("observability")) {
      this.obsManager.addSpan(sessionId, "execution_cancelled", { reason: "user_cancellation" })
      this.obsManager.endTrace(sessionId)
      this.obsManager.getReplay().endSession(`Session ${sessionId}: cancelled by user`).catch((err) => {
        console.error("[SessionManager] replay endSession error on cancel:", err)
      })
    }      // Clear event buffer for this session
    this.sessionEventBuffer.delete(sessionId)

    // Clean up any pending tool args to prevent memory leaks
    this.pendingToolArgs.clear()

    // Background safety fallback: only runs if something is genuinely stuck
    this.forceStopTimer = setTimeout(() => {
      for (const [sid, s] of this.sessions) {
        if (s.status === "running") {
          s.status = "cancelled"
          s.completedAt = Date.now()
        }
      }
      this.stepByExecId.clear()
      this.initStepIds.clear()
      this.sessionToExecId.clear()
    }, 2000)

    this.pruneSessions()
  }

  /** Clean auxiliary maps for sessions that have been pruned */
  private pruneAuxiliaryMaps(): void {
    const validSessionIds = new Set(this.sessions.keys())
    for (const [sid] of this.sessionToExecId) {
      if (!validSessionIds.has(sid)) {
        const eid = this.sessionToExecId.get(sid)
        this.sessionToExecId.delete(sid)
        if (eid) {
          this.stepByExecId.delete(eid)
          this.initStepIds.delete(eid)
        }
      }
    }
  }

  /** Remove sessions older than 1 hour, keep at most 50 recent sessions */
  private pruneSessions(): void {
    const MAX_SESSIONS = 50
    const MAX_AGE_MS = 60 * 60 * 1000 // 1 hour
    const now = Date.now()

    if (this.sessions.size <= MAX_SESSIONS) return

    const entries = Array.from(this.sessions.entries())
      .sort((a, b) => (b[1].startedAt ?? 0) - (a[1].startedAt ?? 0))

    const toDelete: string[] = []
    let count = 0
    for (const [id, session] of entries) {
      count++
      if (count > MAX_SESSIONS || (session.status !== "running" && now - (session.completedAt ?? session.startedAt) > MAX_AGE_MS)) {
        toDelete.push(id)
      }
    }

    for (const id of toDelete) {
      const pruned = this.sessions.get(id)
      this.sessions.delete(id)
      this.sessionEventBuffer.delete(id)
      emitTelemetry({ type: "session_pruned", timestamp: Date.now(), metadata: { sessionId: id, status: pruned?.status, ageMs: pruned ? now - (pruned.completedAt ?? pruned.startedAt) : 0 } })
    }

    this.pruneAuxiliaryMaps()
  }

  getSession(id: string): ExecutionSession | undefined {
    return this.sessions.get(id)
  }

  getActiveSessions(): ExecutionSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.status === "running")
  }
}
