import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { useAgentStore } from "@/stores/agent-store"
import { useAppStore } from "@/stores/app-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { ExecutionOrchestrator } from "@/runtime/execution/ExecutionOrchestrator"
import { StreamManager } from "@/runtime/streaming/StreamManager"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import type { ToolCallRecord, FileEditRecord, TerminalRecord } from "@/components/workspace/timeline/step-card"

// Polyfill browser APIs not available in Node
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
  return setTimeout(() => cb(performance.now()), 0) as unknown as number
}
globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)
globalThis.performance = globalThis.performance ?? Date.now() as any

let mockTokenCalls: string[] = []
vi.mock("@/lib/agents/orchestrator", () => ({
  fastChatCompletion: vi.fn(async (
    _baseUrl: string,
    _apiKey: string,
    _model: string,
    _input: string,
    _history: any[],
    _signal: AbortSignal,
    onToken: (token: string) => void,
  ) => {
    const tokens = ["Hello", "! ", "I", " am", " an", " AI", " assistant", "."]
    for (const t of tokens) {
      if (_signal.aborted) throw new DOMException("Aborted", "AbortError")
      onToken(t)
      await new Promise(r => setTimeout(r, 1))
      mockTokenCalls.push(t)
    }
    return { response: "Hello! I am an AI assistant.", usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 } }
  }),
}))

function setupStores() {
  useAgentStore.setState({
    conversations: {
      coder: { messages: [], createdAt: Date.now(), updatedAt: Date.now() },
    },
    executionMode: "auto",
    assignments: [],
    orchestrationSteps: [],
    clearAssignments: () => {},
    clearOrchestrationSteps: () => {},
    addAgentAssignment: () => {},
    addOrchestrationStep: () => {},
    addMessage: () => {},
  } as any)

  useAppStore.setState({
    providers: [
      { id: "test-provider", name: "Test Provider", baseUrl: "https://test.api.com", apiKey: "test-key", runtime: null },
    ],
  } as any)

  useWorkspaceRuntime.setState({
    status: "ready",
    wiredRuntimeRoles: ["manager", "coder"],
    wiredRoles: 1,
    wiredAgents: [
      {
        id: "agent-1",
        name: "Manager Agent",
        runtimeRole: "manager" as any,
        model: "gpt-4",
        providerId: "test-provider",
        providerName: "Test Provider",
        roleId: "manager" as any,
      },
    ],
    managerWired: true,
    runtimeRoleRegistry: null,
    dataManager: null,
    runtimeClients: [],
    runtimes: [],
    setMemoryPressure: () => {},
    setTokenUsage: () => {},
    setStatus: () => {},
  } as any)

  useTimelineStore.setState({
    events: [],
    agentSessions: new Map(),
    streamingTexts: new Map(),
    sessionOrder: [],
    sessionCreatedAtEventCount: [],
    collapsedSections: new Set(),
    streamingMetrics: { tokensReceived: 0, tokensPerSecond: 0, lastTokenTimestamp: 0, firstTokenLatency: 0, totalLatency: 0 },
  })
}

function formatPayload(event: ExecutionEvent): { size: number; stepId?: string; details: string } {
  const size = JSON.stringify(event).length
  let stepId: string | undefined
  let details = ""
  switch (event.type) {
    case "AGENT_ASSIGNED": stepId = event.stepId; details = `role=${event.roleId}`; break
    case "MESSAGE_COMPLETE": stepId = event.stepId; details = `contentLen=${event.content.length}`; break
    case "TOKEN": details = `"${event.token.replace(/\n/g, "\\n")}"`; break
    case "TOOL_START": details = `tool=${event.toolName}`; break
    case "TOOL_COMPLETE": details = `tool=${event.toolName} duration=${event.durationMs}ms`; break
    case "FILE_EDIT": details = `path=${event.path}`; break
    case "COMMAND_START": details = `cmd="${event.command.slice(0, 40)}"`; break
    case "EXECUTION_FAILED": details = `error="${event.error}"`; break
    case "EXECUTION_CREATED": details = `inputLen=${event.input.length}`; break
    case "EXECUTION_COMPLETE": details = `duration=${event.durationMs}ms`; break
    case "PROVIDER_CONNECTING": details = `model=${event.model}`; break
    case "PROVIDER_CONNECTED": details = `model=${event.model}`; break
    default: details = ""
  }
  return { size, stepId, details }
}

function pad(s: string, n: number): string {
  return s + " ".repeat(Math.max(0, n - s.length))
}

describe("ExecutionEventFlow", () => {
  let orchestrator: ExecutionOrchestrator

  beforeEach(() => {
    mockTokenCalls = []
    StreamManager.getInstance().clearAll()
    setupStores()
    orchestrator = ExecutionOrchestrator.getInstance()
  })

  afterEach(() => {
    StreamManager.getInstance().clearAll()
  })

  it("captures every event with timestamps and dumps store state", async () => {
    const stepByExecId = new Map<string, string>()
    const startTs = Date.now()
    let eventCount = 0
    let firstTokenTime: number | null = null
    let providerConnectedTime: number | null = null
    let messageCompleteTime: number | null = null
    let executionCompleteTime: number | null = null
    let executionFailedTime: number | null = null
    let lastEventType: string | null = null
    let capturedStepId: string | null = null

    // Set up StreamManager to write to store on flush
    const flushedTokens: string[] = []
    let flushCount = 0
    StreamManager.getInstance().setFlushCallback((stepId, delta) => {
      if (firstTokenTime === null) {
        firstTokenTime = Date.now() - startTs
        console.log(
          pad("", 14) + " | " +
          pad("→ FLUSH (1st token)", 24) + " | " +
          pad(String(delta.length), 6) + " | " +
          `stepId=${stepId} delta="${delta.replace(/\n/g, "\\n")}"`
        )
      }
      flushCount++
      flushedTokens.push(delta)
      useTimelineStore.getState().appendStreamingText(stepId, delta)
    })

    console.log("")
    console.log(pad("TIMESTAMP", 14) + " | " + pad("EVENT TYPE", 24) + " | " + pad("SIZE", 6) + " | " + pad("DETAILS", 50))
    console.log("-".repeat(100))

    // Reset cancelled flag that was set by clearAll() in beforeEach
    StreamManager.getInstance().resetCancelled()

    const eventStream = orchestrator.execute({
      input: "hello",
      activeRole: "coder" as any,
    })

    for await (const event of eventStream) {
      eventCount++
      const ts = Date.now() - startTs
      const { size, stepId, details } = formatPayload(event)
      lastEventType = event.type

      if (stepId) capturedStepId = stepId

      switch (event.type) {
        case "EXECUTION_CREATED":
          // no store write
          break

        case "AGENT_ASSIGNED":
          stepByExecId.set(event.executionId, event.stepId)
          useTimelineStore.getState().addAgentSession({
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
          })
          break

        case "PROVIDER_CONNECTING":
          providerConnectedTime = null // not connected yet
          break

        case "PROVIDER_CONNECTED":
          providerConnectedTime = ts
          break

        case "TOKEN":
          // In FAST mode, tokens go directly to StreamManager (not yielded as TOKEN events)
          // First-token time is tracked via StreamManager flushCallback
          break

        case "MESSAGE_COMPLETE":
          messageCompleteTime = ts
          if (event.stepId) {
            StreamManager.getInstance().complete(event.stepId)
            const tl = useTimelineStore.getState()
            const preText = tl.streamingTexts.get(event.stepId)
            tl.commitStreamingText(event.stepId)
            tl.updateAgentSession(event.stepId, { status: "complete" })
            console.log(
              pad("", 14) + " | " +
              pad("→ flush delivered", 24) + " | " +
              pad("", 6) + " | " +
              `"${preText}" (${preText?.length ?? 0} chars committed to session)`
            )
          }
          break

        case "EXECUTION_COMPLETE":
          executionCompleteTime = ts
          break

        case "EXECUTION_FAILED":
          executionFailedTime = ts
          break

        case "TOOL_START": {
          const sId = stepByExecId.get(event.executionId)
          if (sId) {
            const toolCall: ToolCallRecord = {
              id: event.toolId,
              name: event.toolName,
              args: event.args.slice(0, 200),
              status: "running",
            }
            useTimelineStore.getState().addToolCallToAgent(sId, toolCall)
          }
          break
        }

        case "TOOL_COMPLETE": {
          const sId = stepByExecId.get(event.executionId)
          if (sId) {
            useTimelineStore.getState().updateToolCall(sId, event.toolId, {
              status: "complete",
              result: event.result?.slice(0, 200),
              durationMs: event.durationMs,
            })
          }
          break
        }

        case "FILE_EDIT": {
          const sId = stepByExecId.get(event.executionId)
          if (sId) {
            const fe: FileEditRecord = {
              path: event.path,
              additions: event.additions ?? 0,
              deletions: event.deletions ?? 0,
              diffContent: event.newContent?.split("\n").map((l: string) => `+ ${l}`).join("\n") || "",
              oldContent: event.oldContent,
              newContent: event.newContent,
            }
            useTimelineStore.getState().addFileEditToAgent(sId, fe)
          }
          break
        }

        case "COMMAND_START": {
          const sId = stepByExecId.get(event.executionId)
          if (sId) {
            const term: TerminalRecord = {
              command: event.command,
              output: "",
              status: "running",
            }
            useTimelineStore.getState().addTerminalToAgent(sId, term)
          }
          break
        }

        case "COMMAND_OUTPUT": {
          const sId = stepByExecId.get(event.executionId)
          if (sId) {
            const sess = useTimelineStore.getState().agentSessions.get(sId)
            if (sess) {
              const lastIdx = sess.terminalOutputs.length - 1
              if (lastIdx >= 0 && sess.terminalOutputs[lastIdx].status === "running") {
                const updated = [...sess.terminalOutputs]
                updated[lastIdx] = { ...updated[lastIdx], output: updated[lastIdx].output + event.output }
                useTimelineStore.getState().updateAgentSession(sId, { terminalOutputs: updated })
              }
            }
          }
          break
        }

        case "COMMAND_COMPLETE": {
          const sId = stepByExecId.get(event.executionId)
          if (sId) {
            const sess = useTimelineStore.getState().agentSessions.get(sId)
            if (sess && sess.terminalOutputs.length > 0) {
              const lastIdx = sess.terminalOutputs.length - 1
              const updated = [...sess.terminalOutputs]
              updated[lastIdx] = { ...updated[lastIdx], status: "success", exitCode: event.exitCode }
              useTimelineStore.getState().updateAgentSession(sId, { terminalOutputs: updated })
            }
          }
          break
        }

        case "COMMAND_ERROR": {
          const sId = stepByExecId.get(event.executionId)
          if (sId) {
            const sess = useTimelineStore.getState().agentSessions.get(sId)
            if (sess && sess.terminalOutputs.length > 0) {
              const lastIdx = sess.terminalOutputs.length - 1
              const updated = [...sess.terminalOutputs]
              updated[lastIdx] = { ...updated[lastIdx], status: "error", exitCode: 1, output: event.error }
              useTimelineStore.getState().updateAgentSession(sId, { terminalOutputs: updated })
            }
          }
          break
        }

        case "ACTION":
          // action — no store write needed for test
          break

        case "SYNTHESIS_COMPLETE":
          // synthesis — no store write needed for test
          break
      }

      console.log(
        pad(`T+${ts}ms`, 14) + " | " +
        pad(event.type, 24) + " | " +
        pad(String(size), 6) + " | " +
        (stepId ? `stepId=${stepId} ` : "") +
        details
      )
    }

    const endTs = Date.now() - startTs

    // Flush any remaining StreamManager tokens
    StreamManager.getInstance().flushImmediate()

    // ── DUMP STORE STATE ──
    const timeline = useTimelineStore.getState()

    console.log("")
    console.log("=".repeat(100))
    console.log("EXECUTION COMPLETE")
    console.log("=".repeat(100))
    console.log(`Total events:      ${eventCount}`)
    console.log(`Total time:        ${endTs}ms`)
    console.log(`Last event:        ${lastEventType}`)
    console.log(`Step ID:           ${capturedStepId}`)
    console.log("")

    console.log("=".repeat(100))
    console.log("TimelineStore — agentSessions")
    console.log("=".repeat(100))
    for (const [stepId, sess] of timeline.agentSessions) {
      console.log(`stepId:           ${stepId}`)
      console.log(`roleId:           ${sess.roleId}`)
      console.log(`roleName:         ${sess.roleName}`)
      console.log(`status:           ${sess.status}`)
      console.log(`streamState:      ${sess.streamState}`)
      console.log(`streamingText:    "${sess.streamingText}"`)
      console.log(`toolCalls:        ${sess.toolCalls.length} items`)
      for (const tc of sess.toolCalls) {
        console.log(`  - ${tc.name} (${tc.status}) args="${tc.args.slice(0, 60)}"`)
      }
      console.log(`fileEdits:        ${sess.fileEdits.length} items`)
      for (const fe of sess.fileEdits) {
        console.log(`  - ${fe.path} (+${fe.additions}/-${fe.deletions})`)
      }
      console.log(`terminalOutputs:  ${sess.terminalOutputs.length} items`)
      for (const to of sess.terminalOutputs) {
        console.log(`  - cmd="${to.command.slice(0, 40)}" status=${to.status} outputLen=${to.output.length}`)
      }
      console.log(`modelName:        ${sess.modelName}`)
      console.log(`providerName:     ${sess.providerName}`)
    }

    console.log("")
    console.log("=".repeat(100))
    console.log("TimelineStore — streamingTexts")
    console.log("=".repeat(100))
    console.log(`Count: ${timeline.streamingTexts.size}`)
    if (timeline.streamingTexts.size > 0) {
      for (const [stepId, text] of timeline.streamingTexts) {
        console.log(`  ${stepId}: "${text}"`)
      }
    } else {
      console.log("  (empty — all text committed to agentSessions)")
    }

    console.log("")
    console.log("=".repeat(100))
    console.log("StreamManager — flushed token deltas")
    console.log("=".repeat(100))
    console.log(`Chunks: ${flushedTokens.length}`)
    for (let i = 0; i < flushedTokens.length; i++) {
      console.log(`  [${i}] "${flushedTokens[i]}"`)
    }
    const allFlushed = flushedTokens.join("")
    console.log(`Total:  "${allFlushed}"`)

    console.log("")
    console.log("=".repeat(100))
    console.log("ANSWERS")
    console.log("=".repeat(100))
    console.log(`1. Did PROVIDER_CONNECTED occur?          ${providerConnectedTime !== null ? `YES at T+${providerConnectedTime}ms` : "NO"}`)
    console.log(`2. Did FIRST TOKEN occur?                 ${firstTokenTime !== null ? `YES at T+${firstTokenTime}ms (via StreamManager flush, not TOKEN event — FAST mode delivers tokens directly to buffer)` : "NO — tokens were never flushed"}`)
    console.log(`3. Did MESSAGE_COMPLETE occur?            ${messageCompleteTime !== null ? `YES at T+${messageCompleteTime}ms` : "NO"}`)
    console.log(`4. Did EXECUTION_COMPLETE occur?          ${executionCompleteTime !== null ? `YES at T+${executionCompleteTime}ms` : "NO"}`)
    console.log(`5. If yes, why does UI show Thinking?     Session status: "${(timeline.agentSessions.values().next().value)?.status ?? "(no session)"}" streamState: "${(timeline.agentSessions.values().next().value)?.streamState ?? "(no session)"}" streamingText length: ${(timeline.agentSessions.values().next().value)?.streamingText?.length ?? 0}`)
    console.log(`6. Last event:                             ${executionFailedTime !== null ? "EXECUTION_FAILED" : messageCompleteTime !== null ? "MESSAGE_COMPLETE" : lastEventType}`)

    // ── VERIFICATION ──
    expect(firstTokenTime).not.toBeNull()
    expect(providerConnectedTime).not.toBeNull()
    expect(messageCompleteTime).not.toBeNull()
    expect(executionCompleteTime).not.toBeNull()
    expect(executionFailedTime).toBeNull()

    expect(timeline.agentSessions.size).toBe(1)
    const sessionV = timeline.agentSessions.values().next().value
    expect(sessionV).toBeDefined()
    const session = sessionV!
    expect(session.status).toBe("complete")
    expect(session.streamState).toBe("completed")
    expect(session.streamingText.length).toBeGreaterThan(0)
    expect(session.streamingText).toBe("Hello! I am an AI assistant.")
    expect(timeline.streamingTexts.size).toBe(0)

    expect(allFlushed.length).toBeGreaterThan(0)
    expect(allFlushed).toBe("Hello! I am an AI assistant.")
  })
})
