import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"

// Mock localStorage for vitest's node environment
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
})()

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true, configurable: true })

// Store mocks with full type shapes
const mockLoadEntries = vi.fn()
const mockLedgerState = {
  entries: [] as any[],
  addEntry: vi.fn(),
  addAction: vi.fn(),
  clearEntries: vi.fn(),
  loadEntries: mockLoadEntries,
}

const mockWorkspaceState = {
  rootPath: null as string | null,
  fileTree: [] as any[],
  openFiles: [] as any[],
  activeFilePath: null as string | null,
  changedFiles: new Set<string>(),
  isLoading: false,
  aiContextFiles: [] as any[],
  suggestedFiles: [] as string[],
  recentlyModified: [] as string[],
  runtimeConfig: { sandboxEnabled: true, workspacePath: "", executionTimeout: 60000, maxConcurrency: 3, autoApprovePatterns: [], blockPatterns: [] },
  workspaceLoaded: false,
  setRootPath: vi.fn(),
  setFileTree: vi.fn(),
  setLoading: vi.fn(),
  openFile: vi.fn(),
  closeFile: vi.fn(),
  setActiveFile: vi.fn(),
  updateFileContent: vi.fn(),
  markFileDirty: vi.fn(),
  handleFileChange: vi.fn(),
  clearChangedFiles: vi.fn(),
  addAiContextFile: vi.fn(),
  removeAiContextFile: vi.fn(),
  clearAiContext: vi.fn(),
  setSuggestedFiles: vi.fn(),
  setRecentlyModified: vi.fn(),
  loadWorkspaceConfig: vi.fn(),
  updateWorkspaceRuntimeConfig: vi.fn(),
}

vi.mock("@/stores/ledger-store", () => ({
  useLedgerStore: {
    getState: vi.fn(() => ({ ...mockLedgerState })),
    subscribe: vi.fn(() => vi.fn()),
  },
}))

vi.mock("@/stores/workspace-store", () => ({
  useWorkspaceStore: {
    getState: vi.fn(() => ({ ...mockWorkspaceState })),
  },
}))

describe("ledger", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockLedgerState.entries = []
    mockWorkspaceState.rootPath = null
  })

  afterEach(() => {
    localStorage.clear()
  })

  it("persists and loads from localStorage when no workspace is open", async () => {
    const { persistLedger, loadLedger } = await import("./ledger")

    const mockEntries = [
      { timestamp: "2025-01-01T00:00:00Z", agentId: "coder", action: "edit", file: "test.ts", status: "success" as const, summary: "Edited test.ts" },
    ]

    mockLedgerState.entries = mockEntries

    await persistLedger()

    // Should have saved to localStorage
    const raw = localStorage.getItem("ledger.json")
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].agentId).toBe("coder")

    // Load back
    mockLedgerState.entries = []
    localStorage.setItem("ledger.json", JSON.stringify(mockEntries))
    await loadLedger()

    expect(mockLoadEntries).toHaveBeenCalledWith(mockEntries)
  })

  it("falls back to localStorage when Tauri IPC fails", async () => {
    const { persistLedger } = await import("./ledger")

    const mockEntries = [
      { timestamp: "2025-01-01T00:00:00Z", agentId: "design", action: "create", file: "ui.tsx", status: "success" as const, summary: "Created ui.tsx" },
    ]

    mockLedgerState.entries = mockEntries

    await persistLedger()

    // Should fall back to localStorage (not crash)
    const raw = localStorage.getItem("ledger.json")
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed[0].agentId).toBe("design")
  })

  it("handles empty entries gracefully", async () => {
    const { persistLedger, loadLedger } = await import("./ledger")

    mockLedgerState.entries = []

    await persistLedger()

    const raw = localStorage.getItem("ledger.json")
    expect(raw).toBe("[]")

    // Loading empty array should still call loadEntries (resets store to empty)
    await loadLedger()
    expect(mockLoadEntries).toHaveBeenCalled()
    expect(mockLoadEntries).toHaveBeenCalledWith([])
  })

  it("uses workspace path when a workspace is open", async () => {
    mockWorkspaceState.rootPath = "/home/user/project"

    const { persistLedger } = await import("./ledger")

    const mockEntries = [
      { timestamp: "2025-01-01T00:00:00Z", agentId: "coder", action: "refactor", file: "main.ts", status: "success" as const, summary: "Refactored main.ts" },
    ]

    mockLedgerState.entries = mockEntries

    // Should not throw when Tauri IPC is unavailable (falls back to localStorage)
    await expect(persistLedger()).resolves.toBeUndefined()

    // Should have written to localStorage since Tauri not available
    const raw = localStorage.getItem("ledger.json")
    expect(raw).toBeTruthy()
  })
})
