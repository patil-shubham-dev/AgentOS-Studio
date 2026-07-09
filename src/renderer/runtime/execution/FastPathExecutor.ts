import type { RuntimeRole } from "@/types"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import { AgentExecutor } from "@/runtime/agents/AgentExecutor"
import { StreamManager } from "@/runtime/streaming/StreamManager"

type GetHistoryFn = (role: RuntimeRole) => any[]

export class FastPathExecutor {
  private getProcessedHistory: GetHistoryFn

  constructor(deps: { getProcessedHistory: GetHistoryFn }) {
    this.getProcessedHistory = deps.getProcessedHistory
  }

  async *execute(
    input: string,
    activeRole: RuntimeRole,
    ctrl: AbortController,
    executionId: string,
    correlationId?: string,
    t0?: number,
  ): AsyncGenerator<ExecutionEvent> {
    const stepId = `${executionId}_step`
    yield { type: "AGENT_ASSIGNED", executionId, correlationId, roleId: "assistant", roleName: "Assistant", modelName: "", providerName: "", stepId, executionStrategy: "single-agent", timestamp: Date.now() }
    yield { type: "THINKING_STARTED", executionId, label: "Thinking", timestamp: Date.now() }
    yield { type: "PROVIDER_CONNECTING", executionId, model: activeRole, provider: activeRole, temperature: 0.7, timestamp: Date.now() }

    const executor = new AgentExecutor({
      executionId,
      mode: "FAST",
      role: activeRole,
      input,
      history: this.getProcessedHistory(activeRole),
      signal: ctrl.signal,
    })

    let content = ""
    for await (const event of executor.execute()) {
      if (ctrl.signal.aborted) break
      if (event.type === "MESSAGE_COMPLETE") { content = event.content; continue }
      yield event
    }
    if (ctrl.signal.aborted) return

    StreamManager.getInstance().complete(stepId)
    yield { type: "MESSAGE_COMPLETE", executionId, stepId, content: content || "", finishReason: "stop", timestamp: Date.now() }
    yield { type: "EXECUTION_COMPLETE", executionId, content: content || "", filesEdited: 0, commandsRun: 0, toolCalls: 0, durationMs: Math.round(performance.now() - (t0 ?? performance.now())), timestamp: Date.now(), executionMode: "fast" }
  }
}
