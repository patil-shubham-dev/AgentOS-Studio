import { ExecutionOrchestrator, type ExecuteOptions } from "@/runtime/execution/ExecutionOrchestrator"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import { useAgentStore } from "@/stores/agent-store"
import { useLedgerStore } from "@/stores/ledger-store"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { StreamManager } from "@/runtime/streaming/StreamManager"
import type { ToolCallRecord, FileEditRecord, TerminalRecord } from "@/components/workspace/timeline/step-card"
import { normalizeError } from "@/lib/normalize-error"
import { emitTelemetry } from "@/lib/telemetry"
import { getStateForToolCall, getActivityForToolCall, getAgentLabel } from "@/components/workspace/agent-visibility/AgentActivityMapper"

export interface ExecutionSession {
  id: string
  traceId: string
  startedAt: number
  completedAt?: number
  status: "running" | "completed" | "failed" | "cancelled"
  input: string
  error?: string
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export class ExecutionSessionManager {
  private static instance: ExecutionSessionManager
  private sessions: Map<string, ExecutionSession> = new Map()
  private orchestrator = ExecutionOrchestrator.getInstance()
  private stepByExecId = new Map<string, string>()
  private initStepIds = new Map<string, string>()
  private sessionToExecId = new Map<string, string>()
  private execRoleMap = new Map<string, string>()
  private activeSessionId: string | null = null
  private streamManagerFlushSet = false
  private forceStopTimer: ReturnType<typeof setTimeout> | null = null

  /** Max time to wait for first event before auto-cancelling */
  private static readonly FIRST_EVENT_TIMEOUT_MS = 45_000
  /** Max total session duration before force-cancel */
  private static readonly SESSION_MAX_DURATION_MS = 300_000

  static getInstance(): ExecutionSessionManager {
    if (!ExecutionSessionManager.instance) {
      ExecutionSessionManager.instance = new ExecutionSessionManager()
    }
    return ExecutionSessionManager.instance
  }

  static cancelCurrent(): void {
    const inst = ExecutionSessionManager.getInstance()
    if (inst.activeSessionId) {
      inst.cancel(inst.activeSessionId)
    }
  }

  async start(options: ExecuteOptions): Promise<ExecutionSession> {
    if (this.activeSessionId) {
      const existing = this.sessions.get(this.activeSessionId)
      if (existing?.status === "running") {
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
      startedAt: Date.now(),
      status: "running",
      input: options.input,
    }

    this.sessions.set(id, session)

    if (!this.streamManagerFlushSet) {
      this.streamManagerFlushSet = true
      StreamManager.getInstance().setFlushCallback((stepId, delta) => {
        useTimelineStore.getState().appendStreamingText(stepId, delta)
      })
    }

    try {
      const eventStream = this.orchestrator.execute(options)

      // Stall detection: cancel if no event received within timeout
      let firstEventReceived = false
      let stallTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        if (!firstEventReceived) {
          console.warn(`[SessionManager] No event received within ${ExecutionSessionManager.FIRST_EVENT_TIMEOUT_MS}ms — auto-cancelling`)
          this.orchestrator.cancel()
        }
      }, ExecutionSessionManager.FIRST_EVENT_TIMEOUT_MS)
      const sessionStartTime = Date.now()

      for await (const event of eventStream) {
        if (!firstEventReceived) {
          firstEventReceived = true
          if (stallTimer !== null) {
            clearTimeout(stallTimer)
            stallTimer = null
          }
        }

        // Total session duration check
        if (Date.now() - sessionStartTime > ExecutionSessionManager.SESSION_MAX_DURATION_MS) {
          console.warn(`[SessionManager] Session exceeded max duration — force-cancelling`)
          this.orchestrator.cancel()
          break
        }

        this.handleEvent(event, options)
      }

      if (stallTimer !== null) {
        clearTimeout(stallTimer)
        stallTimer = null
      }

      if (session.status !== "cancelled") {
        session.status = "completed"
      }
      session.completedAt = Date.now()
    } catch (e) {
      const msg = normalizeError(e, "Execution failed")
      session.error = msg
      session.status = msg.includes("abort") || msg.includes("cancel") ? "cancelled" : "failed"
      session.completedAt = Date.now()

        emitTelemetry({ type: "execution_complete", timestamp: Date.now(), durationMs: Date.now() - session.startedAt, error: msg, metadata: { status: session.status, sessionId: id } })
      if (msg.includes("abort") || msg.includes("cancel")) {
        emitTelemetry({ type: "cancellation", timestamp: Date.now(), metadata: { sessionId: id, reason: msg } })
      }
      // Safety net: finalize any remaining timeline sessions
      const timeline = useTimelineStore.getState()
      for (const [execId, stepId] of this.stepByExecId) {
        StreamManager.getInstance().clearStep(stepId)
        timeline.commitStreamingText(stepId)
        timeline.updateAgentSession(stepId, { status: "complete", streamState: "cancelled" })
        timeline.streamingTexts.delete(stepId)
      }
      for (const [execId, initStepId] of this.initStepIds) {
        timeline.updateAgentSession(initStepId, { status: "complete", streamState: "cancelled" })
        this.initStepIds.delete(execId)
      }
      this.stepByExecId.clear()
      this.sessionToExecId.clear()
    }

    // Prune old sessions to prevent unbounded map growth
    this.pruneSessions()

    this.activeSessionId = null
    return session
  }

  private handleEvent(event: ExecutionEvent, options: ExecuteOptions): void {
    const timeline = useTimelineStore.getState()

    switch (event.type) {
      case "AGENT_ASSIGNED": {
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
          timeline.upgradeOptimisticSession(optimisticStepId, event.stepId, {
            roleId: event.roleId,
            roleName: event.roleName,
            modelName: event.modelName,
            providerName: event.providerName,
            currentPhase: undefined,
            phaseHistory: [{ label: "Thinking", timestamp: Date.now() }, { label: "Connecting", timestamp: Date.now() }],
          })
        } else {
          // No optimistic session — create fresh
          const initBeforeReal = this.initStepIds.get(event.executionId)
          if (initBeforeReal) {
            timeline.updateAgentSession(initBeforeReal, { status: "complete", streamState: "completed" })
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
            startedAt: Date.now(),
            tokenAppended: 0,
          }, event.correlationId)
        }
        this.stepByExecId.set(event.executionId, event.stepId)
        break
      }

      case "MESSAGE_COMPLETE": {
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
            lastAction: activity.detail ?? event.toolName,
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
            lastAction: `${event.toolName.replace(/_/g, " ")} completed`,
          })
        }
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
        break
      }

      case "FILE_EDIT": {
        const stepId = this.stepByExecId.get(event.executionId)
        if (!stepId) break
        const fileEdit: FileEditRecord = {
          path: event.path,
          additions: event.additions ?? 0,
          deletions: event.deletions ?? 0,
          diffContent: event.newContent?.split("\n").map((l: string) => `+ ${l}`).join("\n") || "",
          oldContent: event.oldContent,
          newContent: event.newContent,
        }
        timeline.addFileEditToAgent(stepId, fileEdit)

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
        }
        timeline.addTerminalToAgent(cmdStepId, terminal)

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
        ceUpdated[ceLastIdx] = { ...ceUpdated[ceLastIdx], status: "error", exitCode: 1, output: event.error }
        timeline.updateAgentSession(ceStepId, { terminalOutputs: ceUpdated })
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
        // Check if this execution's session was already cancelled
        let wasCancelled = false
        for (const [, execId] of this.sessionToExecId) {
          if (execId === event.executionId) {
            const s = this.activeSessionId ? this.sessions.get(this.activeSessionId) : undefined
            if (s?.status === "cancelled") wasCancelled = true
            break
          }
        }
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
            timeline.streamingTexts.delete(efStepId)
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
        break
      }

      case "THINKING_STARTED": {
        const tsStepId = this.stepByExecId.get(event.executionId)
        if (tsStepId) {
          timeline.setPhase(tsStepId, event.label)
        }
        break
      }

      case "THINKING_UPDATE": {
        const tuStepId = this.stepByExecId.get(event.executionId)
        if (tuStepId) {
          timeline.setPhase(tuStepId, event.label)
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
          timeline.setPhase(clStepId, `Loading ${event.source}...`)
        }
        break
      }

      case "CONTEXT_READY": {
        const crStepId = this.stepByExecId.get(event.executionId)
        if (crStepId) {
          timeline.setPhase(crStepId, `${event.source} loaded`)
        }
        break
      }

      case "PROVIDER_CONNECTING": {
        const pcnStepId = this.stepByExecId.get(event.executionId)
        if (pcnStepId) {
          timeline.setPhase(pcnStepId, `Connecting to ${event.provider}...`)
        }
        break
      }

      case "PROVIDER_CONNECTED": {
        const pcdStepId = this.stepByExecId.get(event.executionId)
        if (pcdStepId) {
          timeline.setPhase(pcdStepId, `Connected to ${event.provider}`)
        }
        break
      }

      case "EXECUTION_COMPLETE": {
        const initCompleteId = this.initStepIds.get(event.executionId)
        if (initCompleteId) {
          timeline.updateAgentSession(initCompleteId, { status: "complete", streamState: "completed" })
          this.initStepIds.delete(event.executionId)
        }
        break
      }

      case "TOKEN":
      case "MESSAGE_UPDATE":
        break
    }
  }

  cancel(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== "running") return

    session.status = "cancelled"
    session.completedAt = Date.now()

    // 1. Stop all streams immediately
    StreamManager.getInstance().clearAll()

    // 2. Abort the orchestrator
    this.orchestrator.cancel()

    // 3. Finalize all store state immediately
    const timeline = useTimelineStore.getState()
    for (const [execId, stepId] of this.stepByExecId) {
      timeline.commitStreamingText(stepId)
      timeline.updateAgentSession(stepId, { status: "complete", streamState: "cancelled", completedAt: Date.now() })
      timeline.streamingTexts.delete(stepId)
    }
    for (const [execId, initStepId] of this.initStepIds) {
      timeline.updateAgentSession(initStepId, { status: "complete", streamState: "cancelled", completedAt: Date.now() })
    }

    this.stepByExecId.clear()
    this.initStepIds.clear()
    this.sessionToExecId.delete(sessionId)
    this.activeSessionId = null

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
      this.sessions.delete(id)
    }
  }

  getSession(id: string): ExecutionSession | undefined {
    return this.sessions.get(id)
  }

  getActiveSessions(): ExecutionSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.status === "running")
  }
}
