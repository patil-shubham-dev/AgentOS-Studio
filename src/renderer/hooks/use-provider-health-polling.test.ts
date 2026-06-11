import { describe, it, expect, vi, beforeEach } from "vitest"
import { runProviderHealthChecks } from "./use-provider-health-polling"

vi.mock("@agentic-os/providers", () => {
  const success = { run: { id: "test", timestamp: Date.now(), overall: "passed" as const, totalLatencyMs: 100, steps: [] }, capabilities: null }
  return { runFullValidation: vi.fn().mockResolvedValue(success) }
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("runProviderHealthChecks", () => {
  it("calls runFullValidation for each eligible provider", async () => {
    const { runFullValidation } = await import("@agentic-os/providers")
    const getVersion = vi.fn().mockReturnValue(1)

    await runProviderHealthChecks(
      [
        { baseUrl: "https://api.openai.com/v1", apiKey: "sk-xxx", runtime: "OpenAI", models: [{ id: "gpt-4" }] },
        { baseUrl: "https://api.anthropic.com/v1", apiKey: "sk-ant-xxx", runtime: "Anthropic", models: [{ id: "claude-3" }] },
      ],
      getVersion,
    )

    expect(runFullValidation).toHaveBeenCalledTimes(2)
    expect(runFullValidation).toHaveBeenCalledWith("https://api.openai.com/v1", "sk-xxx", "OpenAI", ["gpt-4"])
    expect(runFullValidation).toHaveBeenCalledWith("https://api.anthropic.com/v1", "sk-ant-xxx", "Anthropic", ["claude-3"])
  })

  it("handles empty provider list gracefully", async () => {
    const { runFullValidation } = await import("@agentic-os/providers")
    const getVersion = vi.fn()

    await runProviderHealthChecks([], getVersion)

    expect(runFullValidation).not.toHaveBeenCalled()
  })

  it("stops early when version changes (stale run detection)", async () => {
    let version = 1
    const getVersion = vi.fn(() => version)
    const { runFullValidation } = await import("@agentic-os/providers")

    vi.mocked(runFullValidation).mockImplementation(async () => {
      version++
      return { run: { id: "test", timestamp: Date.now(), overall: "passed" as const, totalLatencyMs: 100, steps: [] }, capabilities: null }
    })

    await runProviderHealthChecks(
      [
        { baseUrl: "https://first.example.com", apiKey: "key-1", runtime: null, models: [] },
        { baseUrl: "https://second.example.com", apiKey: "key-2", runtime: null, models: [] },
        { baseUrl: "https://third.example.com", apiKey: "key-3", runtime: null, models: [] },
      ],
      getVersion,
    )

    // Only the first provider was processed before version changed once
    expect(runFullValidation).toHaveBeenCalledTimes(1)
  })

  it("continues to next provider if runFullValidation throws", async () => {
    const { runFullValidation } = await import("@agentic-os/providers")
    vi.mocked(runFullValidation)
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({ run: { id: "test", timestamp: Date.now(), overall: "passed" as const, totalLatencyMs: 100, steps: [] }, capabilities: null })

    const getVersion = vi.fn().mockReturnValue(1)

    await runProviderHealthChecks(
      [
        { baseUrl: "https://failing.example.com", apiKey: "key-1", runtime: null, models: [] },
        { baseUrl: "https://working.example.com", apiKey: "key-2", runtime: null, models: [] },
      ],
      getVersion,
    )

    expect(runFullValidation).toHaveBeenCalledTimes(2)
  })
})
