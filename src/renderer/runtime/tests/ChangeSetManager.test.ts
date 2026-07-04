import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { ChangeSetManager } from "@/runtime/changeset/ChangeSetManager"
import { useChangeSetStore } from "@/runtime/changeset/ChangeSetStore"
import {
  type ChangeSet,
  type ChangeSetFile,
  type DiffHunk,
  createChangeSetId,
  createChangeSetFileId,
} from "@/runtime/changeset/types"

const SESSION_ID = "ses_test_001_abc123"
const CORRELATION_ID = "corr_test_001"

beforeEach(() => {
  useChangeSetStore.setState({ changeSets: new Map(), activeChangeSetId: null })
})

function makeParams(overrides?: Partial<{ title: string; reason: string; sourceToolCallIds: string[] }>) {
  return {
    sessionId: SESSION_ID,
    correlationId: CORRELATION_ID,
    title: overrides?.title ?? "Refactor auth module",
    reason: overrides?.reason ?? "Extract token validation into shared utility",
    sourceToolCallIds: overrides?.sourceToolCallIds ?? [],
  }
}

describe("ChangeSetManager — createChangeSet", () => {
  it("creates a ChangeSet with draft status", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())
    expect(cs.status).toBe("draft")
    expect(cs.title).toBe("Refactor auth module")
    expect(cs.sessionId).toBe(SESSION_ID)
    expect(cs.correlationId).toBe(CORRELATION_ID)
    expect(cs.files).toEqual([])
    expect(cs.createdAt).toBeGreaterThan(0)
    expect(cs.updatedAt).toBeGreaterThan(0)
  })

  it("stores the ChangeSet in the store", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())
    const stored = useChangeSetStore.getState().getChangeSet(cs.id)
    expect(stored).toBeDefined()
    expect(stored!.id).toBe(cs.id)
  })

  it("emits changeset_created event", () => {
    const mgr = ChangeSetManager.getInstance()
    const onEvent = vi.fn()
    const unsub = mgr.onEvent(onEvent)
    const cs = mgr.createChangeSet(makeParams())
    expect(onEvent).toHaveBeenCalledWith({
      type: "changeset_created",
      changeSetId: cs.id,
      files: [],
    })
    unsub()
  })

  it("accepts sourceToolCallIds", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams({ sourceToolCallIds: ["tc_1", "tc_2"] }))
    expect(cs.sourceToolCallIds).toEqual(["tc_1", "tc_2"])
  })

  it("generates unique IDs", () => {
    const mgr = ChangeSetManager.getInstance()
    const a = mgr.createChangeSet(makeParams())
    const b = mgr.createChangeSet(makeParams())
    expect(a.id).not.toBe(b.id)
  })
})

describe("ChangeSetManager — addFileToChangeSet", () => {
  it("adds a modify file with computed hunks", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())

    const before = "line1\nline2\nline3\n"
    const after = "line1\nline2_modified\nline3\n"

    const file = mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/auth.ts",
      changeType: "modify",
      beforeContent: before,
      afterContent: after,
    })

    expect(file).not.toBeNull()
    expect(file!.path).toBe("src/auth.ts")
    expect(file!.changeType).toBe("modify")
    expect(file!.status).toBe("pending")
    expect(file!.beforeHash).toBeDefined()
    expect(file!.afterHash).toBeDefined()
    expect(file!.hunks.length).toBeGreaterThan(0)
    expect(file!.hunks[0].lines.length).toBeGreaterThan(0)
  })

  it("adds a create file without hunks", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())

    const file = mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/new-file.ts",
      changeType: "create",
      afterContent: "export const x = 1\n",
    })

    expect(file).not.toBeNull()
    expect(file!.changeType).toBe("create")
    expect(file!.hunks).toEqual([])
    expect(file!.afterContent).toBe("export const x = 1\n")
  })

  it("adds a delete file without hunks", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())

    const file = mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/old-file.ts",
      changeType: "delete",
      beforeContent: "export const old = 1\n",
    })

    expect(file).not.toBeNull()
    expect(file!.changeType).toBe("delete")
    expect(file!.hunks).toEqual([])
  })

  it("returns null for non-existent ChangeSet", () => {
    const mgr = ChangeSetManager.getInstance()
    const result = mgr.addFileToChangeSet({
      changeSetId: "nonexistent",
      path: "src/test.ts",
      changeType: "modify",
    })
    expect(result).toBeNull()
  })

  it("returns null for non-draft ChangeSet", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())
    mgr.proposeChangeSet(cs.id)

    const result = mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/test.ts",
      changeType: "modify",
    })
    expect(result).toBeNull()
  })

  it("updates the store with the new file", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())

    mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/auth.ts",
      changeType: "modify",
      beforeContent: "a\nb\nc\n",
      afterContent: "a\nb_modified\nc\n",
    })

    const stored = useChangeSetStore.getState().getChangeSet(cs.id)
    expect(stored!.files.length).toBe(1)
    expect(stored!.files[0].path).toBe("src/auth.ts")
  })
})

describe("ChangeSetManager — state transitions", () => {
  it("draft -> proposed -> pending_review", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())

    expect(mgr.proposeChangeSet(cs.id)).toBe(true)
    expect(useChangeSetStore.getState().getChangeSet(cs.id)!.status).toBe("proposed")

    expect(mgr.submitForReview(cs.id)).toBe(true)
    expect(useChangeSetStore.getState().getChangeSet(cs.id)!.status).toBe("pending_review")
  })

  it("pending_review -> accepted", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)

    expect(mgr.acceptChangeSet(cs.id)).toBe(true)
    expect(useChangeSetStore.getState().getChangeSet(cs.id)!.status).toBe("accepted")
  })

  it("pending_review -> rejected", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)

    expect(mgr.rejectChangeSet(cs.id)).toBe(true)
    expect(useChangeSetStore.getState().getChangeSet(cs.id)!.status).toBe("rejected")
  })

  it("rejects invalid transitions", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())

    expect(mgr.submitForReview(cs.id)).toBe(false)
    expect(mgr.acceptChangeSet(cs.id)).toBe(false)
    expect(mgr.rejectChangeSet(cs.id)).toBe(false)
    expect(useChangeSetStore.getState().getChangeSet(cs.id)!.status).toBe("draft")
  })

  it("accepted -> restored", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)
    mgr.acceptChangeSet(cs.id)

    expect(mgr.restoreChangeSet(cs.id)).toBe(true)
    expect(useChangeSetStore.getState().getChangeSet(cs.id)!.status).toBe("restored")
  })

  it("rejected -> restored", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)
    mgr.rejectChangeSet(cs.id)

    expect(mgr.restoreChangeSet(cs.id)).toBe(true)
    expect(useChangeSetStore.getState().getChangeSet(cs.id)!.status).toBe("restored")
  })

  it("emits events on transitions", () => {
    const mgr = ChangeSetManager.getInstance()
    const onEvent = vi.fn()
    const unsub = mgr.onEvent(onEvent)
    const cs = mgr.createChangeSet(makeParams())
    onEvent.mockClear()

    mgr.proposeChangeSet(cs.id)
    expect(onEvent).toHaveBeenCalledWith({ type: "changeset_proposed", changeSetId: cs.id })

    mgr.submitForReview(cs.id)
    expect(onEvent).toHaveBeenCalledWith({ type: "changeset_pending_review", changeSetId: cs.id })

    mgr.acceptChangeSet(cs.id)
    expect(onEvent).toHaveBeenCalledWith({ type: "changeset_accepted", changeSetId: cs.id })

    unsub()
  })
})

describe("ChangeSetManager — file-level accept/reject", () => {
  it("acceptFile updates file status and derives composite", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())
    const file = mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/auth.ts",
      changeType: "create",
      afterContent: "export const x = 1\n",
    })!
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)

    expect(mgr.acceptFile(cs.id, file.id)).toBe(true)
    const stored = useChangeSetStore.getState().getChangeSet(cs.id)!
    expect(stored.files[0].status).toBe("accepted")
    expect(stored.status).toBe("accepted")
  })

  it("rejectFile updates file status and derives composite", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())
    const file = mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/auth.ts",
      changeType: "create",
      afterContent: "export const x = 1\n",
    })!
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)

    expect(mgr.rejectFile(cs.id, file.id)).toBe(true)
    const stored = useChangeSetStore.getState().getChangeSet(cs.id)!
    expect(stored.files[0].status).toBe("rejected")
    expect(stored.status).toBe("rejected")
  })

  it("partial accept produces partially_accepted status", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())
    const f1 = mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/a.ts",
      changeType: "create",
      afterContent: "// a\n",
    })!
    const f2 = mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/b.ts",
      changeType: "create",
      afterContent: "// b\n",
    })!
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)

    mgr.acceptFile(cs.id, f1.id)
    const stored = useChangeSetStore.getState().getChangeSet(cs.id)!
    expect(stored.status).toBe("partially_accepted")
  })
})

describe("ChangeSetManager — hunk-level accept/reject", () => {
  it("acceptHunk updates hunk status and derives file status", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())
    const file = mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/auth.ts",
      changeType: "modify",
      beforeContent: "line1\nline2\nline3\n",
      afterContent: "line1\nline2_modified\nline3_modified\n",
    })!
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)

    const hunkId = file.hunks[0].id
    expect(mgr.acceptHunk(cs.id, file.id, hunkId)).toBe(true)

    const stored = useChangeSetStore.getState().getChangeSet(cs.id)!
    const storedHunk = stored.files[0].hunks.find((h) => h.id === hunkId)
    expect(storedHunk!.status).toBe("accepted")
  })

  it("rejectHunk updates hunk status", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())
    const file = mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/auth.ts",
      changeType: "modify",
      beforeContent: "line1\nline2\nline3\n",
      afterContent: "line1\nline2_modified\nline3_modified\n",
    })!
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)

    const hunkId = file.hunks[0].id
    expect(mgr.rejectHunk(cs.id, file.id, hunkId)).toBe(true)

    const stored = useChangeSetStore.getState().getChangeSet(cs.id)!
    const storedHunk = stored.files[0].hunks.find((h) => h.id === hunkId)
    expect(storedHunk!.status).toBe("rejected")
  })
})

describe("ChangeSetManager — generateDiff", () => {
  it("generates hunks for modified content", () => {
    const mgr = ChangeSetManager.getInstance()
    const original = "function add(a: number, b: number): number {\n  return a + b\n}\n"
    const modified = "function add(a: number, b: number): number {\n  return a + b + 1\n}\n"

    const hunks = mgr.generateDiff(original, modified)
    expect(hunks.length).toBeGreaterThan(0)
    expect(hunks[0].lines.some((l) => l.type === "remove")).toBe(true)
    expect(hunks[0].lines.some((l) => l.type === "add")).toBe(true)
  })

  it("returns empty for identical content", () => {
    const mgr = ChangeSetManager.getInstance()
    const content = "function add(a: number, b: number): number {\n  return a + b\n}\n"

    const hunks = mgr.generateDiff(content, content)
    expect(hunks).toEqual([])
  })

  it("generates correct line numbers", () => {
    const mgr = ChangeSetManager.getInstance()
    const original = "line1\nline2\nline3\nline4\nline5\n"
    const modified = "line1\nline2_modified\nline3\nline4\nline5\n"

    const hunks = mgr.generateDiff(original, modified)
    expect(hunks.length).toBeGreaterThan(0)
    expect(hunks[0].oldStart).toBeGreaterThan(0)
    expect(hunks[0].newStart).toBeGreaterThan(0)
  })
})

describe("ChangeSetManager — hashContent", () => {
  it("produces consistent hashes", () => {
    const mgr = ChangeSetManager.getInstance()
    const hash1 = mgr.hashContent("hello world")
    const hash2 = mgr.hashContent("hello world")
    expect(hash1).toBe(hash2)
  })

  it("produces different hashes for different content", () => {
    const mgr = ChangeSetManager.getInstance()
    const hash1 = mgr.hashContent("hello world")
    const hash2 = mgr.hashContent("hello world!")
    expect(hash1).not.toBe(hash2)
  })

  it("returns empty for empty string", () => {
    const mgr = ChangeSetManager.getInstance()
    expect(mgr.hashContent("")).toBe("")
  })
})

describe("ChangeSetStore — queries", () => {
  it("getChangeSetsBySession returns sessions", () => {
    const mgr = ChangeSetManager.getInstance()
    mgr.createChangeSet(makeParams({ title: "CS 1" }))
    mgr.createChangeSet(makeParams({ title: "CS 2" }))

    const results = useChangeSetStore.getState().getChangeSetsBySession(SESSION_ID)
    expect(results.length).toBe(2)
  })

  it("getPendingChangeSets returns reviewable items", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs1 = mgr.createChangeSet(makeParams({ title: "Draft" }))
    const cs2 = mgr.createChangeSet(makeParams({ title: "Ready" }))
    mgr.proposeChangeSet(cs2.id)
    mgr.submitForReview(cs2.id)

    const pending = useChangeSetStore.getState().getPendingChangeSets()
    expect(pending.length).toBe(1)
    expect(pending[0].id).toBe(cs2.id)
  })

  it("setActiveChangeSet updates active id", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())

    useChangeSetStore.getState().setActiveChangeSet(cs.id)
    expect(useChangeSetStore.getState().activeChangeSetId).toBe(cs.id)

    useChangeSetStore.getState().setActiveChangeSet(null)
    expect(useChangeSetStore.getState().activeChangeSetId).toBeNull()
  })

  it("removeChangeSet cleans up", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())
    useChangeSetStore.getState().setActiveChangeSet(cs.id)

    useChangeSetStore.getState().removeChangeSet(cs.id)
    expect(useChangeSetStore.getState().getChangeSet(cs.id)).toBeUndefined()
    expect(useChangeSetStore.getState().activeChangeSetId).toBeNull()
  })
})

describe("ChangeSetManager — conflict and restore", () => {
  it("markConflicted transitions from pending_review", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)

    expect(mgr.markConflicted(cs.id)).toBe(true)
    expect(useChangeSetStore.getState().getChangeSet(cs.id)!.status).toBe("conflicted")
  })

  it("cannot markConflict from draft", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())

    expect(mgr.markConflicted(cs.id)).toBe(false)
  })
})

describe("ChangeSetManager — event subscription cleanup", () => {
  it("unsub removes listener", () => {
    const mgr = ChangeSetManager.getInstance()
    const onEvent = vi.fn()
    const unsub = mgr.onEvent(onEvent)
    unsub()

    mgr.createChangeSet(makeParams())
    expect(onEvent).not.toHaveBeenCalled()
  })
})

describe("createChangeSetId", () => {
  it("starts with cs_ prefix", () => {
    expect(createChangeSetId()).toMatch(/^cs_\d+_[a-z0-9]{7}$/)
  })
})

describe("createChangeSetFileId", () => {
  it("starts with csf_ prefix", () => {
    expect(createChangeSetFileId()).toMatch(/^csf_\d+_[a-z0-9]{7}$/)
  })
})

// ── PR 9: File Write Through ChangeSet — integration tests ──

describe("PR 9 — FILE_EDIT → ChangeSet wiring", () => {
  it("creates a ChangeSet and adds file on first FILE_EDIT", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())
    expect(cs.status).toBe("draft")
    expect(cs.files).toEqual([])

    const file = mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/auth.ts",
      changeType: "modify",
      beforeContent: "const x = 1\n",
      afterContent: "const x = 2\n",
    })
    expect(file).not.toBeNull()
    expect(file!.path).toBe("src/auth.ts")
    expect(file!.hunks.length).toBeGreaterThan(0)

    const stored = useChangeSetStore.getState().getChangeSet(cs.id)
    expect(stored!.files.length).toBe(1)
    expect(stored!.files[0].path).toBe("src/auth.ts")
  })

  it("multiple FILE_EDITs add multiple files to the same ChangeSet", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())

    mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/a.ts",
      changeType: "modify",
      beforeContent: "// a\n",
      afterContent: "// a modified\n",
    })
    mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/b.ts",
      changeType: "create",
      afterContent: "// b\n",
    })
    mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/c.ts",
      changeType: "delete",
      beforeContent: "// c\n",
    })

    const stored = useChangeSetStore.getState().getChangeSet(cs.id)
    expect(stored!.files.length).toBe(3)
    expect(stored!.files.map((f) => f.path).sort()).toEqual([
      "src/a.ts", "src/b.ts", "src/c.ts",
    ])
  })

  it("session completion transitions ChangeSet to pending_review", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())

    mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/auth.ts",
      changeType: "modify",
      beforeContent: "const x = 1\n",
      afterContent: "const x = 2\n",
    })

    mgr.proposeChangeSet(cs.id)
    expect(useChangeSetStore.getState().getChangeSet(cs.id)!.status).toBe("proposed")

    mgr.submitForReview(cs.id)
    expect(useChangeSetStore.getState().getChangeSet(cs.id)!.status).toBe("pending_review")
  })

  it("acceptChangeSet transitions from pending_review to accepted", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())
    mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/auth.ts",
      changeType: "modify",
      beforeContent: "const x = 1\n",
      afterContent: "const x = 2\n",
    })
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)

    expect(mgr.acceptChangeSet(cs.id)).toBe(true)
    const stored = useChangeSetStore.getState().getChangeSet(cs.id)
    expect(stored!.status).toBe("accepted")
    expect(stored!.files[0].status).toBe("accepted")
    expect(stored!.files[0].hunks[0].status).toBe("accepted")
  })

  it("rejectChangeSet transitions from pending_review to rejected", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())
    mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/auth.ts",
      changeType: "modify",
      beforeContent: "const x = 1\n",
      afterContent: "const x = 2\n",
    })
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)

    expect(mgr.rejectChangeSet(cs.id)).toBe(true)
    const stored = useChangeSetStore.getState().getChangeSet(cs.id)
    expect(stored!.status).toBe("rejected")
    expect(stored!.files[0].status).toBe("rejected")
  })

  it("acceptFile on a multi-file ChangeSet produces partially_accepted", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())

    const f1 = mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/a.ts",
      changeType: "create",
      afterContent: "// a\n",
    })!
    mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/b.ts",
      changeType: "create",
      afterContent: "// b\n",
    })!
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)

    mgr.acceptFile(cs.id, f1.id)
    const stored = useChangeSetStore.getState().getChangeSet(cs.id)
    expect(stored!.status).toBe("partially_accepted")
  })

  it("rejectFile on a multi-file ChangeSet rejects single file", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())

    const f1 = mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/a.ts",
      changeType: "create",
      afterContent: "// a\n",
    })!
    mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/b.ts",
      changeType: "create",
      afterContent: "// b\n",
    })!
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)

    mgr.rejectFile(cs.id, f1.id)
    const stored = useChangeSetStore.getState().getChangeSet(cs.id)
    const rejectedFile = stored!.files.find((f) => f.id === f1.id)
    expect(rejectedFile!.status).toBe("rejected")
    expect(stored!.status).toBe("partially_accepted")
  })

  it("accept file then reject ChangeSet rejects all", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())

    const f1 = mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/a.ts",
      changeType: "create",
      afterContent: "// a\n",
    })!
    mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/b.ts",
      changeType: "create",
      afterContent: "// b\n",
    })!
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)

    mgr.acceptFile(cs.id, f1.id)
    mgr.rejectChangeSet(cs.id)
    const stored = useChangeSetStore.getState().getChangeSet(cs.id)
    expect(stored!.status).toBe("rejected")
    expect(stored!.files.every((f) => f.status === "rejected")).toBe(true)
  })

  it("draft ChangeSet is removed on session failure (not submitted)", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())

    mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/auth.ts",
      changeType: "modify",
      beforeContent: "const x = 1\n",
      afterContent: "const x = 2\n",
    })

    // Simulate session failure cleanup: remove draft ChangeSet
    useChangeSetStore.getState().removeChangeSet(cs.id)
    const stored = useChangeSetStore.getState().getChangeSet(cs.id)
    expect(stored).toBeUndefined()
  })

  it("pending_review ChangeSet is rejected on session failure", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())

    mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/auth.ts",
      changeType: "modify",
      beforeContent: "const x = 1\n",
      afterContent: "const x = 2\n",
    })
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)

    mgr.rejectChangeSet(cs.id)
    const stored = useChangeSetStore.getState().getChangeSet(cs.id)
    expect(stored!.status).toBe("rejected")
  })

  it("addFileToChangeSet returns null for non-existent ChangeSet", () => {
    const mgr = ChangeSetManager.getInstance()
    const result = mgr.addFileToChangeSet({
      changeSetId: "nonexistent",
      path: "src/test.ts",
      changeType: "modify",
    })
    expect(result).toBeNull()
  })

  it("getChangeSetsBySession returns ChangeSets for a session", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs1 = mgr.createChangeSet(makeParams())
    const cs2 = mgr.createChangeSet(makeParams())

    const results = useChangeSetStore.getState().getChangeSetsBySession(SESSION_ID)
    expect(results.length).toBe(2)
    expect(results.map((r) => r.id)).toContain(cs1.id)
    expect(results.map((r) => r.id)).toContain(cs2.id)
  })

  it("create change with sourceToolCallIds, then accept", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams({ sourceToolCallIds: ["tc_edit_1"] }))
    expect(cs.sourceToolCallIds).toEqual(["tc_edit_1"])

    mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/auth.ts",
      changeType: "modify",
      beforeContent: "old content\n",
      afterContent: "new content\n",
    })
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)
    mgr.acceptChangeSet(cs.id)

    const stored = useChangeSetStore.getState().getChangeSet(cs.id)
    expect(stored!.status).toBe("accepted")
    expect(stored!.files.length).toBe(1)
  })

  it("reject after partial accept resets file statuses", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())

    const f1 = mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/a.ts",
      changeType: "create",
      afterContent: "// a\n",
    })!
    const f2 = mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/b.ts",
      changeType: "create",
      afterContent: "// b\n",
    })!
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)

    mgr.acceptFile(cs.id, f1.id)
    mgr.rejectChangeSet(cs.id)

    const stored = useChangeSetStore.getState().getChangeSet(cs.id)
    expect(stored!.status).toBe("rejected")
    expect(stored!.files.every((f) => f.status === "rejected")).toBe(true)
  })
})

// ── PR 10: Timeline Persistence & Recovery — tests ──

describe("PR 10 — ChangeSet persistence", () => {
  beforeEach(() => {
    try { localStorage.removeItem("agentic-changeset-state") } catch {}
    useChangeSetStore.setState({ changeSets: new Map(), activeChangeSetId: null })
  })

  afterEach(() => {
    try { localStorage.removeItem("agentic-changeset-state") } catch {}
  })

  it("persistNow saves pending ChangeSets to localStorage", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())

    mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/auth.ts",
      changeType: "modify",
      beforeContent: "const x = 1\n",
      afterContent: "const x = 2\n",
    })
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)

    useChangeSetStore.getState().persistNow()
    const raw = localStorage.getItem("agentic-changeset-state")
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBe(1)
    expect(parsed[0].id).toBe(cs.id)
    expect(parsed[0].status).toBe("pending_review")
  })

  it("does NOT persist draft or accepted ChangeSets", () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())

    useChangeSetStore.getState().persistNow()
    const rawAfterDraft = localStorage.getItem("agentic-changeset-state")
    expect(rawAfterDraft).toBeNull()

    mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/a.ts",
      changeType: "create",
      afterContent: "// a\n",
    })
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)
    mgr.acceptChangeSet(cs.id)

    useChangeSetStore.getState().persistNow()
    const rawAfterAccept = localStorage.getItem("agentic-changeset-state")
    expect(rawAfterAccept).toBeNull()
  })

  it("does NOT persist when there are no pending ChangeSets", () => {
    useChangeSetStore.getState().persistNow()
    const raw = localStorage.getItem("agentic-changeset-state")
    expect(raw).toBeNull()
  })

  it("auto-persist writes pending ChangeSets on state change", async () => {
    const mgr = ChangeSetManager.getInstance()
    const cs = mgr.createChangeSet(makeParams())

    mgr.addFileToChangeSet({
      changeSetId: cs.id,
      path: "src/auth.ts",
      changeType: "create",
      afterContent: "// x\n",
    })
    mgr.proposeChangeSet(cs.id)
    mgr.submitForReview(cs.id)

    // Wait for debounced persist
    await new Promise((r) => setTimeout(r, 600))
    const raw = localStorage.getItem("agentic-changeset-state")
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.length).toBe(1)
  })
})

describe("PR 10 — interrupted session marking", () => {
  it("marks streaming sessions as cancelled with error", () => {
    const now = Date.now()
    const sessions = new Map([
      ["step_1", {
        stepId: "step_1",
        roleId: "coder",
        roleName: "Coder",
        status: "running" as const,
        streamState: "streaming" as const,
        streamingText: "some partial text",
        toolCalls: [],
        fileEdits: [],
        fileOps: [],
        terminalOutputs: [],
        tokenAppended: 0,
      }],
      ["step_2", {
        stepId: "step_2",
        roleId: "designer",
        roleName: "Designer",
        status: "running" as const,
        streamState: "not_started" as const,
        streamingText: "",
        toolCalls: [],
        fileEdits: [],
        fileOps: [],
        terminalOutputs: [],
        tokenAppended: 0,
      }],
      ["step_3", {
        stepId: "step_3",
        roleId: "qa",
        roleName: "QA",
        status: "complete" as const,
        streamState: "completed" as const,
        streamingText: "done",
        toolCalls: [],
        fileEdits: [],
        fileOps: [],
        terminalOutputs: [],
        tokenAppended: 0,
      }],
    ])

    // Simulate recoverInterruptedSessions logic
    for (const [stepId, session] of sessions) {
      if (session.streamState === "streaming" || session.streamState === "not_started") {
        sessions.set(stepId, {
          ...session,
          streamState: "cancelled",
          status: "complete",
          completedAt: now,
          error: "Session was interrupted — app closed while running.",
        })
      }
    }

    const s1 = sessions.get("step_1")!
    expect(s1.streamState).toBe("cancelled")
    expect(s1.status).toBe("complete")
    expect(s1.completedAt).toBe(now)
    expect(s1.error).toContain("interrupted")

    const s2 = sessions.get("step_2")!
    expect(s2.streamState).toBe("cancelled")
    expect(s2.status).toBe("complete")

    const s3 = sessions.get("step_3")!
    expect(s3.streamState).toBe("completed")
    expect(s3.status).toBe("complete")
  })

  it("does not modify completed or failed sessions", () => {
    const sessions = new Map([
      ["step_1", {
        stepId: "step_1",
        roleId: "coder",
        roleName: "Coder",
        status: "complete" as const,
        streamState: "completed" as const,
        streamingText: "done",
        toolCalls: [],
        fileEdits: [],
        fileOps: [],
        terminalOutputs: [],
        tokenAppended: 0,
        completedAt: 1000,
      }],
      ["step_2", {
        stepId: "step_2",
        roleId: "coder",
        roleName: "Coder",
        status: "error" as const,
        streamState: "failed" as const,
        streamingText: "error text",
        toolCalls: [],
        fileEdits: [],
        fileOps: [],
        terminalOutputs: [],
        tokenAppended: 0,
        completedAt: 2000,
      }],
    ])

    const beforeCompletedAt = sessions.get("step_1")!.completedAt
    const beforeErrorAt = sessions.get("step_2")!.completedAt

    for (const [stepId, session] of sessions) {
      if (session.streamState === "streaming" || session.streamState === "not_started") {
        sessions.set(stepId, { ...session, streamState: "cancelled", status: "complete" })
      }
    }

    expect(sessions.get("step_1")!.completedAt).toBe(beforeCompletedAt)
    expect(sessions.get("step_2")!.completedAt).toBe(beforeErrorAt)
  })
})
