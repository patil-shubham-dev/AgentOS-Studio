import { describe, it, expect, vi, beforeEach } from "vitest"

const mockExecute = vi.fn()
vi.mock("@/runtime/agents/AgentExecutor", () => ({
  AgentExecutor: vi.fn(() => ({ execute: mockExecute })),
}))
vi.mock("@/stores/app-store", () => ({
  useAppStore: { getState: () => ({}) },
}))
vi.mock("@/runtime/EventBus", () => ({
  EventBus: { getInstance: () => ({ emit: vi.fn() }) },
}))
vi.mock("@/lib/execution-trace", () => ({
  trace: vi.fn(), startTrace: vi.fn(), endTrace: vi.fn(),
}))

import { SynthesisEngine } from "@/runtime/execution/SynthesisEngine"
import { AgentExecutor } from "@/runtime/agents/AgentExecutor"

async function consume<T>(gen: AsyncGenerator<any, T, any>): Promise<T> {
  let result: T = undefined as any
  while (true) {
    const next = await gen.next()
    if (next.done) {
      result = next.value as T
      break
    }
  }
  return result
}

describe("SynthesisEngine", () => {
  beforeEach(() => {
    mockExecute.mockReset()
    ;(AgentExecutor as any).mockClear()
  })

  it("synthesizes single agent result from MESSAGE_COMPLETE", async () => {
    mockExecute.mockImplementation(function* () {
      yield { type: "MESSAGE_COMPLETE", executionId: "test", stepId: "s", content: "Found the bug in line 42", finishReason: "stop", timestamp: Date.now() }
    })
    const result = await consume(new SynthesisEngine().synthesize("find the bug", [{ role: "coder", content: "Found bug" }], [], "exec_1"))
    expect(result).toBe("Found the bug in line 42")
  })

  it("handles multiple agent results", async () => {
    mockExecute.mockImplementation(function* () {
      yield { type: "MESSAGE_COMPLETE", executionId: "test", stepId: "s", content: "Synthesized all", finishReason: "stop", timestamp: Date.now() }
    })
    const result = await consume(new SynthesisEngine().synthesize("build app", [
      { role: "research", content: "Best practices" },
      { role: "coder", content: "Implemented" },
    ], [], "exec_1"))
    expect(result.length).toBeGreaterThan(0)
  })

  it("handles empty agent results array", async () => {
    mockExecute.mockImplementation(function* () {
      yield { type: "MESSAGE_COMPLETE", executionId: "test", stepId: "s", content: "No results", finishReason: "stop", timestamp: Date.now() }
    })
    const result = await consume(new SynthesisEngine().synthesize("test", [], [], "exec_1"))
    expect(typeof result).toBe("string")
  })

  it("returns empty string when no MESSAGE_COMPLETE yielded", async () => {
    mockExecute.mockImplementation(function* () {
      yield { type: "TOKEN", executionId: "test", token: "hello", timestamp: Date.now() }
    })
    const result = await consume(new SynthesisEngine().synthesize("test", [{ role: "coder", content: "done" }], [], "exec_1"))
    expect(result).toBe("")
  })

  it("abort signal does not prevent completion", async () => {
    mockExecute.mockImplementation(function* () {
      yield { type: "MESSAGE_COMPLETE", executionId: "test", stepId: "s", content: "done", finishReason: "stop", timestamp: Date.now() }
    })
    const ctrl = new AbortController()
    const result = await consume(new SynthesisEngine().synthesize("test", [{ role: "coder", content: "done" }], [], "exec_1", ctrl.signal))
    expect(result).toBe("done")
  })

  it("constructs prompt with all agent results included", async () => {
    mockExecute.mockImplementation(function* () {
      yield { type: "MESSAGE_COMPLETE", executionId: "test", stepId: "s", content: "done", finishReason: "stop", timestamp: Date.now() }
    })
    await consume(new SynthesisEngine().synthesize("test input", [
      { role: "coder", content: "Coder output" },
      { role: "qa", content: "QA output" },
    ], [], "exec_1"))
    expect(AgentExecutor).toHaveBeenCalledTimes(1)
    const args = (AgentExecutor as any).mock.calls[0][0]
    expect(args.input).toContain("coder")
    expect(args.input).toContain("QA")
    expect(args.role).toBe("manager")
    expect(args.mode).toBe("FAST")
  })

  it("uses manager role for synthesis", async () => {
    mockExecute.mockImplementation(function* () {
      yield { type: "MESSAGE_COMPLETE", executionId: "test", stepId: "s", content: "synth", finishReason: "stop", timestamp: Date.now() }
    })
    await consume(new SynthesisEngine().synthesize("test", [{ role: "coder", content: "x" }], [], "exec_1"))
    expect((AgentExecutor as any).mock.calls[0][0].role).toBe("manager")
  })
})
