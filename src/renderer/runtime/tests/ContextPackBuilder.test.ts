import { describe, it, expect, vi, beforeEach } from "vitest"
import { ContextPackBuilder } from "@/runtime/context/ContextPackBuilder"
import type { ContextAssemblyResult } from "@/runtime/context/context-types"

const mockAssembleSystemPrompt = vi.fn()

vi.mock("@/runtime/context/ContextManager", () => ({
  ContextManager: {
    getInstance: () => ({
      assembleSystemPrompt: mockAssembleSystemPrompt,
    }),
  },
}))

const mockFsExistsSync = vi.fn()
const mockFsReadFile = vi.fn()

vi.mock("fs", () => ({
  existsSync: (...args: any[]) => mockFsExistsSync(...args),
}))

vi.mock("fs/promises", () => ({
  readFile: (...args: any[]) => mockFsReadFile(...args),
}))

vi.mock("@/lib/git", () => ({
  gitDiff: vi.fn().mockResolvedValue(""),
}))

vi.mock("@/stores/workspace-store", () => ({
  useWorkspaceStore: {
    getState: vi.fn(() => ({
      rootPath: "/test-workspace",
      openFiles: [],
    })),
    setState: vi.fn(),
    subscribe: vi.fn(),
  },
}))

vi.mock("@/stores/diagnostics-store", () => ({
  useDiagnosticsStore: {
    getState: vi.fn(() => ({
      diagnostics: [],
    })),
  },
}))

const MOCK_RESULT: ContextAssemblyResult = {
  systemPrompt: "You are a senior software engineer...",
  staticBlocks: [
    { name: "role_identity", content: "You are a coder.", cacheScope: null, isDynamic: false },
    { name: "tools", content: "Available tools: read, edit, search", cacheScope: null, isDynamic: false },
  ],
  dynamicBlocks: [
    { name: "workspace_context", content: "Project: AgenticOS", cacheScope: null, isDynamic: true },
  ],
  tokenEstimate: 2500,
  contextWindowSize: 200_000,
  budgetRemaining: 197_500,
}

describe("ContextPackBuilder", () => {
  let builder: ContextPackBuilder

  beforeEach(() => {
    vi.clearAllMocks()
    builder = new ContextPackBuilder()
    mockFsExistsSync.mockReturnValue(true)
    mockFsReadFile.mockResolvedValue("// mock file content\n")
  })

  it("builds a ContextPack from a context assembly result", async () => {
    mockAssembleSystemPrompt.mockResolvedValue(MOCK_RESULT)

    const pack = await builder.build({
      role: "coder",
      userMessage: "Fix the auth bug",
      activeFilePath: "src/main.ts",
    })

    expect(pack.systemPrompt).toBe("You are a senior software engineer...")
    expect(pack.sources.length).toBeGreaterThan(0)
    expect(pack.totalTokens).toBeGreaterThan(0)
    expect(pack.tokenBudget).toBe(200_000)
    expect(pack.remainingTokens).toBeGreaterThan(0)
    expect(pack.remainingTokens).toBeLessThan(pack.tokenBudget)
    expect(pack.createdAt).toBeGreaterThan(0)
  })

  it("returns empty pack when context assembly returns null", async () => {
    mockAssembleSystemPrompt.mockResolvedValue(null)

    const pack = await builder.build({
      role: "coder",
      userMessage: "test",
    })

    expect(pack.systemPrompt).toBe("")
    expect(pack.sources).toEqual([])
    expect(pack.totalTokens).toBe(0)
  })

  it("includes sources for static and dynamic blocks", async () => {
    mockAssembleSystemPrompt.mockResolvedValue(MOCK_RESULT)

    const pack = await builder.build({
      role: "coder",
      userMessage: "test",
    })

    const systemPromptSources = pack.sources.filter((s) => s.type === "system_prompt")
    expect(systemPromptSources.length).toBe(3)
    expect(systemPromptSources[0].content).toContain("coder")
    expect(systemPromptSources[1].content).toContain("tools")
  })

  it("includes explicit file references when provided", async () => {
    mockAssembleSystemPrompt.mockResolvedValue(MOCK_RESULT)
    mockFsExistsSync.mockReturnValue(true)
    mockFsReadFile.mockResolvedValue("// auth.ts content\n")

    const pack = await builder.build({
      role: "coder",
      userMessage: "test",
      relevantFiles: [
        { path: "src/auth.ts", relevance: 0.9, reason: "Active file" },
      ],
    })

    const fileSources = pack.sources.filter((s) => s.type === "explicit_file")
    expect(fileSources.length).toBe(1)
    expect(fileSources[0].path).toBe("src/auth.ts")
    expect(fileSources[0].relevance).toBe(0.9)
  })

  it("includes open files when provided", async () => {
    mockAssembleSystemPrompt.mockResolvedValue(MOCK_RESULT)
    mockFsExistsSync.mockReturnValue(true)
    mockFsReadFile.mockResolvedValue("// main.ts content\n")

    const pack = await builder.build({
      role: "coder",
      userMessage: "test",
      openFiles: [
        { path: "src/main.ts", name: "main.ts", isDirty: false, language: "typescript" },
      ],
    })

    const openSources = pack.sources.filter((s) => s.type === "open_file")
    expect(openSources.length).toBe(1)
    expect(openSources[0].path).toBe("src/main.ts")
  })

  it("assigns relevance scores to different source types", async () => {
    mockAssembleSystemPrompt.mockResolvedValue(MOCK_RESULT)
    mockFsExistsSync.mockReturnValue(true)
    mockFsReadFile.mockResolvedValue("// file content\n")

    const pack = await builder.build({
      role: "coder",
      userMessage: "test",
      relevantFiles: [
        { path: "src/high.ts", relevance: 0.95, reason: "High relevance" },
        { path: "src/low.ts", relevance: 0.3, reason: "Low relevance" },
      ],
    })

    const explicitFiles = pack.sources.filter((s) => s.type === "explicit_file")
    expect(explicitFiles[0].relevance).toBe(0.95)
    expect(explicitFiles[1].relevance).toBe(0.3)
  })

  it("each source has a tokenCount", async () => {
    mockAssembleSystemPrompt.mockResolvedValue(MOCK_RESULT)
    mockFsExistsSync.mockReturnValue(true)
    mockFsReadFile.mockResolvedValue("// auth.ts content\n")

    const pack = await builder.build({
      role: "coder",
      userMessage: "test",
      relevantFiles: [
        { path: "src/auth.ts", relevance: 0.8, reason: "Important" },
      ],
    })

    for (const source of pack.sources) {
      expect(source.tokenCount).toBeGreaterThanOrEqual(0)
    }
  })

  it("handles empty relevantFiles gracefully", async () => {
    mockAssembleSystemPrompt.mockResolvedValue(MOCK_RESULT)

    const pack = await builder.build({
      role: "coder",
      userMessage: "test",
      relevantFiles: [],
    })

    const fileSources = pack.sources.filter((s) => s.type === "explicit_file")
    expect(fileSources.length).toBe(0)
  })

  it("handles null context manager result", async () => {
    mockAssembleSystemPrompt.mockResolvedValue(null)

    const pack = await builder.build({
      role: "coder",
      userMessage: "test",
    })

    expect(pack.sources.length).toBe(0)
    expect(pack.totalTokens).toBe(0)
  })
})
