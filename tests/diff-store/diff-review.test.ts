import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMockStorage } from "../e2e/helpers/workspace-test-utils"

const writeFileMock = vi.fn(async () => {})
const existsMock = vi.fn(async () => true)
const readFileMock = vi.fn(async () => "")

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

describe("diff review helpers", () => {
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
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("buildDiffFileEntry creates a unified diff with tracked hunks", async () => {
    const { buildDiffFileEntry } = await import("@/lib/diff-review")

    const entry = buildDiffFileEntry(
      "src/test.ts",
      "const value = 1\nconsole.log(value)\n",
      "const value = 2\nconsole.log(value)\n",
    )

    expect(entry.rawDiff).toContain("--- a/src/test.ts")
    expect(entry.rawDiff).toContain("+++ b/src/test.ts")
    expect(entry.rawDiff).toContain("@@")
    expect(entry.hunks).toHaveLength(1)
    expect(entry.hunks[0].additions).toBeGreaterThan(0)
    expect(entry.hunks[0].deletions).toBeGreaterThan(0)
  })

  it("rejectDiffReviewFile writes original content and updates stores", async () => {
    const { buildDiffFileEntry, rejectDiffReviewFile } = await import("@/lib/diff-review")
    const { useDiffStore } = await import("@/stores/diff-store")
    const { useWorkspaceStore } = await import("@/stores/workspace-store")

    useDiffStore.getState().addFileDiff(
      buildDiffFileEntry("src/test.ts", "before\n", "after\n"),
    )

    const success = await rejectDiffReviewFile("src/test.ts")

    expect(success).toBe(true)
    expect(writeFileMock).toHaveBeenCalledWith("C:\\workspace\\src\\test.ts", "before\n")
    expect(useDiffStore.getState().files.get("src/test.ts")?.status).toBe("rejected")
    expect(useWorkspaceStore.getState().openFiles.find((file) => file.path === "src/test.ts")?.content).toBe("before\n")
    expect(useWorkspaceStore.getState().lastEditedFile).toBe("src/test.ts")
  })

  it("rejectDiffReviewHunk reverts only the targeted hunk", async () => {
    const {
      buildDiffFileEntry,
      rejectDiffReviewHunk,
      getReviewedContent,
    } = await import("@/lib/diff-review")
    const { useDiffStore } = await import("@/stores/diff-store")
    const { useWorkspaceStore } = await import("@/stores/workspace-store")

    const original = [
      "line-1",
      "line-2",
      "line-3",
      "line-4",
      "line-5",
      "line-6",
      "line-7",
      "line-8",
      "line-9",
      "line-10",
      "line-11",
      "line-12",
    ].join("\n")
    const modified = [
      "line-1",
      "line-2 updated",
      "line-3",
      "line-4",
      "line-5",
      "line-6",
      "line-7",
      "line-8",
      "line-9",
      "line-10 updated",
      "line-11",
      "line-12",
    ].join("\n")

    const entry = buildDiffFileEntry("src/test.ts", original, modified)
    expect(entry.hunks).toHaveLength(2)
    useDiffStore.getState().addFileDiff(entry)

    const success = await rejectDiffReviewHunk("src/test.ts", 0)
    const updatedEntry = useDiffStore.getState().files.get("src/test.ts")

    expect(success).toBe(true)
    expect(updatedEntry?.status).toBe("pending")
    expect(updatedEntry?.hunks[0].status).toBe("rejected")
    expect(updatedEntry?.hunks[1].status).toBe("pending")

    const reviewedContent = updatedEntry ? getReviewedContent(updatedEntry) : ""
    expect(reviewedContent).toContain("line-2")
    expect(reviewedContent).not.toContain("line-2 updated")
    expect(reviewedContent).toContain("line-10 updated")
    expect(writeFileMock).toHaveBeenLastCalledWith("C:\\workspace\\src\\test.ts", reviewedContent)
    expect(useWorkspaceStore.getState().openFiles.find((file) => file.path === "src/test.ts")?.content).toBe(reviewedContent)
  })
})
