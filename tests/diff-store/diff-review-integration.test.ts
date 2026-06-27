import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMockStorage } from "../e2e/helpers/workspace-test-utils"

const writeFileMock = vi.fn(async () => {})
const existsMock = vi.fn(async () => true)
const readFileMock = vi.fn(async (path: string) => "")

vi.mock("@/lib/filesystem", async () => {
  const actual = await vi.importActual<typeof import("@/lib/filesystem")>("@/lib/filesystem")
  return {
    ...actual,
    writeFile: writeFileMock,
    readFile: readFileMock,
  }
})

vi.mock("@/lib/electron-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/electron-api")>("@/lib/electron-api")
  return {
    ...actual,
    exists: existsMock,
  }
})

describe("diff review integration — partial accept/reject flow", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubGlobal("localStorage", createMockStorage())

    const { useDiffStore } = await import("@/stores/diff-store")
    const { useWorkspaceStore } = await import("@/stores/workspace-store")

    useDiffStore.getState().clear()
    useWorkspaceStore.setState({
      rootPath: "C:\\workspace",
      openFiles: [],
      activeFilePath: null,
      lastEditedFile: null,
    })

    // Default edge case mocks: file exists, content matches original
    existsMock.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("accept one hunk, reject the other — mixed state produces correct merged output", async () => {
    const {
      buildDiffFileEntry,
      acceptDiffReviewHunk,
      rejectDiffReviewHunk,
      getReviewedContent,
    } = await import("@/lib/diff-review")
    const { useDiffStore } = await import("@/stores/diff-store")

    // Changes on lines 2 and 10 — well beyond CONTEXT_LINES*2=6 threshold
    const original = [
      "line-01",
      "line-02",
      "line-03",
      "line-04",
      "line-05",
      "line-06",
      "line-07",
      "line-08",
      "line-09",
      "line-10",
      "line-11",
      "line-12",
      "line-13",
      "line-14",
      "line-15",
    ].join("\n")

    const modified = [
      "LINE-01 modified",
      "line-02",
      "line-03",
      "line-04",
      "line-05",
      "line-06",
      "line-07",
      "line-08",
      "line-09",
      "LINE-10 modified",
      "line-11",
      "line-12",
      "line-13",
      "line-14",
      "line-15",
    ].join("\n")

    const entry = buildDiffFileEntry("src/greetings.ts", original, modified)
    expect(entry.hunks).toHaveLength(2)
    useDiffStore.getState().addFileDiff(entry)

    // Initially all pending
    let current = useDiffStore.getState().files.get("src/greetings.ts")!
    expect(current.status).toBe("pending")
    expect(current.hunks.every((h) => h.status === "pending")).toBe(true)

    // Accept hunk 0
    await acceptDiffReviewHunk("src/greetings.ts", 0)
    current = useDiffStore.getState().files.get("src/greetings.ts")!
    expect(current.hunks[0].status).toBe("accepted")
    expect(current.hunks[1].status).toBe("pending")
    expect(current.status).toBe("pending")

    // Derived content should contain hunk 0's changes but not hunk 1's
    const afterFirstAccept = getReviewedContent(current)
    expect(afterFirstAccept).toContain("LINE-01 modified")
    expect(afterFirstAccept).not.toContain("line-01")

    // Reject hunk 1
    await rejectDiffReviewHunk("src/greetings.ts", 1)
    current = useDiffStore.getState().files.get("src/greetings.ts")!
    expect(current.hunks[0].status).toBe("accepted")
    expect(current.hunks[1].status).toBe("rejected")
    expect(current.status).toBe("pending")

    // Derived content should have hunk 0's changes but hunk 1's original
    const mixedContent = getReviewedContent(current)
    expect(mixedContent).toContain("LINE-01 modified")
    expect(mixedContent).toContain("line-10")
    expect(mixedContent).not.toContain("LINE-10 modified")

    // Now accept hunk 1 too
    await acceptDiffReviewHunk("src/greetings.ts", 1)
    current = useDiffStore.getState().files.get("src/greetings.ts")!
    expect(current.hunks[0].status).toBe("accepted")
    expect(current.hunks[1].status).toBe("accepted")
    expect(current.status).toBe("accepted")

    const allAccepted = getReviewedContent(current)
    expect(allAccepted).toContain("LINE-01 modified")
    expect(allAccepted).toContain("LINE-10 modified")

    expect(writeFileMock).toHaveBeenCalledTimes(3)
  })

  it("acceptAll after partial decisions accepts everything", async () => {
    const {
      buildDiffFileEntry,
      acceptDiffReviewHunk,
      acceptAllDiffReviews,
    } = await import("@/lib/diff-review")
    const { useDiffStore } = await import("@/stores/diff-store")

    const entry = buildDiffFileEntry(
      "src/test.ts",
      "line1\nline2\nline3\n",
      "line1\nline2 modified\nline3\n",
    )
    useDiffStore.getState().addFileDiff(entry)

    // Accept first hunk
    await acceptDiffReviewHunk("src/test.ts", 0)

    // Now accept all
    await acceptAllDiffReviews()

    const current = useDiffStore.getState().files.get("src/test.ts")!
    expect(current.status).toBe("accepted")
    expect(current.hunks.every((h) => h.status === "accepted")).toBe(true)
  })

  it("rejectAll after partial decisions rejects everything", async () => {
    const {
      buildDiffFileEntry,
      acceptDiffReviewHunk,
      rejectAllDiffReviews,
    } = await import("@/lib/diff-review")
    const { useDiffStore } = await import("@/stores/diff-store")

    const entry = buildDiffFileEntry(
      "src/test.ts",
      "line1\nline2\nline3\n",
      "line1\nline2 modified\nline3\n",
    )
    useDiffStore.getState().addFileDiff(entry)

    // Accept first hunk
    await acceptDiffReviewHunk("src/test.ts", 0)

    // Now reject all
    await rejectAllDiffReviews()

    const current = useDiffStore.getState().files.get("src/test.ts")!
    expect(current.status).toBe("rejected")
    expect(current.hunks.every((h) => h.status === "rejected")).toBe(true)

    // Content should be original
    expect(writeFileMock).toHaveBeenLastCalledWith(
      "C:\\workspace\\src\\test.ts",
      "line1\nline2\nline3\n",
    )
  })

  it("single-hunk file accept and reject work correctly", async () => {
    const {
      buildDiffFileEntry,
      acceptDiffReviewHunk,
      rejectDiffReviewHunk,
      getReviewedContent,
    } = await import("@/lib/diff-review")
    const { useDiffStore } = await import("@/stores/diff-store")

    const entry = buildDiffFileEntry(
      "src/test.ts",
      "old content\n",
      "new content\n",
    )
    expect(entry.hunks).toHaveLength(1)
    useDiffStore.getState().addFileDiff(entry)

    // Accept single hunk
    await acceptDiffReviewHunk("src/test.ts", 0)
    let current = useDiffStore.getState().files.get("src/test.ts")!
    expect(current.status).toBe("accepted")
    expect(getReviewedContent(current)).toBe("new content\n")

    // Revert by rejecting all
    await rejectDiffReviewHunk("src/test.ts", 0)
    current = useDiffStore.getState().files.get("src/test.ts")!
    expect(current.status).toBe("rejected")
    expect(getReviewedContent(current)).toBe("old content\n")
  })

  it("toggle hunk between accepted and rejected", async () => {
    const {
      buildDiffFileEntry,
      acceptDiffReviewHunk,
      rejectDiffReviewHunk,
    } = await import("@/lib/diff-review")
    const { useDiffStore } = await import("@/stores/diff-store")

    const entry = buildDiffFileEntry(
      "src/test.ts",
      "a\n",
      "b\n",
    )
    useDiffStore.getState().addFileDiff(entry)

    // Accept
    await acceptDiffReviewHunk("src/test.ts", 0)
    expect(useDiffStore.getState().files.get("src/test.ts")!.hunks[0].status).toBe("accepted")

    // Reject (toggle)
    await rejectDiffReviewHunk("src/test.ts", 0)
    expect(useDiffStore.getState().files.get("src/test.ts")!.hunks[0].status).toBe("rejected")

    // Accept again
    await acceptDiffReviewHunk("src/test.ts", 0)
    expect(useDiffStore.getState().files.get("src/test.ts")!.hunks[0].status).toBe("accepted")

    // 3 writes total (accept, reject, accept)
    expect(writeFileMock).toHaveBeenCalledTimes(3)
  })

  it("adjacent hunks can be applied independently", async () => {
    const {
      buildDiffFileEntry,
      acceptDiffReviewHunk,
      rejectDiffReviewHunk,
      getReviewedContent,
    } = await import("@/lib/diff-review")
    const { useDiffStore } = await import("@/stores/diff-store")

    // Changes on lines 2 and 10 — 8 lines apart, past merge threshold
    const original = [
      "line-01", "line-02", "line-03", "line-04", "line-05",
      "line-06", "line-07", "line-08", "line-09", "line-10",
      "line-11", "line-12", "line-13", "line-14", "line-15",
    ].join("\n")
    const modified = [
      "line-01", "LINE-02 modified", "line-03", "line-04", "line-05",
      "line-06", "line-07", "line-08", "line-09", "LINE-10 modified",
      "line-11", "line-12", "line-13", "line-14", "line-15",
    ].join("\n")
    const entry = buildDiffFileEntry("src/tight.ts", original, modified)
    expect(entry.hunks).toHaveLength(2)
    useDiffStore.getState().addFileDiff(entry)

    // Accept first hunk only
    readFileMock.mockResolvedValue(original)
    await acceptDiffReviewHunk("src/tight.ts", 0)
    let current = useDiffStore.getState().files.get("src/tight.ts")!
    expect(current.hunks[0].status).toBe("accepted")
    expect(current.hunks[1].status).toBe("pending")

    // With default pendingBehavior="modified", pending hunks show modified content
    let content = getReviewedContent(current)
    expect(content).toContain("LINE-02 modified")
    expect(content).toContain("LINE-10 modified")
    expect(content).not.toContain("line-10")

    // With pendingBehavior="original", pending hunks show original content
    content = getReviewedContent(current, "original")
    expect(content).toContain("LINE-02 modified")
    expect(content).toContain("line-10")
    expect(content).not.toContain("LINE-10 modified")

    // Accept second hunk independently
    readFileMock.mockResolvedValue(original)
    await acceptDiffReviewHunk("src/tight.ts", 1)
    current = useDiffStore.getState().files.get("src/tight.ts")!
    expect(current.hunks[0].status).toBe("accepted")
    expect(current.hunks[1].status).toBe("accepted")

    content = getReviewedContent(current)
    expect(content).toContain("LINE-02 modified")
    expect(content).toContain("LINE-10 modified")

    // Reject second hunk independently
    readFileMock.mockResolvedValue(original)
    await rejectDiffReviewHunk("src/tight.ts", 1)
    current = useDiffStore.getState().files.get("src/tight.ts")!
    expect(current.hunks[0].status).toBe("accepted")
    expect(current.hunks[1].status).toBe("rejected")

    content = getReviewedContent(current)
    expect(content).toContain("LINE-02 modified")
    expect(content).toContain("line-10")
    expect(content).not.toContain("LINE-10 modified")
  })

  it("edge case: file deleted during review logs warning but still writes", async () => {
    const { buildDiffFileEntry, acceptDiffReviewHunk } = await import("@/lib/diff-review")
    const { useDiffStore } = await import("@/stores/diff-store")

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const entry = buildDiffFileEntry(
      "src/test.ts", "old\ncontent\n", "new\ncontent\n",
    )
    useDiffStore.getState().addFileDiff(entry)

    // File doesn't exist on disk
    existsMock.mockResolvedValue(false)

    await acceptDiffReviewHunk("src/test.ts", 0)

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("no longer exists"),
    )
    expect(writeFileMock).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it("edge case: external modification during review logs warning but still writes", async () => {
    const { buildDiffFileEntry, acceptDiffReviewHunk } = await import("@/lib/diff-review")
    const { useDiffStore } = await import("@/stores/diff-store")

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const entry = buildDiffFileEntry(
      "src/test.ts", "old\ncontent\n", "new\ncontent\n",
    )
    useDiffStore.getState().addFileDiff(entry)

    // Current file content differs from original
    existsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue("different\ncontent\n")

    await acceptDiffReviewHunk("src/test.ts", 0)

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("modified externally"),
    )
    expect(writeFileMock).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it("edge case: dirty buffer during review logs warning but still writes", async () => {
    const { buildDiffFileEntry, acceptDiffReviewHunk } = await import("@/lib/diff-review")
    const { useDiffStore } = await import("@/stores/diff-store")
    const { useWorkspaceStore } = await import("@/stores/workspace-store")

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const entry = buildDiffFileEntry(
      "src/dirty-file.ts", "old\n", "new\n",
    )
    useDiffStore.getState().addFileDiff(entry)

    // File is open and dirty in editor
    useWorkspaceStore.setState({
      openFiles: [{ path: "src/dirty-file.ts", name: "dirty-file.ts", content: "unsaved\n", isDirty: true }],
    })

    await acceptDiffReviewHunk("src/dirty-file.ts", 0)

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("unsaved changes"),
    )
    expect(writeFileMock).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it("acceptDiffReviewFile works alongside partial hunk operations", async () => {
    const {
      buildDiffFileEntry,
      acceptDiffReviewHunk,
      acceptDiffReviewFile,
    } = await import("@/lib/diff-review")
    const { useDiffStore } = await import("@/stores/diff-store")

    // Two hunks with changes 9 lines apart to stay separate
    const original = [
      "line-1", "line-2", "line-3", "line-4", "line-5",
      "line-6", "line-7", "line-8", "line-9", "line-10",
      "line-11", "line-12",
    ].join("\n")
    const modified = [
      "LINE-1 modified", "line-2", "line-3", "line-4", "line-5",
      "line-6", "line-7", "line-8", "line-9", "LINE-10 modified",
      "line-11", "line-12",
    ].join("\n")
    const entry = buildDiffFileEntry("src/test.ts", original, modified)
    useDiffStore.getState().addFileDiff(entry)
    expect(entry.hunks).toHaveLength(2)

    // Accept hunk 0 partially
    await acceptDiffReviewHunk("src/test.ts", 0)

    // File-level accept should override partial state
    await acceptDiffReviewFile("src/test.ts")
    const current = useDiffStore.getState().files.get("src/test.ts")!
    expect(current.status).toBe("accepted")
    expect(current.hunks.every((h) => h.status === "accepted")).toBe(true)

    // Content should be full modified
    expect(writeFileMock).toHaveBeenLastCalledWith(
      "C:\\workspace\\src\\test.ts",
      modified,
    )
  })
})
