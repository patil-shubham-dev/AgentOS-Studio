import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"
import { ProviderGateway } from "@/runtime/providers/ProviderGateway"
import { useAppStore } from "@/stores/app-store"

vi.mock("@/runtime/providers/ProviderError", () => ({
  classifyProviderError: vi.fn().mockReturnValue({
    code: "provider_error",
    message: "error",
    userMessage: "error",
    retryable: true,
  }),
}))

function resetAppStore() {
  useAppStore.setState({
    providers: [],
    mockMode: true,
    activeProviderId: null,
    theme: "dark",
    sidebarVisible: true,
  } as any)
}

describe("Performance: runtime startup", () => {
  beforeAll(() => {
    resetAppStore()
  })

  it("should initialize ProviderGateway singleton within threshold", () => {
    const start = performance.now()
    const gateway = ProviderGateway.getInstance()
    const elapsed = performance.now() - start
    expect(gateway).toBeInstanceOf(ProviderGateway)
    expect(elapsed).toBeLessThan(500)
  })

  it("should resolve mock provider stream", async () => {
    resetAppStore()
    const gateway = ProviderGateway.getInstance()
    gateway.clearUsageLog()

    const stream = gateway.stream({
      messages: [{ role: "user", content: "hello" }],
    })
    const events: string[] = []
    for await (const event of stream) {
      if (event.type === "token") events.push(event.text)
      if (event.type === "done") break
    }
    expect(events.length).toBeGreaterThan(0)
  })

  it("isConfigured returns true in mock mode", () => {
    resetAppStore()
    const gateway = ProviderGateway.getInstance()
    expect(gateway.isConfigured()).toBe(true)
  })

  afterAll(() => {
    resetAppStore()
  })
})

describe("Performance: tool operations", () => {
  it("should handle empty operation", async () => {
    const start = performance.now()
    const result = await Promise.resolve({ data: "ok" })
    const elapsed = performance.now() - start
    expect(result.data).toBe("ok")
    expect(elapsed).toBeLessThan(200)
  })

  it("should handle rapid sequential operations", async () => {
    const count = 50
    const start = performance.now()
    for (let i = 0; i < count; i++) {
      await Promise.resolve(i)
    }
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(2000)
  })

  it("should handle concurrent operations", async () => {
    const count = 20
    const start = performance.now()
    const results = await Promise.all(
      Array.from({ length: count }, (_, i) => Promise.resolve(i)),
    )
    const elapsed = performance.now() - start
    expect(results).toHaveLength(count)
    expect(elapsed).toBeLessThan(500)
  })
})

describe("Performance: diff computation", () => {
  function generateContent(size: number, prefix = "line"): string {
    return Array.from({ length: size }, (_, i) => `${prefix} ${i}: ${"data".repeat(10)}`).join("\n")
  }

  function computeDiffNaive(original: string, modified: string): { additions: number; deletions: number } {
    const origLines = original.split("\n")
    const modLines = modified.split("\n")
    const additions = modLines.filter((l) => !origLines.includes(l)).length
    const deletions = origLines.filter((l) => !modLines.includes(l)).length
    return { additions, deletions }
  }

  it("should compute small file diff", () => {
    const original = generateContent(50)
    const modified = generateContent(55)
    const start = performance.now()
    const result = computeDiffNaive(original, modified)
    const elapsed = performance.now() - start
    expect(result.additions).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(100)
  })

  it("should compute medium file diff", () => {
    const original = generateContent(500)
    const modified = generateContent(520)
    const start = performance.now()
    const result = computeDiffNaive(original, modified)
    const elapsed = performance.now() - start
    expect(result.additions).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(500)
  })

  it("should handle large file diff", () => {
    const original = generateContent(5000)
    const modified = generateContent(5020)
    const start = performance.now()
    const result = computeDiffNaive(original, modified)
    const elapsed = performance.now() - start
    expect(result.additions).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(5000)
  })

  it("should handle identical files", () => {
    const content = generateContent(100)
    const start = performance.now()
    const result = computeDiffNaive(content, content)
    const elapsed = performance.now() - start
    expect(result.additions).toBe(0)
    expect(result.deletions).toBe(0)
    expect(elapsed).toBeLessThan(100)
  })

  it("should handle empty files", () => {
    const start = performance.now()
    const result = computeDiffNaive("", generateContent(10))
    const elapsed = performance.now() - start
    expect(result.additions).toBe(10)
    expect(elapsed).toBeLessThan(100)
  })
})
