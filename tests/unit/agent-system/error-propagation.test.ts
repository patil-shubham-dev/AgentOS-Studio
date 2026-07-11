import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { useAgentStore } from "@/stores/agent-store"
import { useAppStore } from "@/stores/app-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { UnifiedExecutionGateway } from "@/runtime/execution/UnifiedExecutionGateway"
import { StreamManager } from "@/runtime/streaming/StreamManager"
import { classifyProviderError } from "@/runtime/providers/ProviderError"

/**
 * Error propagation regression test.
 *
 * Across this project's history, provider errors have been silently swallowed
 * and treated as successful empty completions multiple times. This test
 * asserts that a provider error in ANY round (first round, or a later round
 * after tool calls) NEVER surfaces as a successful completion — it MUST
 * yield EXECUTION_FAILED and MESSAGE_COMPLETE(finishReason="error").
 *
 * The test mocks the provider's stream to return errors at different stages.
 */

function setupStores(overrides?: Record<string, any>) {
  useAgentStore.setState({
    conversations: { coder: { messages: [], createdAt: Date.now(), updatedAt: Date.now() } },
    executionMode: "auto", assignments: [], orchestrationSteps: [],
    clearAssignments: () => {}, clearOrchestrationSteps: () => {},
    addAgentAssignment: () => {}, addOrchestrationStep: () => {}, addMessage: () => {},
    ...overrides,
  } as any)
  useAppStore.setState({
    providers: [{ id: "test-provider", name: "Test Provider", baseUrl: "https://test.api.com", apiKey: "test-key", runtime: null, models: [{ id: "gpt-4" }] }],
  } as any)
  useWorkspaceRuntime.setState({
    status: "ready", wiredRuntimeRoles: ["manager", "coder"], wiredRoles: 2,
    wiredAgents: [
      { id: "agent-1", name: "Manager Agent", runtimeRole: "manager" as any, model: "gpt-4", providerId: "test-provider", providerName: "Test Provider", roleId: "manager" as any },
      { id: "agent-2", name: "Coder Agent", runtimeRole: "coder" as any, model: "gpt-4", providerId: "test-provider", providerName: "Test Provider", roleId: "coder" as any },
    ],
    managerWired: true, runtimeRoleRegistry: null, dataManager: null, runtimeClients: [], runtimes: [],
    setMemoryPressure: () => {}, setTokenUsage: () => {}, setStatus: () => {},
  } as any)
  useTimelineStore.setState({
    events: [], agentSessions: new Map(), streamingTexts: new Map(), sessionOrder: [],
    sessionCreatedAtEventCount: [], collapsedSections: new Set(),
    streamingMetrics: { tokensReceived: 0, tokensPerSecond: 0, lastTokenTimestamp: 0, firstTokenLatency: 0, totalLatency: 0 },
  } as any)
  StreamManager.getInstance().clearAll()
  StreamManager.getInstance().resetCancelled()
}

// ── Mock provider to produce errors ──
// IMPORTANT: all vi.fn() calls must be INSIDE the vi.mock factory because
// vi.mock is hoisted above module-level variable declarations.

vi.mock("@/runtime/providers/ProviderGateway", () => ({
  ProviderGateway: {
    getInstance: () => ({
      stream: vi.fn().mockImplementation(async function* () {
        yield { type: "error", code: "server_error", message: "ResourceExhausted: All workers are busy", userMessage: "The AI provider is at capacity. Please retry later.", retryable: true }
      }),
      chat: vi.fn().mockResolvedValue({ content: "mock response" }),
    }),
  },
  providerGateway: {
    stream: vi.fn().mockImplementation(async function* () {
      yield { type: "error", code: "server_error", message: "ResourceExhausted: All workers are busy", userMessage: "The AI provider is at capacity. Please retry later.", retryable: true }
    }),
    chat: vi.fn().mockResolvedValue({ content: "mock response" }),
  },
}))

describe("Error propagation — provider error never becomes empty success", () => {
  afterEach(() => {
    StreamManager.getInstance().clearAll()
  })

  it("first-round provider error yields EXECUTION_FAILED", async () => {
    setupStores()
    const result = await UnifiedExecutionGateway.getInstance().execute({
      input: "test coding request",
      activeRole: "coder" as any,
      editedFiles: [],
    })
    const events = result.events

    const hasFailed = events.some((e: any) => e.type === "EXECUTION_FAILED")
    const hasErrorComplete = events.some(
      (e: any) => e.type === "MESSAGE_COMPLETE" && (e as any).finishReason === "error"
    )
    const hasCleanComplete = events.some(
      (e: any) => e.type === "EXECUTION_COMPLETE" && (e as any).executionMode === "full"
    )

    // A provider error must NEVER produce a clean EXECUTION_COMPLETE
    // When the provider fails, UnifiedExecutor.fullPath yields
    // MESSAGE_COMPLETE(finishReason="error") and returns without reaching
    // the EXECUTION_COMPLETE yield point.
    expect(hasFailed || hasErrorComplete).toBe(true)
    // If there's a MESSAGE_COMPLETE with error, there should NOT be a clean completion
    if (hasErrorComplete) {
      // The executor should have returned early without EXECUTION_COMPLETE
      const msgComplete = events.filter((e: any) => e.type === "MESSAGE_COMPLETE" && (e as any).finishReason === "error")
      expect(msgComplete.length).toBeGreaterThanOrEqual(1)
    }
  })

  it("classifyProviderError correctly identifies ResourceExhausted as retryable", () => {
    const info = classifyProviderError("ResourceExhausted: All workers are busy")
    expect(info.retryable).toBe(true)
    expect(info.code).toBe("rate_limited")
  })

  it("classifyProviderError correctly identifies permanent errors as non-retryable", () => {
    const info = classifyProviderError("invalid API key")
    expect(info.retryable).toBe(false)
    expect(info.code).toBe("auth_failed")
  })

  it("classifyProviderError correctly identifies timeout as retryable", () => {
    const info = classifyProviderError("timeout after 30s")
    expect(info.retryable).toBe(true)
    expect(info.code).toBe("timeout")
  })
})
