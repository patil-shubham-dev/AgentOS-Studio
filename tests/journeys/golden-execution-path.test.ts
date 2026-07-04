import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

const memfs = new Map<string, string>()
function memfsGet(path: string): string | undefined {
  return memfs.get(path.replace(/\\/g, "/"))
}
function memfsSet(path: string, content: string): void {
  memfs.set(path.replace(/\\/g, "/"), content)
}

vi.mock("@/lib/electron-api", () => ({
  readTextFile: vi.fn(async (path: string) => {
    const p = path.replace(/\\/g, "/")
    return memfs.get(p) ?? null
  }),
  writeTextFile: vi.fn(async (path: string, content: string) => {
    memfs.set(path.replace(/\\/g, "/"), content)
  }),
  exists: vi.fn(async (path: string) => memfs.has(path.replace(/\\/g, "/"))),
  mkdir: vi.fn(async () => {}),
}))

vi.mock("@/lib/file-history", () => ({
  FileHistoryManager: {
    getInstance: vi.fn(() => ({
      createSnapshot: vi.fn().mockResolvedValue({ version: 1, timestamp: Date.now(), backupPath: "/tmp/backup", originalPath: "", size: 0, messageId: "test" }),
    })),
  },
}))

describe("Golden E2E Execution Path", () => {
  const WORKSPACE_ROOT = "/test/golden-workspace"
  const FILE_PATH = "src/test-file.ts"
  const FULL_PATH = `${WORKSPACE_ROOT}/${FILE_PATH}`
  const ORIGINAL_CONTENT = 'const x = 1;\nconsole.log(x);\n'
  const PROPOSED_CONTENT = 'const x = 2;\nconsole.log(x * 2);\n'

  beforeEach(async () => {
    memfs.clear()
    memfsSet(FULL_PATH, ORIGINAL_CONTENT)
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({ rootPath: WORKSPACE_ROOT, openFiles: [] })
    const { useAppStore } = await import("@/stores/app-store")
    useAppStore.setState({ providers: [], mockMode: true })
    const { useChangeSetStore } = await import("@/runtime/changeset/ChangeSetStore")
    for (const id of Array.from(useChangeSetStore.getState().changeSets.keys())) {
      useChangeSetStore.getState().removeChangeSet(id)
    }
  })

  afterEach(() => {
    memfs.clear()
  })

  it("EP-1: WriteFileTool proposes without modifying disk", async () => {
    expect(memfsGet(FULL_PATH)).toBe(ORIGINAL_CONTENT)
    const { WriteFileTool } = await import("@/runtime/tools/implementations/WriteFileTool")
    const result = await WriteFileTool.execute(
      { traceId: "ep-1", role: "coder" } as any,
      { path: FILE_PATH, content: PROPOSED_CONTENT },
    )
    expect(result.error).toBeFalsy()
    expect(memfsGet(FULL_PATH)).toBe(ORIGINAL_CONTENT)
  })

  it("EP-2: ReadFileTool reads proposed content from cache (coherent propose-first)", async () => {
    const { WriteFileTool } = await import("@/runtime/tools/implementations/WriteFileTool")
    const { ReadFileTool } = await import("@/runtime/tools/implementations/ReadFileTool")
    await WriteFileTool.execute(
      { traceId: "ep-2", role: "coder" } as any,
      { path: FILE_PATH, content: PROPOSED_CONTENT },
    )
    const result = await ReadFileTool.execute(
      { traceId: "ep-2", role: "coder" } as any,
      { path: FILE_PATH },
    )
    expect(result.error).toBeFalsy()
    expect(result.data).toContain("const x = 2")
  })

  it("EP-3: ChangeSet propose → submit → accept → writeAcceptedChanges applies file to disk", async () => {
    const { WriteFileTool } = await import("@/runtime/tools/implementations/WriteFileTool")
    const { ChangeSetManager } = await import("@/runtime/changeset/ChangeSetManager")
    const { useChangeSetStore } = await import("@/runtime/changeset/ChangeSetStore")
    await WriteFileTool.execute(
      { traceId: "ep-3", role: "coder" } as any,
      { path: FILE_PATH, content: PROPOSED_CONTENT },
    )
    const store = useChangeSetStore.getState()
    const csEntry = Array.from(store.changeSets.entries()).find(([, cs]) => (cs as any).title?.includes?.(FILE_PATH))
    expect(csEntry).toBeDefined()
    const [csId, cs] = csEntry!
    const fileId = cs.files[0]?.id
    expect(fileId).toBeDefined()

    ChangeSetManager.getInstance().proposeChangeSet(csId)
    ChangeSetManager.getInstance().submitForReview(csId)
    ChangeSetManager.getInstance().acceptFile(csId, fileId)
    ChangeSetManager.getInstance().acceptChangeSet(csId)

    expect(memfsGet(FULL_PATH)).toBe(ORIGINAL_CONTENT)
    const writeResult = await ChangeSetManager.getInstance().writeAcceptedChanges(csId, WORKSPACE_ROOT)
    expect(writeResult.failed).toHaveLength(0)
    expect(writeResult.written).toContain(FILE_PATH)
    expect(memfsGet(FULL_PATH)).toBe(PROPOSED_CONTENT)
  })

  it("EP-4: Rejected ChangeSet leaves disk untouched", async () => {
    const { WriteFileTool } = await import("@/runtime/tools/implementations/WriteFileTool")
    const { ChangeSetManager } = await import("@/runtime/changeset/ChangeSetManager")
    const { useChangeSetStore } = await import("@/runtime/changeset/ChangeSetStore")
    await WriteFileTool.execute(
      { traceId: "ep-4", role: "coder" } as any,
      { path: FILE_PATH, content: PROPOSED_CONTENT },
    )
    const store = useChangeSetStore.getState()
    const csEntry = Array.from(store.changeSets.entries()).find(([, cs]) => (cs as any).title?.includes?.(FILE_PATH))
    expect(csEntry).toBeDefined()
    const [csId, cs] = csEntry!
    const fileId = cs.files[0]?.id
    expect(fileId).toBeDefined()

    ChangeSetManager.getInstance().proposeChangeSet(csId)
    ChangeSetManager.getInstance().submitForReview(csId)
    ChangeSetManager.getInstance().rejectFile(csId, fileId)
    ChangeSetManager.getInstance().rejectChangeSet(csId)

    expect(memfsGet(FULL_PATH)).toBe(ORIGINAL_CONTENT)
    const writeResult = await ChangeSetManager.getInstance().writeAcceptedChanges(csId, WORKSPACE_ROOT)
    expect(writeResult.written).toHaveLength(0)
    expect(memfsGet(FULL_PATH)).toBe(ORIGINAL_CONTENT)
  })

  it("EP-6: ProviderGateway returns structured error for missing provider", async () => {
    const { ProviderGateway } = await import("@/runtime/providers/ProviderGateway")
    const { useAppStore } = await import("@/stores/app-store")
    useAppStore.setState({ providers: [], mockMode: false })

    const gateway = ProviderGateway.getInstance()
    const result = await gateway.chat({
      messages: [{ role: "user", content: "hello" }],
    })

    expect(result.error).toBeDefined()
    expect(result.error!.code).toBe("not_configured")
    expect(result.error!.userMessage).toContain("No provider configured")
    expect(result.error!.retryable).toBe(false)
  })

  it("EP-7: Cancellation stops ProviderGateway streaming cleanly with error event", async () => {
    const { ProviderGateway } = await import("@/runtime/providers/ProviderGateway")
    const { useAppStore } = await import("@/stores/app-store")
    useAppStore.setState({ providers: [], mockMode: false })

    const controller = new AbortController()
    controller.abort()

    const gateway = ProviderGateway.getInstance()
    const events: any[] = []

    try {
      for await (const event of gateway.stream({
        messages: [{ role: "user", content: "hello" }],
        signal: controller.signal,
      })) {
        events.push(event)
      }
    } catch {
      // stream may throw on abort
    }

    expect(events.length).toBeGreaterThanOrEqual(1)
    const errorEvent = events.find((e: any) => e?.type === "error")
    expect(errorEvent).toBeDefined()
    expect(errorEvent.code).toBe("cancelled")
  })

  it("EP-5: Conflict detection fires when disk content differs from beforeContent", async () => {
    const { WriteFileTool } = await import("@/runtime/tools/implementations/WriteFileTool")
    const { ChangeSetManager } = await import("@/runtime/changeset/ChangeSetManager")
    const { useChangeSetStore } = await import("@/runtime/changeset/ChangeSetStore")
    await WriteFileTool.execute(
      { traceId: "ep-5", role: "coder" } as any,
      { path: FILE_PATH, content: PROPOSED_CONTENT },
    )
    const store = useChangeSetStore.getState()
    const csEntry = Array.from(store.changeSets.entries()).find(([, cs]) => (cs as any).title?.includes?.(FILE_PATH))
    expect(csEntry).toBeDefined()
    const [csId] = csEntry!

    ChangeSetManager.getInstance().proposeChangeSet(csId)
    ChangeSetManager.getInstance().submitForReview(csId)

    memfsSet(FULL_PATH, "// SOMEONE ELSE EDITED THIS FILE\n")
    const conflicts = await ChangeSetManager.getInstance().detectConflicts(csId, WORKSPACE_ROOT)
    expect(conflicts.length).toBeGreaterThanOrEqual(1)
    const fileConflict = conflicts.find(c => c.file === FILE_PATH)
    expect(fileConflict).toBeDefined()
    expect(fileConflict!.hasConflict).toBe(true)
  })
})
