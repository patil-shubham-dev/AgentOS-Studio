import type { RuntimeRole } from "@/types"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { StreamManager } from "@/runtime/streaming/StreamManager"
import { isFileCreationRequest, executeFileCreation } from "./MockFileCreation"

export async function* mockExecutionPath(
  input: string,
  executionId: string,
  _activeRole: RuntimeRole,
  correlationId?: string,
  t0?: number,
): AsyncGenerator<ExecutionEvent> {
  const { generateMockResponse } = await import('@/runtime/providers/MockProviderRuntime')
  const stepId = `${executionId}_step`
  const rootPath = useWorkspaceStore.getState().rootPath

  yield { type: "AGENT_ASSIGNED", executionId, correlationId, roleId: "assistant", roleName: "Assistant", modelName: "mock-model", providerName: "Mock Provider", stepId, executionStrategy: "single-agent", timestamp: Date.now() }
  yield { type: "THINKING_STARTED", executionId, label: "Processing", timestamp: Date.now() }
  yield { type: "PROVIDER_CONNECTING", executionId, model: "mock-model", provider: "mock", temperature: 0.7, timestamp: Date.now() }

  let filesEdited = 0

  if (rootPath && isFileCreationRequest(input)) {
    const result = await executeFileCreation(input, rootPath, executionId, stepId)
    if (result) {
      filesEdited = result.filesCreated
      yield { type: "PROVIDER_CONNECTED", executionId, model: "mock-model", provider: "mock", temperature: 0.7, timestamp: Date.now() }
      StreamManager.getInstance().complete(stepId)
      yield { type: "MESSAGE_COMPLETE", executionId, stepId, content: result.message, finishReason: "stop", timestamp: Date.now(), tokensIn: 0, tokensOut: 0 }
      const durationMs = Math.round(performance.now() - (t0 ?? performance.now()))
      yield { type: "EXECUTION_COMPLETE", executionId, content: result.message, filesEdited, commandsRun: 0, toolCalls: filesEdited, durationMs, timestamp: Date.now(), executionMode: "fast" }
      return
    }
  }

  const fullText = generateMockResponse(input)
  const words = fullText.split(/(\s+)/)
  for (const word of words) {
    yield { type: "TOKEN", executionId, token: word, timestamp: Date.now() }
    await new Promise(r => setTimeout(r, 3))
  }

  yield { type: "PROVIDER_CONNECTED", executionId, model: "mock-model", provider: "mock", temperature: 0.7, timestamp: Date.now() }
  StreamManager.getInstance().complete(stepId)
  yield { type: "MESSAGE_COMPLETE", executionId, stepId, content: fullText, finishReason: "stop", timestamp: Date.now(), tokensIn: 0, tokensOut: 0 }

  const durationMs = Math.round(performance.now() - (t0 ?? performance.now()))
  yield { type: "EXECUTION_COMPLETE", executionId, content: fullText, filesEdited, commandsRun: 0, toolCalls: 0, durationMs, timestamp: Date.now(), executionMode: "fast" }
}
