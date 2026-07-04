import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// ── In-memory filesystem ──
const memfs = new Map<string, string>()
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/")
}
function memfsGet(path: string): string | undefined {
  return memfs.get(normalizePath(path))
}
function memfsSet(path: string, content: string): void {
  memfs.set(normalizePath(path), content)
}
function memfsDelete(path: string): void {
  memfs.delete(normalizePath(path))
}

// ── Mocks ──
const mockNotifyFileEdited = vi.fn()
const mockCreateSnapshot = vi.fn().mockResolvedValue({ version: 1, timestamp: Date.now(), backupPath: "/tmp/backup", originalPath: "", size: 0, messageId: "test" })

vi.mock("@/stores/workspace-store", () => ({
  useWorkspaceStore: {
    getState: vi.fn(() => ({
      rootPath: "/test/workspace",
      notifyFileEdited: mockNotifyFileEdited,
      openFiles: [],
    })),
  },
}))

vi.mock("@/lib/electron-api", () => ({
  readTextFile: vi.fn(async (path: string) => {
    const normalized = path.replace(/\\/g, "/")
    const content = memfsGet(normalized)
    if (content === undefined) return null
    return content
  }),
  writeTextFile: vi.fn(async (path: string, content: string) => {
    memfsSet(path, content)
  }),
  exists: vi.fn(async (path: string) => memfsGet(path.replace(/\\/g, "/")) !== undefined),
}))

vi.mock("@/lib/filesystem", () => ({
  readFile: vi.fn(async (path: string) => {
    const normalized = path.replace(/\\/g, "/")
    const content = memfsGet(normalized)
    if (content === undefined) throw new Error(`ENOENT: ${path}`)
    return content
  }),
  writeFile: vi.fn(async (path: string, content: string) => {
    memfsSet(path, content)
  }),
}))

vi.mock("@/lib/file-history", () => ({
  FileHistoryManager: {
    getInstance: vi.fn(() => ({
      createSnapshot: mockCreateSnapshot,
    })),
  },
}))

// ── Helpers ──
const FILE_PATH = "src/hello.ts"
const FULL_PATH = "/test/workspace/src/hello.ts"
const ORIGINAL_CONTENT = 'const greeting = "Hello, World!"\nexport default greeting\n'
const MODIFIED_CONTENT = 'const greeting = "Hello, AgenticOS!"\nexport default greeting\n'

let traceCounter = 0
function nextTrace(): string {
  return `test-trace-${++traceCounter}`
}

import { fileContentCache } from "@/lib/FileContentCache"
import { useDiffStore } from "@/stores/diff-store"
import { buildDiffFileEntry, acceptDiffReviewFile, rejectDiffReviewFile, acceptAllDiffReviews } from "@/lib/diff-review"
import { ChangeSetManager } from "@/runtime/changeset/ChangeSetManager"

// Helper to seed a file in memfs and set up diff store entry (simulating ExecutionSessionManager)
function seedEditInDiffStore(original: string, modified: string): void {
  useDiffStore.getState().addFileDiff(
    buildDiffFileEntry(FILE_PATH, original, modified, "agent")
  )
}

describe("Phase 2.5 — Disk mutation tests (propose-only + accept/reject)", () => {
  beforeEach(() => {
    memfs.clear()
    mockNotifyFileEdited.mockClear()
    mockCreateSnapshot.mockClear()
    fileContentCache.clear()
    useDiffStore.setState({ files: new Map(), correlationId: null })
  })

  afterEach(() => {
    memfs.clear()
  })

  // ──────────────────────────────────────────────
  // 1. Tool propose-only guarantees
  // ──────────────────────────────────────────────
  describe("WriteFileTool — propose-only", () => {
    it("returns success without writing to disk", async () => {
      const { WriteFileTool } = await import("@/runtime/tools/implementations/WriteFileTool")
      const result = await WriteFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        { path: FILE_PATH, content: MODIFIED_CONTENT },
      )
      expect(result.isError).toBeFalsy()
      expect(result.data).toContain("Change proposed")
      // Disk should NOT have the content
      expect(memfsGet(FULL_PATH)).toBeUndefined()
    })

    it("updates fileContentCache so subsequent reads see proposed content", async () => {
      const { WriteFileTool } = await import("@/runtime/tools/implementations/WriteFileTool")
      await WriteFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        { path: FILE_PATH, content: MODIFIED_CONTENT },
      )
      const cached = fileContentCache.get(FULL_PATH)
      expect(cached).toBe(MODIFIED_CONTENT)
    })

    it("does not call notifyFileEdited on propose", async () => {
      const { WriteFileTool } = await import("@/runtime/tools/implementations/WriteFileTool")
      await WriteFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        { path: FILE_PATH, content: MODIFIED_CONTENT },
      )
      expect(mockNotifyFileEdited).not.toHaveBeenCalled()
    })
  })

  describe("EditFileTool — propose-only", () => {
    beforeEach(() => {
      memfsSet(FULL_PATH, ORIGINAL_CONTENT)
    })

    it("returns success without writing to disk", async () => {
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      const result = await EditFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        { path: FILE_PATH, old_string: "Hello, World!", new_string: "Hello, AgenticOS!" },
      )
      expect(result.isError).toBeFalsy()
      expect(result.data).toContain("Change proposed")
      // EditFileTool does NOT write to disk — change is staged for review, disk has original
      expect(memfsGet(FULL_PATH)).toBe(ORIGINAL_CONTENT)
      expect(fileContentCache.get(FULL_PATH)).toBe(MODIFIED_CONTENT)
    })

    it("updates fileContentCache with edited content", async () => {
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      await EditFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        { path: FILE_PATH, old_string: "Hello, World!", new_string: "Hello, AgenticOS!" },
      )
      const cached = fileContentCache.get(FULL_PATH)
      expect(cached).toContain("Hello, AgenticOS!")
      expect(cached).not.toContain("Hello, World!")
    })

    it("does not call notifyFileEdited on propose", async () => {
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      await EditFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        { path: FILE_PATH, old_string: "Hello, World!", new_string: "Hello, AgenticOS!" },
      )
      expect(mockNotifyFileEdited).not.toHaveBeenCalled()
    })
  })

  // ──────────────────────────────────────────────
  // 2. Accept flow — writes to disk
  // ──────────────────────────────────────────────
  describe("acceptDiffReviewFile — writes to disk", () => {
    beforeEach(() => {
      memfsSet(FULL_PATH, ORIGINAL_CONTENT)
    })

    it("writes modified content to disk on accept", async () => {
      seedEditInDiffStore(ORIGINAL_CONTENT, MODIFIED_CONTENT)
      const accepted = await acceptDiffReviewFile(FILE_PATH)
      expect(accepted).toBe(true)
      expect(memfsGet(FULL_PATH)).toBe(MODIFIED_CONTENT)
    })

    it("creates a snapshot on accept", async () => {
      seedEditInDiffStore(ORIGINAL_CONTENT, MODIFIED_CONTENT)
      await acceptDiffReviewFile(FILE_PATH)
      expect(mockCreateSnapshot).toHaveBeenCalled()
    })

    it("reports false when file does not exist", async () => {
      memfsDelete(FULL_PATH)
      seedEditInDiffStore(ORIGINAL_CONTENT, MODIFIED_CONTENT)
      const accepted = await acceptDiffReviewFile(FILE_PATH)
      expect(accepted).toBe(false)
    })

    it("acceptAllDiffReviews writes all files to disk", async () => {
      memfsSet(FULL_PATH, ORIGINAL_CONTENT)
      seedEditInDiffStore(ORIGINAL_CONTENT, MODIFIED_CONTENT)
      const count = await acceptAllDiffReviews()
      expect(count).toBe(1)
      expect(memfsGet(FULL_PATH)).toBe(MODIFIED_CONTENT)
    })
  })

  // ──────────────────────────────────────────────
  // 3. Reject flow — skip I/O when content matches
  // ──────────────────────────────────────────────
  describe("rejectDiffReviewFile — skips I/O", () => {
    beforeEach(() => {
      memfsSet(FULL_PATH, ORIGINAL_CONTENT)
    })

    it("returns true without writing when disk already matches original", async () => {
      seedEditInDiffStore(ORIGINAL_CONTENT, MODIFIED_CONTENT)
      const { writeFile } = await import("@/lib/filesystem")
      const writeFileMock = vi.mocked(writeFile)
      writeFileMock.mockClear()

      const rejected = await rejectDiffReviewFile(FILE_PATH)
      expect(rejected).toBe(true)
      // Disk content should remain unchanged
      expect(memfsGet(FULL_PATH)).toBe(ORIGINAL_CONTENT)
      // writeFile should NOT have been called (skip I/O optimization)
      expect(writeFileMock).not.toHaveBeenCalled()
    })

    it("updates diff store entry status to rejected", async () => {
      seedEditInDiffStore(ORIGINAL_CONTENT, MODIFIED_CONTENT)
      await rejectDiffReviewFile(FILE_PATH)
      const entry = useDiffStore.getState().files.get(FILE_PATH)
      expect(entry?.status).toBe("rejected")
    })
  })

  // ──────────────────────────────────────────────
  // 4. Conflict detection
  // ──────────────────────────────────────────────
  describe("conflict detection — blocks accept on external modification", () => {
    beforeEach(() => {
      memfsSet(FULL_PATH, ORIGINAL_CONTENT)
    })

    it("blocks accept when file was modified externally", async () => {
      seedEditInDiffStore(ORIGINAL_CONTENT, MODIFIED_CONTENT)
      // Externally modify the file on disk
      memfsSet(FULL_PATH, ORIGINAL_CONTENT + '// externally modified\n')
      const accepted = await acceptDiffReviewFile(FILE_PATH)
      expect(accepted).toBe(false)
      // Disk should still have the external modification
      expect(memfsGet(FULL_PATH)).toBe(ORIGINAL_CONTENT + '// externally modified\n')
    })

    it("blocks accept when file was deleted", async () => {
      seedEditInDiffStore(ORIGINAL_CONTENT, MODIFIED_CONTENT)
      memfsDelete(FULL_PATH)
      const accepted = await acceptDiffReviewFile(FILE_PATH)
      expect(accepted).toBe(false)
    })

    it("allows accept when file matches original (no external change)", async () => {
      seedEditInDiffStore(ORIGINAL_CONTENT, MODIFIED_CONTENT)
      const accepted = await acceptDiffReviewFile(FILE_PATH)
      expect(accepted).toBe(true)
    })
  })

  // ──────────────────────────────────────────────
  // 5. Full integration: propose → accept → verify
  // ──────────────────────────────────────────────
  describe("full flow integration", () => {
    beforeEach(() => {
      memfsSet(FULL_PATH, ORIGINAL_CONTENT)
    })

    it("propose → accept: disk content matches proposed edit", async () => {
      // Step 1: EditFileTool proposes the change (no disk write)
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      const toolResult = await EditFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        { path: FILE_PATH, old_string: "Hello, World!", new_string: "Hello, AgenticOS!" },
      )
      expect(toolResult.isError).toBeFalsy()
      // EditFileTool stages change in cache, disk unchanged
      expect(memfsGet(FULL_PATH)).toBe(ORIGINAL_CONTENT)
      expect(fileContentCache.get(FULL_PATH)).toBe(MODIFIED_CONTENT)

      // Step 2: Simulate ExecutionSessionManager creating diff store entry
      const cached = fileContentCache.get(FULL_PATH)!
      seedEditInDiffStore(ORIGINAL_CONTENT, cached)

      // Step 3: Accept verifies
      const accepted = await acceptDiffReviewFile(FILE_PATH)
      expect(accepted).toBe(true)
      expect(memfsGet(FULL_PATH)).toBe(cached)
      expect(memfsGet(FULL_PATH)).toContain("Hello, AgenticOS!")
    })

    it("propose → reject: disk content stays unchanged", async () => {
      // Step 1: EditFileTool proposes change
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      await EditFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        { path: FILE_PATH, old_string: "Hello, World!", new_string: "Hello, AgenticOS!" },
      )

      // Step 2: Create diff store entry
      const cached = fileContentCache.get(FULL_PATH)!
      seedEditInDiffStore(ORIGINAL_CONTENT, cached)

      // Step 3: Reject leaves disk unchanged
      const rejected = await rejectDiffReviewFile(FILE_PATH)
      expect(rejected).toBe(true)
      expect(memfsGet(FULL_PATH)).toBe(ORIGINAL_CONTENT)
    })
  })
})
