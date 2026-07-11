import { describe, it, expect, beforeEach } from "vitest"
import { useDiffStore, type DiffFileEntry } from "@/stores/diff-store"

function makeMockFile(path: string, status: DiffFileEntry["status"] = "pending"): DiffFileEntry {
  return {
    path,
    originalContent: "line1\nline2\nline3",
    modifiedContent: "line1\nline2\nline3\nline4",
    rawDiff: "@@ -1,3 +1,4 @@\n line1\n line2\n line3\n+line4",
    hunks: [
      { hunkIndex: 0, header: "@@ -1,3 +1,4 @@", status: "pending", additions: 1, deletions: 0 },
    ],
    status,
    createdAt: Date.now(),
    source: "agent",
  }
}

function makeMultiHunkFile(path: string): DiffFileEntry {
  return {
    path,
    originalContent: "a\nb\nc\nd\ne",
    modifiedContent: "a\nb2\nc\nd2\ne",
    rawDiff: "@@ -1,5 +1,5 @@\n a\n-b\n+b2\n c\n-d\n+d2\n e",
    hunks: [
      { hunkIndex: 0, header: "@@ -2,1 +2,1 @@", status: "pending", additions: 1, deletions: 1 },
      { hunkIndex: 1, header: "@@ -4,1 +4,1 @@", status: "pending", additions: 1, deletions: 1 },
    ],
    status: "pending",
    createdAt: Date.now(),
    source: "agent",
  }
}

describe("DiffStore", () => {
  beforeEach(() => {
    useDiffStore.getState().clear()
  })

  describe("addFileDiff", () => {
    it("adds a single file diff entry", () => {
      const store = useDiffStore.getState()
      const file = makeMockFile("src/test.ts")
      store.addFileDiff(file)

      const stored = useDiffStore.getState().files.get("src/test.ts")
      expect(stored).toBeDefined()
      expect(stored!.path).toBe("src/test.ts")
      expect(stored!.status).toBe("pending")
    })

    it("overwrites existing entry for the same path", () => {
      const store = useDiffStore.getState()
      store.addFileDiff(makeMockFile("src/test.ts", "pending"))
      store.addFileDiff(makeMockFile("src/test.ts", "accepted"))

      const stored = useDiffStore.getState().files.get("src/test.ts")
      expect(stored!.status).toBe("accepted")
      expect(useDiffStore.getState().files.size).toBe(1)
    })
  })

  describe("addFileDiffs", () => {
    it("adds multiple files at once", () => {
      const store = useDiffStore.getState()
      store.addFileDiffs([
        makeMockFile("src/a.ts"),
        makeMockFile("src/b.ts"),
        makeMockFile("src/c.ts"),
      ])
      expect(useDiffStore.getState().files.size).toBe(3)
    })
  })

  describe("acceptFile", () => {
    it("marks a file and all its hunks as accepted", () => {
      const store = useDiffStore.getState()
      store.addFileDiff(makeMultiHunkFile("src/test.ts"))
      store.acceptFile("src/test.ts")

      const file = useDiffStore.getState().files.get("src/test.ts")!
      expect(file.status).toBe("accepted")
      expect(file.hunks.every((h) => h.status === "accepted")).toBe(true)
    })

    it("does nothing for non-existent file", () => {
      const store = useDiffStore.getState()
      store.acceptFile("nonexistent.ts")
      // No crash
    })
  })

  describe("rejectFile", () => {
    it("marks a file and all its hunks as rejected", () => {
      const store = useDiffStore.getState()
      store.addFileDiff(makeMultiHunkFile("src/test.ts"))
      store.rejectFile("src/test.ts")

      const file = useDiffStore.getState().files.get("src/test.ts")!
      expect(file.status).toBe("rejected")
      expect(file.hunks.every((h) => h.status === "rejected")).toBe(true)
    })
  })

  describe("per-hunk actions", () => {
    it("accepts a single hunk and leaves others pending", () => {
      const store = useDiffStore.getState()
      store.addFileDiff(makeMultiHunkFile("src/test.ts"))
      store.acceptHunk("src/test.ts", 0)

      const file = useDiffStore.getState().files.get("src/test.ts")!
      expect(file.hunks[0].status).toBe("accepted")
      expect(file.hunks[1].status).toBe("pending")
      expect(file.status).toBe("pending") // Not all accepted
    })

    it("marks file as accepted when all hunks are accepted", () => {
      const store = useDiffStore.getState()
      store.addFileDiff(makeMultiHunkFile("src/test.ts"))
      store.acceptHunk("src/test.ts", 0)
      store.acceptHunk("src/test.ts", 1)

      const file = useDiffStore.getState().files.get("src/test.ts")!
      expect(file.status).toBe("accepted")
    })

    it("marks file as rejected when all hunks are rejected", () => {
      const store = useDiffStore.getState()
      store.addFileDiff(makeMultiHunkFile("src/test.ts"))
      store.rejectHunk("src/test.ts", 0)
      store.rejectHunk("src/test.ts", 1)

      const file = useDiffStore.getState().files.get("src/test.ts")!
      expect(file.status).toBe("rejected")
    })

    it("leaves file pending when some hunks accepted and some rejected", () => {
      const store = useDiffStore.getState()
      store.addFileDiff(makeMultiHunkFile("src/test.ts"))
      store.acceptHunk("src/test.ts", 0)
      store.rejectHunk("src/test.ts", 1)

      const file = useDiffStore.getState().files.get("src/test.ts")!
      expect(file.hunks[0].status).toBe("accepted")
      expect(file.hunks[1].status).toBe("rejected")
      expect(file.status).toBe("pending") // Mixed
    })

    it("does nothing for invalid hunk index", () => {
      const store = useDiffStore.getState()
      store.addFileDiff(makeMultiHunkFile("src/test.ts"))
      store.acceptHunk("src/test.ts", 99)

      const file = useDiffStore.getState().files.get("src/test.ts")!
      expect(file.hunks.every((h) => h.status === "pending")).toBe(true)
    })
  })

  describe("bulk actions", () => {
    it("acceptAll marks all files as accepted", () => {
      const store = useDiffStore.getState()
      store.addFileDiffs([makeMockFile("src/a.ts"), makeMockFile("src/b.ts")])
      store.acceptAll()

      const files = useDiffStore.getState().files
      for (const [, file] of files) {
        expect(file.status).toBe("accepted")
        expect(file.hunks.every((h) => h.status === "accepted")).toBe(true)
      }
    })

    it("rejectAll marks all files as rejected", () => {
      const store = useDiffStore.getState()
      store.addFileDiffs([makeMockFile("src/a.ts"), makeMockFile("src/b.ts")])
      store.rejectAll()

      const files = useDiffStore.getState().files
      for (const [, file] of files) {
        expect(file.status).toBe("rejected")
      }
    })
  })

  describe("removeFile", () => {
    it("removes a single file", () => {
      const store = useDiffStore.getState()
      store.addFileDiff(makeMockFile("src/test.ts"))
      store.removeFile("src/test.ts")
      expect(useDiffStore.getState().files.size).toBe(0)
    })
  })

  describe("clear", () => {
    it("removes all files and resets correlationId", () => {
      const store = useDiffStore.getState()
      store.addFileDiffs([makeMockFile("src/a.ts"), makeMockFile("src/b.ts")])
      store.setCorrelationId("test-123")
      store.clear()

      expect(useDiffStore.getState().files.size).toBe(0)
      expect(useDiffStore.getState().correlationId).toBeNull()
    })
  })

  describe("queries", () => {
    it("getPendingFiles returns only pending files", () => {
      const store = useDiffStore.getState()
      store.addFileDiffs([
        makeMockFile("src/a.ts", "pending"),
        makeMockFile("src/b.ts", "accepted"),
        makeMockFile("src/c.ts", "pending"),
      ])
      const pending = useDiffStore.getState().getPendingFiles()
      expect(pending).toHaveLength(2)
      expect(pending.every((f) => f.status === "pending")).toBe(true)
    })

    it("getAcceptedFiles returns only accepted files", () => {
      const store = useDiffStore.getState()
      store.addFileDiffs([
        makeMockFile("src/a.ts", "accepted"),
        makeMockFile("src/b.ts", "pending"),
      ])
      const accepted = useDiffStore.getState().getAcceptedFiles()
      expect(accepted).toHaveLength(1)
      expect(accepted[0].path).toBe("src/a.ts")
    })

    it("getFileStatus returns the file entry", () => {
      const store = useDiffStore.getState()
      store.addFileDiff(makeMockFile("src/test.ts"))
      const file = useDiffStore.getState().getFileStatus("src/test.ts")
      expect(file).toBeDefined()
      expect(file!.path).toBe("src/test.ts")
    })

    it("getFileStatus returns undefined for missing file", () => {
      const file = useDiffStore.getState().getFileStatus("nonexistent.ts")
      expect(file).toBeUndefined()
    })

    it("getTotalChanges returns correct summary", () => {
      const store = useDiffStore.getState()
      store.addFileDiffs([
        makeMockFile("src/a.ts", "pending"),
        makeMockFile("src/b.ts", "accepted"),
      ])
      const total = useDiffStore.getState().getTotalChanges()
      expect(total.files).toBe(2)
      expect(total.pending).toBe(1)
      expect(total.additions).toBeGreaterThan(0)
    })
  })

  describe("correlationId", () => {
    it("setCorrelationId stores the value", () => {
      const store = useDiffStore.getState()
      store.setCorrelationId("exec_123")
      expect(useDiffStore.getState().correlationId).toBe("exec_123")
    })
  })
})
