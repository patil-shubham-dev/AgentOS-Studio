import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { fileContentCache } from "@/lib/FileContentCache"

// In-memory filesystem for testing — normalizes path separators
const memfs = new Map<string, string>()
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}
function memfsGet(path: string): string | undefined {
  return memfs.get(normalizePath(path))
}
function memfsSet(path: string, content: string): void {
  memfs.set(normalizePath(path), content)
}

const mockNotifyFileEdited = vi.fn()

vi.mock("@/stores/workspace-store", () => ({
  useWorkspaceStore: {
    getState: vi.fn(() => ({
      rootPath: "/test/workspace",
      notifyFileEdited: mockNotifyFileEdited,
    })),
  },
}))

vi.mock("@/lib/electron-api", () => ({
  readTextFile: vi.fn(async (path: string) => {
    const content = memfsGet(path)
    if (content === undefined) throw new Error(`ENOENT: ${path}`)
    return content
  }),
  writeTextFile: vi.fn(async (path: string, content: string) => {
    memfsSet(path, content)
  }),
}))

// Mock FileHistoryManager to prevent localStorage and disk I/O
const mockCreateSnapshot = vi.fn().mockResolvedValue({ version: 1, timestamp: Date.now(), backupPath: "/tmp/backup", originalPath: "", size: 0, messageId: "test" })
vi.mock("@/lib/file-history", () => ({
  FileHistoryManager: {
    getInstance: vi.fn(() => ({
      createSnapshot: mockCreateSnapshot,
    })),
  },
}))

let traceCounter = 0
function nextTrace(): string {
  return `test-trace-${++traceCounter}`
}

describe("EditFileTool", () => {
  beforeEach(async () => {
    memfs.clear()
    fileContentCache.clear()
    mockNotifyFileEdited.mockClear()
    mockCreateSnapshot.mockClear()

    // Seed initial file
    memfsSet(
      "/test/workspace/src/auth/middleware.ts",
      [
        "import { Request, Response } from 'express'",
        "import { authenticate } from './authenticate'",
        "",
        "export function authMiddleware(req: Request, res: Response) {",
        "  const token = req.headers.authorization",
        "  if (!token) {",
        "    return res.status(401).json({ error: 'Unauthorized' })",
        "  }",
        "  return authenticate(token)",
        "}",
        "",
        "export function requireAdmin(req: Request, res: Response) {",
        "  const user = req.user",
        "  if (!user.isAdmin) {",
        "    return res.status(403).json({ error: 'Forbidden' })",
        "  }",
        "}",
      ].join("\n")
    )
  })

  afterEach(() => {
    memfs.clear()
  })

  describe("edits array format (new API)", () => {
    it("applies a single replace edit", async () => {
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      const result = await EditFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        {
          path: "src/auth/middleware.ts",
          edits: [
            { old_content: "return res.status(401).json({ error: 'Unauthorized' })", new_content: "return res.status(401).json({ error: 'Authentication required' })" }
          ],
        }
      )
      expect(result.isError).toBeFalsy()
      expect(result.data).toContain("Change proposed")
      const content = fileContentCache.get("/test/workspace/src/auth/middleware.ts")
      expect(content).toContain("Authentication required")
      expect(content).not.toContain("Unauthorized")
    })

    it("applies multiple edits sequentially", async () => {
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      const result = await EditFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        {
          path: "src/auth/middleware.ts",
          edits: [
            { old_content: "import { Request, Response } from 'express'", new_content: "import { Request, Response, NextFunction } from 'express'" },
            { old_content: "export function authMiddleware(req: Request, res: Response) {", new_content: "export function authMiddleware(req: Request, res: Response, next: NextFunction) {" },
          ],
        }
      )
      expect(result.isError).toBeFalsy()
      const content = fileContentCache.get("/test/workspace/src/auth/middleware.ts")
      expect(content).toContain("NextFunction")
      expect(content).toContain("next: NextFunction")
    })

    it("reports EDIT_FAILED for missing old_content", async () => {
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      const result = await EditFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        {
          path: "src/auth/middleware.ts",
          edits: [
            { old_content: "this text does not exist in the file", new_content: "replacement" }
          ],
        }
      )
      expect(result.isError).toBe(true)
      expect(result.error).toContain("EDIT_FAILED")
      expect(result.error).toContain("target text not found")
    })

    it("reports EDIT_FAILED when second edit targets already-changed content", async () => {
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      const result = await EditFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        {
          path: "src/auth/middleware.ts",
          edits: [
            { old_content: "return authenticate(token)", new_content: "return await authenticate(token)" },
            { old_content: "return authenticate(token)", new_content: "return authenticate(token, req)" },
          ],
        }
      )
      expect(result.isError).toBe(true)
      expect(result.error).toContain("EDIT_FAILED")
    })

    it("handles multi-occurrence replacement", async () => {
      memfsSet("/test/workspace/test-file.ts", "foo\nfoo\nfoo")
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      const result = await EditFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        {
          path: "test-file.ts",
          edits: [
            { old_content: "foo", new_content: "bar", allOccurrences: true }
          ],
        }
      )
      expect(result.isError).toBeFalsy()
      const content = fileContentCache.get("/test/workspace/test-file.ts")
      expect(content).toBe("bar\nbar\nbar")
    })

    it("supports insert operation before target", async () => {
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      const result = await EditFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        {
          path: "src/auth/middleware.ts",
          edits: [
            { type: "insert", target: "export function authMiddleware", newContent: "// Auth middleware — rate limited", position: "before" }
          ],
        }
      )
      expect(result.isError).toBeFalsy()
      const content = fileContentCache.get("/test/workspace/src/auth/middleware.ts")
      expect(content).toContain("// Auth middleware — rate limited")
      expect(content).toContain("export function authMiddleware")
    })

    it("supports insert operation after target", async () => {
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      const result = await EditFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        {
          path: "src/auth/middleware.ts",
          edits: [
            { type: "insert", target: "return authenticate(token)", newContent: "  // Token validated", position: "after" }
          ],
        }
      )
      expect(result.isError).toBeFalsy()
      const content = fileContentCache.get("/test/workspace/src/auth/middleware.ts")
      expect(content).toContain("// Token validated")
    })

    it("supports delete operation removing a function", async () => {
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      const oldContent = [
        "export function requireAdmin(req: Request, res: Response) {",
        "  const user = req.user",
        "  if (!user.isAdmin) {",
        "    return res.status(403).json({ error: 'Forbidden' })",
        "  }",
        "}",
      ].join("\n")
      const result = await EditFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        {
          path: "src/auth/middleware.ts",
          edits: [
            { type: "delete", oldContent }
          ],
        }
      )
      expect(result.isError).toBeFalsy()
      expect(result.data).toContain("Change proposed")
      const content = fileContentCache.get("/test/workspace/src/auth/middleware.ts")
      expect(content).not.toContain("requireAdmin")
    })
  })

  describe("legacy old_string / new_string format", () => {
    it("applies a single edit using old_string/new_string", async () => {
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      const result = await EditFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        {
          path: "src/auth/middleware.ts",
          old_string: "export function authMiddleware",
          new_string: "export async function authMiddleware",
        }
      )
      expect(result.isError).toBeFalsy()
      expect(result.data).toContain("Change proposed")
      const content = fileContentCache.get("/test/workspace/src/auth/middleware.ts")
      expect(content).toContain("export async function authMiddleware")
    })

    it("reports error when old_string not found", async () => {
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      const result = await EditFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        {
          path: "src/auth/middleware.ts",
          old_string: "nonexistent content",
          new_string: "replacement",
        }
      )
      expect(result.isError).toBe(true)
      expect(result.error).toContain("EDIT_FAILED")
    })
  })

  describe("error handling", () => {
    it("returns error when path is missing", async () => {
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      const result = await EditFileTool.execute(
        { role: "coder" },
        { edits: [{ old_content: "a", new_content: "b" }] }
      )
      expect(result.isError).toBe(true)
      expect(result.error).toContain("path' or 'file")
    })

    it("returns error when no edits provided", async () => {
      memfsSet("/test/workspace/test.ts", "const x = 1\n")
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      const result = await EditFileTool.execute(
        { role: "coder" },
        { path: "test.ts" }
      )
      expect(result.isError).toBe(true)
      expect(result.error).toContain("edits")
    })

    it("returns meta with edit results on partial failure", async () => {
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      const result = await EditFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        {
          path: "src/auth/middleware.ts",
          edits: [
            { old_content: "import { Request, Response } from 'express'", new_content: "import { Request, Response, NextFunction } from 'express'" },
            { old_content: "nonexistent content", new_content: "replacement" },
          ],
        }
      )
      expect(result.isError).toBe(true)
      expect(result.meta).toBeDefined()
      const meta = result.meta as Record<string, unknown>
      expect(meta.appliedCount).toBe(1)
      expect(meta.failedCount).toBe(1)
      expect(Array.isArray(meta.editResults)).toBe(true)
    })
  })

  describe("change tracking deduplication", () => {
    it("applies multiple edits to the same file within a session", async () => {
      const traceId = nextTrace()
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      const r1 = await EditFileTool.execute(
        { role: "coder", traceId },
        {
          path: "src/auth/middleware.ts",
          edits: [{ old_content: "return authenticate(token)", new_content: "return await authenticate(token)" }],
        }
      )
      expect(r1.isError).toBeFalsy()

      const r2 = await EditFileTool.execute(
        { role: "coder", traceId },
        {
          path: "src/auth/middleware.ts",
          edits: [{ old_content: "return res.status(401)", new_content: "return res.status(403)" }],
        }
      )
      expect(r2.isError).toBeFalsy()

      // Both edits should be applied
      const content = fileContentCache.get("/test/workspace/src/auth/middleware.ts")
      expect(content).toContain("return await authenticate(token)")
      expect(content).toContain("return res.status(403)")
    })

    it("applies edits to different files independently", async () => {
      const traceId = nextTrace()
      memfsSet("/test/workspace/other.ts", "const y = 2\n")
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      const r1 = await EditFileTool.execute(
        { role: "coder", traceId },
        {
          path: "src/auth/middleware.ts",
          edits: [{ old_content: "return authenticate(token)", new_content: "return await authenticate(token)" }],
        }
      )
      expect(r1.isError).toBeFalsy()

      const r2 = await EditFileTool.execute(
        { role: "coder", traceId },
        {
          path: "other.ts",
          edits: [{ old_content: "const y = 2", new_content: "const y = 42" }],
        }
      )
      expect(r2.isError).toBeFalsy()

      // Both files should be updated in cache
      expect(fileContentCache.get("/test/workspace/src/auth/middleware.ts")).toContain("return await authenticate(token)")
      expect(fileContentCache.get("/test/workspace/other.ts")).toBe("const y = 42\n")
    })
  })

  describe("post-edit verification", () => {
    it("proposes edits without writing to disk", async () => {
      const { EditFileTool } = await import("@/runtime/tools/implementations/EditFileTool")
      const result = await EditFileTool.execute(
        { role: "coder", traceId: nextTrace() },
        {
          path: "src/auth/middleware.ts",
          edits: [
            { old_content: "return authenticate(token)", new_content: "return await authenticate(token)" },
          ],
        }
      )
      expect(result.isError).toBeFalsy()
      expect(result.meta?.status).toBe("pending_review")
      // Content is in cache only; disk still has original
      expect(memfsGet("/test/workspace/src/auth/middleware.ts")).not.toContain("return await authenticate")
      expect(memfsGet("/test/workspace/src/auth/middleware.ts")).toContain("return authenticate(token)")
      expect(fileContentCache.get("/test/workspace/src/auth/middleware.ts")).toContain("return await authenticate(token)")
    })
  })
})
