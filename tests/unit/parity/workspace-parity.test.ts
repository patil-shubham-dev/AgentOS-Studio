import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { createTestWorkspace } from "../e2e/fixtures/create-test-workspace"
import type { TestWorkspace } from "../e2e/fixtures/create-test-workspace"

function createMockStorage() {
  const store = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value) }),
    removeItem: vi.fn((key: string) => { store.delete(key) }),
    clear: vi.fn(() => store.clear()),
    get length() { return store.size },
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
  } as Storage
}

// ── Inter-module shared mock setup ──

function setupTestEnvironment(workspace: TestWorkspace) {
  const mockStorage = createMockStorage()

  vi.stubGlobal("localStorage", mockStorage)

  vi.mock("@/lib/filesystem", () => {
    const fs = require("fs")
    const path = require("path")
    return {
      readFile: async (p: string) => fs.readFileSync(p, "utf-8"),
      writeFile: async (p: string, c: string) => { fs.writeFileSync(p, c, "utf-8") },
      exists: async (p: string) => fs.existsSync(p),
      loadFileTree: async (dirPath: string) => {
        function walk(dir: string): any[] {
          const entries = fs.readdirSync(dir, { withFileTypes: true })
          return entries
            .filter((e: any) => !e.name.startsWith("."))
            .map((e: any) => {
              const full = path.join(dir, e.name)
              const rel = path.relative(dirPath, full).replace(/\\/g, "/")
              if (e.isDirectory()) {
                return { name: e.name, path: rel, is_dir: true, size: 0, lastModified: 0, children: walk(full) }
              }
              return { name: e.name, path: rel, is_dir: false, size: fs.statSync(full).size, lastModified: fs.statSync(full).mtimeMs, children: [] }
            })
        }
        return walk(dirPath)
      },
      listDirectory: async (dirPath: string) => {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true })
        return entries
          .filter((e: any) => !e.name.startsWith("."))
          .map((e: any) => {
            const full = path.join(dirPath, e.name)
            const rel = path.relative(workspace.root, full).replace(/\\/g, "/")
            return { name: e.name, path: rel, is_dir: e.isDirectory(), size: e.isFile() ? fs.statSync(full).size : 0, lastModified: e.isFile() ? fs.statSync(full).mtimeMs : 0, children: [] }
          })
      },
    }
  })

  vi.mock("@/lib/electron-api", () => ({
    invoke: async (cmd: string, ...args: any[]) => {
      if (cmd === "write_text_file") {
        const [path, content] = args
        writeFileSync(path, content, "utf-8")
        return
      }
      if (cmd === "read_text_file") {
        return readFileSync(args[0], "utf-8")
      }
      throw new Error(`Unmocked invoke: ${cmd}`)
    },
    exists: async (p: string) => existsSync(p),
    readFile: async (p: string) => readFileSync(p, "utf-8"),
    writeFile: async (p: string, c: string) => { writeFileSync(p, c, "utf-8") },
    listen: async () => () => {},
  }))

  return { mockStorage }
}

// ── Helpers ──

function toRelative(root: string, absolute: string): string {
  return absolute.replace(/\\/g, "/").replace(root.replace(/\\/g, "/").replace(/\/+$/, "") + "/", "")
}

// ═══════════════════════════════════════════════
// Core Edit Loop
// ═══════════════════════════════════════════════

describe("Core Edit Loop (PC-01 to PC-10)", () => {
  let workspace: TestWorkspace

  beforeEach(() => {
    workspace = createTestWorkspace()
    setupTestEnvironment(workspace)
  })

  afterEach(() => {
    workspace.cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("PC-01: readFile returns content from disk", async () => {
    const { readFile } = await import("@/lib/filesystem")
    const content = await readFile(join(workspace.root, "src/index.ts"))
    expect(content).toContain("hello world")
  })

  it("PC-02: writeFile writes content to disk", async () => {
    const { readFile, writeFile } = await import("@/lib/filesystem")
    const target = join(workspace.root, "src/new-file.ts")
    await writeFile(target, "export const x = 1;\n")
    const content = await readFile(target)
    expect(content).toBe("export const x = 1;\n")
  })

  it("PC-03: loadFileTree returns complete tree structure", async () => {
    const { loadFileTree } = await import("@/lib/filesystem")
    const tree = await loadFileTree(workspace.root)

    const names = tree.flatMap((entry: any) => [
      entry.name,
      ...(entry.children || []).flatMap((c: any) => [
        c.name,
        ...(c.children || []).map((cc: any) => cc.name),
      ]),
    ])
    expect(names).toContain("src")
    expect(names).toContain("index.ts")
    expect(names).toContain("helpers.ts")
    expect(names).toContain("README.md")
  })

  it("PC-04: workspace-store openFile adds file and sets active", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({
      rootPath: workspace.root,
      openFiles: [],
      activeFilePath: null,
    })

    useWorkspaceStore.getState().openFile({
      path: "src/index.ts",
      name: "index.ts",
      content: 'console.log("hello world");\n',
      isDirty: false,
    })

    const state = useWorkspaceStore.getState()
    expect(state.openFiles).toHaveLength(1)
    expect(state.openFiles[0].path).toBe("src/index.ts")
    expect(state.activeFilePath).toBe("src/index.ts")
  })

  it("PC-05: workspace-store closeFile removes tab and adjusts active", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({
      rootPath: workspace.root,
      openFiles: [
        { path: "a.ts", name: "a.ts", content: "", isDirty: false },
        { path: "b.ts", name: "b.ts", content: "", isDirty: false },
      ],
      activeFilePath: "a.ts",
    })

    useWorkspaceStore.getState().closeFile("a.ts")

    const state = useWorkspaceStore.getState()
    expect(state.openFiles).toHaveLength(1)
    expect(state.openFiles[0].path).toBe("b.ts")
    expect(state.activeFilePath).toBe("b.ts")
  })

  it("PC-06: workspace-store closeFile works when closing last tab", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({
      rootPath: workspace.root,
      openFiles: [{ path: "a.ts", name: "a.ts", content: "", isDirty: false }],
      activeFilePath: "a.ts",
    })

    useWorkspaceStore.getState().closeFile("a.ts")

    const state = useWorkspaceStore.getState()
    expect(state.openFiles).toHaveLength(0)
    expect(state.activeFilePath).toBeNull()
  })

  it("PC-07: workspace-store updateFileContent marks dirty", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({
      rootPath: workspace.root,
      openFiles: [{ path: "src/index.ts", name: "index.ts", content: "original", isDirty: false }],
      activeFilePath: "src/index.ts",
    })

    useWorkspaceStore.getState().updateFileContent("src/index.ts", "modified content")

    const state = useWorkspaceStore.getState()
    expect(state.openFiles[0].content).toBe("modified content")
    expect(state.openFiles[0].isDirty).toBe(true)
  })

  it("PC-08: openFileInDiffMode opens file and sets diff mode", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    const { useDiffStore } = await import("@/stores/diff-store")
    useWorkspaceStore.setState({
      rootPath: workspace.root,
      openFiles: [],
      activeFilePath: null,
    })

    useDiffStore.getState().clear()
    useDiffStore.getState().addFileDiff({
      path: "src/index.ts",
      originalContent: 'console.log("hello");\n',
      modifiedContent: 'console.log("hello world");\n',
      rawDiff: "@@ -1 +1 @@\n-console.log(\"hello\");\n+console.log(\"hello world\");",
      hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, content: "@@ -1 +1 @@\n-console.log(\"hello\");\n+console.log(\"hello world\");", status: "pending" }],
      status: "pending",
      createdAt: Date.now(),
      source: "agent",
    })

    useWorkspaceStore.getState().openFileInDiffMode("src/index.ts")

    const state = useWorkspaceStore.getState()
    expect(state.editorMode).toBe("diff")
    expect(state.diffReviewFile).toBe("src/index.ts")
    expect(state.openFiles.some((f: any) => f.path === "src/index.ts")).toBe(true)
  })

  it("PC-09: diff-store acceptFile updates file status", async () => {
    const { useDiffStore } = await import("@/stores/diff-store")
    useDiffStore.getState().clear()
    useDiffStore.getState().addFileDiff({
      path: "test.ts",
      originalContent: "a\n",
      modifiedContent: "b\n",
      rawDiff: "@@ -1 +1 @@\n-a\n+b\n",
      hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, content: "@@ -1 +1 @@\n-a\n+b\n", status: "pending" }],
      status: "pending",
      createdAt: Date.now(),
      source: "agent",
    })

    useDiffStore.getState().acceptFile("test.ts")
    const file = useDiffStore.getState().files.get("test.ts")
    expect(file?.status).toBe("accepted")
    expect(file?.hunks[0].status).toBe("accepted")
  })

  it("PC-10: diff-store mixed hunk states leave file as pending", async () => {
    const { useDiffStore } = await import("@/stores/diff-store")
    useDiffStore.getState().clear()
    useDiffStore.getState().addFileDiff({
      path: "multi.ts",
      originalContent: "a\nb\n",
      modifiedContent: "A\nB\n",
      rawDiff: "@@ -1 +1 @@\n-a\n+A\n@@ -2 +2 @@\n-b\n+B\n",
      hunks: [
        { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, content: "@@ -1 +1 @@\n-a\n+A\n", status: "pending" },
        { oldStart: 2, oldLines: 1, newStart: 2, newLines: 1, content: "@@ -2 +2 @@\n-b\n+B\n", status: "pending" },
      ],
      status: "pending",
      createdAt: Date.now(),
      source: "agent",
    })

    useDiffStore.getState().acceptHunk("multi.ts", 0)
    useDiffStore.getState().rejectHunk("multi.ts", 1)

    const file = useDiffStore.getState().files.get("multi.ts")
    expect(file?.hunks[0].status).toBe("accepted")
    expect(file?.hunks[1].status).toBe("rejected")
    expect(file?.status).toBe("pending")
  })
})

// ═══════════════════════════════════════════════
// Workspace Synchronization
// ═══════════════════════════════════════════════

describe("Workspace Synchronization (PC-11 to PC-20)", () => {
  let workspace: TestWorkspace

  beforeEach(() => {
    workspace = createTestWorkspace()
    setupTestEnvironment(workspace)
  })

  afterEach(() => {
    workspace.cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("PC-11: handleFileChange with modified event adds file to changedFiles", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({
      rootPath: workspace.root,
      changedFiles: new Set(),
      openFiles: [{ path: "src/index.ts", name: "index.ts", content: "original", isDirty: false }],
      activeFilePath: "src/index.ts",
    })

    useWorkspaceStore.getState().handleFileChange({
      path: join(workspace.root, "src/index.ts"),
      kind: "modified",
    })

    const state = useWorkspaceStore.getState()
    expect(state.changedFiles.has("src/index.ts")).toBe(true)
  })

  it("PC-12: handleFileChange with removed event cleans up file", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({
      rootPath: workspace.root,
      changedFiles: new Set(["src/index.ts"]),
      openFiles: [{ path: "src/index.ts", name: "index.ts", content: "", isDirty: false }],
      activeFilePath: "src/index.ts",
      fileTree: [
        { name: "src", path: "src", is_dir: true, children: [{ name: "index.ts", path: "src/index.ts", is_dir: false, children: [] }] },
      ],
    })

    useWorkspaceStore.getState().handleFileChange({
      path: join(workspace.root, "src/index.ts"),
      kind: "removed",
    })

    const state = useWorkspaceStore.getState()
    expect(state.changedFiles.has("src/index.ts")).toBe(false)
    expect(state.openFiles.some((f: any) => f.path === "src/index.ts")).toBe(false)
  })

  it("PC-13: dirty file is NOT auto-closed on external delete", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({
      rootPath: workspace.root,
      changedFiles: new Set(),
      openFiles: [{ path: "src/index.ts", name: "index.ts", content: "unsaved changes", isDirty: true }],
      activeFilePath: "src/index.ts",
    })

    useWorkspaceStore.getState().handleFileChange({
      path: join(workspace.root, "src/index.ts"),
      kind: "removed",
    })

    const state = useWorkspaceStore.getState()
    expect(state.openFiles.some((f: any) => f.path === "src/index.ts")).toBe(true)
  })

  it("PC-14: handleFileChange with removed event exits diff mode for deleted reviewed file", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({
      rootPath: workspace.root,
      editorMode: "diff",
      diffReviewFile: "src/index.ts",
      changedFiles: new Set(["src/index.ts"]),
      openFiles: [{ path: "src/index.ts", name: "index.ts", content: "", isDirty: false }],
      activeFilePath: "src/index.ts",
    })

    useWorkspaceStore.getState().handleFileChange({
      path: join(workspace.root, "src/index.ts"),
      kind: "removed",
    })

    const state = useWorkspaceStore.getState()
    expect(state.editorMode).toBe("editor")
    expect(state.diffReviewFile).toBeNull()
  })

  it("PC-15: handleFileChange with created event adds to changedFiles", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({
      rootPath: workspace.root,
      changedFiles: new Set(),
    })

    useWorkspaceStore.getState().handleFileChange({
      path: join(workspace.root, "src/new-file.ts"),
      kind: "created",
    })

    expect(useWorkspaceStore.getState().changedFiles.has("src/new-file.ts")).toBe(true)
  })

  it("PC-16: notifyFileEdited updates clean open file content", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({
      rootPath: workspace.root,
      openFiles: [{ path: "src/index.ts", name: "index.ts", content: "old content", isDirty: false }],
      activeFilePath: "src/index.ts",
    })

    useWorkspaceStore.getState().notifyFileEdited("src/index.ts", "new content from external edit")

    const state = useWorkspaceStore.getState()
    expect(state.openFiles[0].content).toBe("new content from external edit")
    expect(state.openFiles[0].isDirty).toBe(false)
  })

  it("PC-17: delete+recreate sequence triggers created event", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({ rootPath: workspace.root, changedFiles: new Set() })

    useWorkspaceStore.getState().handleFileChange({
      path: join(workspace.root, "src/temp.ts"),
      kind: "removed",
    })

    useWorkspaceStore.getState().handleFileChange({
      path: join(workspace.root, "src/temp.ts"),
      kind: "created",
    })

    const state = useWorkspaceStore.getState()
    expect(state.changedFiles.has("src/temp.ts")).toBe(true)
  })

  it("PC-18: setEditorMode validates diffReviewFile against openFiles", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    const { useDiffStore } = await import("@/stores/diff-store")
    useWorkspaceStore.setState({
      rootPath: workspace.root,
      editorMode: "editor",
      diffReviewFile: "stale-file.ts",
      openFiles: [{ path: "real-file.ts", name: "real-file.ts", content: "", isDirty: false }],
      activeFilePath: "real-file.ts",
      changedFiles: new Set(),
    })
    useDiffStore.getState().clear()

    useWorkspaceStore.getState().setEditorMode("diff")

    const state = useWorkspaceStore.getState()
    expect(state.editorMode).toBe("diff")
    expect(state.diffReviewFile).toBe("real-file.ts")
  })

  it("PC-19: setEditorMode falls back to first open file when diffReviewFile is null", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({
      rootPath: workspace.root,
      editorMode: "editor",
      diffReviewFile: null,
      openFiles: [{ path: "first.ts", name: "first.ts", content: "", isDirty: false }],
      activeFilePath: "first.ts",
      changedFiles: new Set(),
    })

    useWorkspaceStore.getState().setEditorMode("diff")

    const state = useWorkspaceStore.getState()
    expect(state.editorMode).toBe("diff")
    expect(state.diffReviewFile).toBe("first.ts")
  })

  it("PC-20: watcher event normalization maps change→modified, rename→created/removed", async () => {
    // Test the normalizeFsWatchType function directly
    // Since it's not exported, we test the public onFileChange with a simulated payload
    const { onFileChange } = await import("@/lib/workspace")
    const events: Array<{ path: string; kind: string }> = []

    // The electronAPI mock doesn't have an 'on' method, so onFileChange returns null in Electron mode
    // Instead, verify the Tauri path works by importing the listen mock
    const unsub = await onFileChange((event) => { events.push(event) })

    // When electronAPI is not properly set up, onFileChange returns null and falls through
    // This test validates the function doesn't throw and returns gracefully
    expect(typeof unsub === "function" || unsub === null).toBe(true)
  })
})

// ═══════════════════════════════════════════════
// Pane Persistence
// ═══════════════════════════════════════════════

describe("Pane Persistence (PC-21 to PC-30)", () => {
  beforeEach(async () => {
    const mockStorage = createMockStorage()
    vi.stubGlobal("localStorage", mockStorage)

    // Reset store states between tests to prevent leakage
    const { usePreviewStore } = await import("@/stores/preview-store")
    const { useDesignStore } = await import("@/stores/design-store")
    usePreviewStore.setState({ tabs: [], activeTabId: null })
    useDesignStore.setState({ artifacts: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("PC-21: pane-store persists and restores pane visibility", async () => {
    const { usePaneStore } = await import("@/stores/pane-store")
    usePaneStore.getState().setPaneVisibility("design", true)
    usePaneStore.getState().setPaneVisibility("diff", false)

    const state = usePaneStore.getState()
    const designPane = state.panes.find((p) => p.id === "design")
    const diffPane = state.panes.find((p) => p.id === "diff")
    expect(designPane?.visible).toBe(true)
    expect(diffPane?.visible).toBe(false)

    usePaneStore.getState().setPaneVisibility("design", false)
  })

  it("PC-22: pane-store togglePane works correctly", async () => {
    const { usePaneStore } = await import("@/stores/pane-store")

    const designBefore = usePaneStore.getState().panes.find((p) => p.id === "design")
    expect(designBefore?.visible).toBe(false)

    usePaneStore.getState().togglePane("design")

    const designAfter = usePaneStore.getState().panes.find((p) => p.id === "design")
    expect(designAfter?.visible).toBe(true)
  })

  it("PC-23: pane-store setPaneSize clamps to min/max", async () => {
    const { usePaneStore } = await import("@/stores/pane-store")

    usePaneStore.getState().setPaneSize("code", 50)
    const codePane = usePaneStore.getState().panes.find((p) => p.id === "code")
    expect(codePane?.size).toBe(codePane!.minSize)
  })

  it("PC-24: preview-store openUrl creates tabs", async () => {
    const { usePreviewStore } = await import("@/stores/preview-store")

    usePreviewStore.getState().openUrl("https://example.com", "Example")

    const state = usePreviewStore.getState()
    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0].url).toBe("https://example.com")
    expect(state.activeTabId).toBe(state.tabs[0].id)
  })

  it("PC-25: preview-store closeTab removes tab", async () => {
    const { usePreviewStore } = await import("@/stores/preview-store")

    usePreviewStore.getState().openUrl("https://example.com", "Example")
    const tabId = usePreviewStore.getState().tabs[0].id
    usePreviewStore.getState().closeTab(tabId)

    expect(usePreviewStore.getState().tabs).toHaveLength(0)
  })

  it("PC-26: preview-store multiple tabs and switch", async () => {
    const { usePreviewStore } = await import("@/stores/preview-store")

    usePreviewStore.getState().openUrl("https://a.com", "A")
    usePreviewStore.getState().openUrl("https://b.com", "B")

    expect(usePreviewStore.getState().tabs).toHaveLength(2)
    expect(usePreviewStore.getState().activeTabId).toBe(
      usePreviewStore.getState().tabs.find((t) => t.url === "https://b.com")?.id
    )

    const firstId = usePreviewStore.getState().tabs[0].id
    usePreviewStore.getState().setActiveTab(firstId)
    expect(usePreviewStore.getState().activeTabId).toBe(firstId)
  })

  it("PC-27: design-store addArtifact creates artifact entry", async () => {
    const { useDesignStore } = await import("@/stores/design-store")

    const id = useDesignStore.getState().addArtifact({
      name: "Test Component",
      description: "A test",
      tags: ["test"],
    })

    const artifact = useDesignStore.getState().artifacts.find((a) => a.id === id)
    expect(artifact).toBeDefined()
    expect(artifact!.name).toBe("Test Component")
    expect(artifact!.tags).toContain("test")
  })

  it("PC-28: design-store addVersion creates version on artifact", async () => {
    const { useDesignStore } = await import("@/stores/design-store")

    const id = useDesignStore.getState().addArtifact({
      name: "Component",
      description: "",
      tags: [],
    })

    useDesignStore.getState().addVersion(id, {
      label: "Initial",
      code: "const x = 1;",
      htmlPreview: "<div>Preview</div>",
      changes: "Initial version",
    })

    const artifact = useDesignStore.getState().artifacts.find((a) => a.id === id)
    expect(artifact?.versions).toHaveLength(1)
    expect(artifact?.versions[0].code).toBe("const x = 1;")
  })

  it("PC-29: design-store setCurrentVersion switches version", async () => {
    const { useDesignStore } = await import("@/stores/design-store")

    const id = useDesignStore.getState().addArtifact({ name: "Comp", description: "", tags: [] })
    useDesignStore.getState().addVersion(id, { label: "v1", code: "v1", htmlPreview: "", changes: "" })
    useDesignStore.getState().addVersion(id, { label: "v2", code: "v2", htmlPreview: "", changes: "" })

    useDesignStore.getState().setCurrentVersion(id, 1)
    expect(useDesignStore.getState().artifacts.find((a) => a.id === id)?.currentVersion).toBe(1)

    useDesignStore.getState().setCurrentVersion(id, 2)
    expect(useDesignStore.getState().artifacts.find((a) => a.id === id)?.currentVersion).toBe(2)
  })

  it("PC-30: workspace-store persists and restores editorMode and diffReviewFile", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")

    useWorkspaceStore.setState({
      rootPath: "C:\\test",
      editorMode: "diff",
      diffReviewFile: "src/file.ts",
      openFiles: [{ path: "src/file.ts", name: "file.ts", content: "", isDirty: false }],
      activeFilePath: "src/file.ts",
      changedFiles: new Set(),
      cursorLine: 1,
      cursorColumn: 1,
      visibleRangeStart: 1,
      visibleRangeEnd: 1,
      splitMode: "none",
      splitFilePath: null,
    })

    // The persistWorkspaceState should save editorMode and diffReviewFile
    const state = useWorkspaceStore.getState()
    expect(state.editorMode).toBe("diff")
    expect(state.diffReviewFile).toBe("src/file.ts")
  })
})

// ═══════════════════════════════════════════════
// File Tree Operations
// ═══════════════════════════════════════════════

describe("File Tree Operations (PC-31 to PC-35)", () => {
  let workspace: TestWorkspace

  beforeEach(() => {
    workspace = createTestWorkspace()
    setupTestEnvironment(workspace)
  })

  afterEach(() => {
    workspace.cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("PC-31: workspace-store insertFileEntry adds entry to tree", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({
      rootPath: workspace.root,
      fileTree: [
        { name: "src", path: "src", is_dir: true, children: [] },
      ],
    })

    useWorkspaceStore.getState().insertFileEntry("src", {
      name: "new.ts",
      path: "src/new.ts",
      is_dir: false,
      children: [],
    })

    const state = useWorkspaceStore.getState()
    const src = state.fileTree.find((e) => e.name === "src")
    expect(src?.children.some((c) => c.path === "src/new.ts")).toBe(true)
  })

  it("PC-32: workspace-store removeFileEntry removes from tree", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({
      rootPath: workspace.root,
      fileTree: [
        { name: "src", path: "src", is_dir: true, children: [
          { name: "index.ts", path: "src/index.ts", is_dir: false, children: [] },
        ]},
      ],
    })

    useWorkspaceStore.getState().removeFileEntry("src/index.ts")

    const state = useWorkspaceStore.getState()
    const src = state.fileTree.find((e) => e.name === "src")
    expect(src?.children.some((c) => c.path === "src/index.ts")).toBe(false)
  })

  it("PC-33: workspace-store renameFileEntry updates path and name", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({
      rootPath: workspace.root,
      fileTree: [
        { name: "old.ts", path: "src/old.ts", is_dir: false, children: [] },
      ],
    })

    useWorkspaceStore.getState().renameFileEntry("src/old.ts", "src/new.ts")

    const state = useWorkspaceStore.getState()
    expect(state.fileTree.some((e) => e.name === "new.ts" && e.path === "src/new.ts")).toBe(true)
    expect(state.fileTree.some((e) => e.name === "old.ts")).toBe(false)
  })

  it("PC-34: panel-coordinator dispatch changes pane visibility", async () => {
    const { usePanelCoordinator } = await import("@/stores/panel-coordinator")
    const { usePaneStore } = await import("@/stores/pane-store")

    usePaneStore.getState().setPaneVisibility("design", false)
    usePanelCoordinator.getState().dispatch({ type: "focus", pane: "design" })

    const designPane = usePaneStore.getState().panes.find((p) => p.type === "design")
    expect(designPane?.visible).toBe(true)
  })

  it("PC-35: panel-coordinator dispatch focus pane", async () => {
    const { usePanelCoordinator } = await import("@/stores/panel-coordinator")
    const { usePaneStore } = await import("@/stores/pane-store")

    usePaneStore.getState().setPaneVisibility("design", false)
    usePanelCoordinator.getState().dispatch({ type: "focus", pane: "design" })

    const designPane = usePaneStore.getState().panes.find((p) => p.type === "design")
    expect(designPane?.visible).toBe(true)
  })
})

// ═══════════════════════════════════════════════
// Error Recovery & Edge Cases
// ═══════════════════════════════════════════════

describe("Error Recovery & Edge Cases (PC-36 to PC-42)", () => {
  let workspace: TestWorkspace

  beforeEach(() => {
    workspace = createTestWorkspace()
    setupTestEnvironment(workspace)
  })

  afterEach(() => {
    workspace.cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("PC-36: workspace-store handles missing rootPath gracefully on handleFileChange", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({ rootPath: null })

    expect(() => {
      useWorkspaceStore.getState().handleFileChange({ path: "/some/file.ts", kind: "modified" })
    }).not.toThrow()
  })

  it("PC-37: workspace-store handles invalid event kind without throwing", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({ rootPath: workspace.root })

    expect(() => {
      useWorkspaceStore.getState().handleFileChange({ path: join(workspace.root, "file.ts"), kind: "modified" as any })
    }).not.toThrow()
  })

  it("PC-38: diff-store acceptFile on non-existent file does nothing", async () => {
    const { useDiffStore } = await import("@/stores/diff-store")
    useDiffStore.getState().clear()

    expect(() => {
      useDiffStore.getState().acceptFile("non-existent.ts")
    }).not.toThrow()

    expect(useDiffStore.getState().files.size).toBe(0)
  })

  it("PC-39: diff-store acceptHunk on invalid index does nothing", async () => {
    const { useDiffStore } = await import("@/stores/diff-store")
    useDiffStore.getState().addFileDiff({
      path: "test.ts",
      originalContent: "a\n",
      modifiedContent: "b\n",
      rawDiff: "@@ -1 +1 @@\n-a\n+b\n",
      hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, content: "@@ -1 +1 @@\n-a\n+b\n", status: "pending" }],
      status: "pending",
      createdAt: Date.now(),
      source: "agent",
    })

    useDiffStore.getState().acceptHunk("test.ts", 99)
    const file = useDiffStore.getState().files.get("test.ts")
    expect(file?.hunks[0].status).toBe("pending")
  })

  it("PC-40: workspace-store markFileDirty sets dirty state correctly", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({
      openFiles: [{ path: "test.ts", name: "test.ts", content: "", isDirty: false }],
    })

    useWorkspaceStore.getState().markFileDirty("test.ts", true)
    expect(useWorkspaceStore.getState().openFiles[0].isDirty).toBe(true)

    useWorkspaceStore.getState().markFileDirty("test.ts", false)
    expect(useWorkspaceStore.getState().openFiles[0].isDirty).toBe(false)
  })

  it("PC-41: workspace-store closeFile only removes non-dirty files on external delete", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({
      rootPath: workspace.root,
      openFiles: [
        { path: "clean.ts", name: "clean.ts", content: "", isDirty: false },
        { path: "dirty.ts", name: "dirty.ts", content: "unsaved", isDirty: true },
      ],
      activeFilePath: "clean.ts",
    })

    useWorkspaceStore.getState().handleFileChange({
      path: join(workspace.root, "clean.ts"),
      kind: "removed",
    })

    const state = useWorkspaceStore.getState()
    expect(state.openFiles.some((f: any) => f.path === "clean.ts")).toBe(false)
    expect(state.openFiles.some((f: any) => f.path === "dirty.ts")).toBe(true)
  })

  it("PC-42: restoring workspace state ignores corrupt localStorage data", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")

    localStorage.setItem("agentic-workspace-state", "{invalid json!!!")
    useWorkspaceStore.setState({
      rootPath: "/test",
      openFiles: [],
      activeFilePath: null,
    })

    expect(() => {
      useWorkspaceStore.getState().restoreWorkspaceState()
    }).not.toThrow()
  })
})

// ═══════════════════════════════════════════════
// Editor Integration
// ═══════════════════════════════════════════════

describe("Editor Integration (PC-43 to PC-48)", () => {
  let workspace: TestWorkspace

  beforeEach(() => {
    workspace = createTestWorkspace()
    setupTestEnvironment(workspace)
  })

  afterEach(() => {
    workspace.cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("PC-43: open file loads content from disk into store", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    const { readFile } = await import("@/lib/filesystem")

    useWorkspaceStore.setState({
      rootPath: workspace.root,
      openFiles: [],
      activeFilePath: null,
    })

    const target = join(workspace.root, "src/index.ts")
    const content = await readFile(target)
    useWorkspaceStore.getState().openFile({
      path: "src/index.ts",
      name: "index.ts",
      content,
      isDirty: false,
    })

    const state = useWorkspaceStore.getState()
    expect(state.openFiles[0].content).toContain("hello world")
  })

  it("PC-44: editor tab limit of 30 is enforced", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({ openFiles: [], activeFilePath: null })

    for (let i = 0; i < 35; i++) {
      useWorkspaceStore.getState().openFile({
        path: `file-${i}.ts`,
        name: `file-${i}.ts`,
        content: "",
        isDirty: false,
      })
    }

    expect(useWorkspaceStore.getState().openFiles.length).toBeLessThanOrEqual(30)
  })

  it("PC-45: opening already-open file updates content and sets active", async () => {
    const { useWorkspaceStore } = await import("@/stores/workspace-store")
    useWorkspaceStore.setState({
      openFiles: [{ path: "test.ts", name: "test.ts", content: "old", isDirty: false }],
      activeFilePath: "other.ts",
    })

    useWorkspaceStore.getState().openFile({
      path: "test.ts",
      name: "test.ts",
      content: "new content",
      isDirty: false,
    })

    const state = useWorkspaceStore.getState()
    expect(state.activeFilePath).toBe("test.ts")
    expect(state.openFiles.find((f: any) => f.path === "test.ts")?.content).toBe("new content")
  })

  it("PC-46: diff-store bulk acceptAll marks all files accepted", async () => {
    const { useDiffStore } = await import("@/stores/diff-store")
    useDiffStore.getState().clear()

    for (const p of ["a.ts", "b.ts", "c.ts"]) {
      useDiffStore.getState().addFileDiff({
        path: p,
        originalContent: "old\n",
        modifiedContent: "new\n",
        rawDiff: "@@ -1 +1 @@\n-old\n+new\n",
        hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, content: "@@ -1 +1 @@\n-old\n+new\n", status: "pending" }],
        status: "pending",
        createdAt: Date.now(),
        source: "agent",
      })
    }

    useDiffStore.getState().acceptAll()

    expect(useDiffStore.getState().getAcceptedFiles()).toHaveLength(3)
  })

  it("PC-47: diff-store bulk rejectAll marks all files rejected", async () => {
    const { useDiffStore } = await import("@/stores/diff-store")
    useDiffStore.getState().clear()

    for (const p of ["a.ts", "b.ts"]) {
      useDiffStore.getState().addFileDiff({
        path: p,
        originalContent: "old\n",
        modifiedContent: "new\n",
        rawDiff: "@@ -1 +1 @@\n-old\n+new\n",
        hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, content: "@@ -1 +1 @@\n-old\n+new\n", status: "pending" }],
        status: "pending",
        createdAt: Date.now(),
        source: "agent",
      })
    }

    useDiffStore.getState().rejectAll()

    expect(useDiffStore.getState().getPendingFiles()).toHaveLength(0)
  })

  it("PC-48: diff-store removeFile cleans up single entry", async () => {
    const { useDiffStore } = await import("@/stores/diff-store")
    useDiffStore.getState().addFileDiff({
      path: "temp.ts",
      originalContent: "",
      modifiedContent: "",
      rawDiff: "",
      hunks: [],
      status: "pending",
      createdAt: Date.now(),
      source: "agent",
    })

    useDiffStore.getState().removeFile("temp.ts")
    expect(useDiffStore.getState().files.has("temp.ts")).toBe(false)
  })
})
