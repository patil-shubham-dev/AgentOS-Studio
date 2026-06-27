import { computeDiff, generateUnifiedDiff, type UnifiedDiffHunk } from "@/lib/diff-engine"
import { writeFile, readFile } from "@/lib/filesystem"
import { exists } from "@/lib/electron-api"
import { useDiffStore, type DiffFileEntry, type DiffHunkStatus } from "@/stores/diff-store"
import { useWorkspaceStore } from "@/stores/workspace-store"

export type DiffReviewSource = DiffFileEntry["source"]
type PendingBehavior = "modified" | "original"

function normalizeWorkspacePath(path: string): string {
  return path.replace(/\\/g, "/")
}

function buildHunkStatuses(originalContent: string, modifiedContent: string): DiffHunkStatus[] {
  return computeDiff(originalContent, modifiedContent).map((hunk, index) => ({
    hunkIndex: index,
    header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    status: "pending",
    additions: hunk.lines.filter((line) => line.startsWith("+")).length,
    deletions: hunk.lines.filter((line) => line.startsWith("-")).length,
  }))
}

function toAbsoluteWorkspacePath(rootPath: string | null, relativePath: string): string {
  if (!rootPath) return relativePath
  const normalizedRoot = rootPath.replace(/[\\/]+$/, "")
  return `${normalizedRoot}\\${relativePath.replace(/\//g, "\\")}`
}

function getOriginalLinesForHunk(hunk: UnifiedDiffHunk): string[] {
  return hunk.lines
    .filter((line) => !line.startsWith("+"))
    .map((line) => line.slice(1))
}

function getModifiedLinesForHunk(hunk: UnifiedDiffHunk): string[] {
  return hunk.lines
    .filter((line) => !line.startsWith("-"))
    .map((line) => line.slice(1))
}

function withUpdatedHunkStatus(
  entry: DiffFileEntry,
  hunkIndex: number,
  status: DiffHunkStatus["status"],
): DiffFileEntry | null {
  if (hunkIndex < 0 || hunkIndex >= entry.hunks.length) {
    return null
  }

  const hunks = entry.hunks.map((hunk) =>
    hunk.hunkIndex === hunkIndex ? { ...hunk, status } : hunk,
  )

  const allAccepted = hunks.every((hunk) => hunk.status === "accepted")
  const allRejected = hunks.every((hunk) => hunk.status === "rejected")

  return {
    ...entry,
    hunks,
    status: allAccepted ? "accepted" : allRejected ? "rejected" : "pending",
  }
}

function getResolvedHunkLines(
  hunk: UnifiedDiffHunk,
  status: DiffHunkStatus["status"],
  pendingBehavior: PendingBehavior,
): string[] {
  if (status === "accepted") {
    return getModifiedLinesForHunk(hunk)
  }
  if (status === "rejected") {
    return getOriginalLinesForHunk(hunk)
  }
  return pendingBehavior === "modified"
    ? getModifiedLinesForHunk(hunk)
    : getOriginalLinesForHunk(hunk)
}

export function getReviewedContent(
  entry: DiffFileEntry,
  pendingBehavior: PendingBehavior = "modified",
): string {
  const hunks = computeDiff(entry.originalContent, entry.modifiedContent)
  if (hunks.length === 0) {
    return pendingBehavior === "modified" ? entry.modifiedContent : entry.originalContent
  }

  // Process hunks in reverse order to avoid index shifting
  let result = entry.originalContent
  for (let i = hunks.length - 1; i >= 0; i--) {
    const hunk = hunks[i]
    const hunkState = entry.hunks.find((candidate) => candidate.hunkIndex === i)
    const oldStart = Math.max(0, hunk.oldStart - 1)
    const oldEnd = oldStart + hunk.oldLines

    const resolvedLines = getResolvedHunkLines(
      hunk,
      hunkState?.status ?? "pending",
      pendingBehavior,
    )
    const originalLines = result.split("\n")

    const before = originalLines.slice(0, oldStart)
    const after = originalLines.slice(oldEnd)

    result = [...before, ...resolvedLines, ...after].join("\n")
  }

  return result
}

function setDiffEntry(entry: DiffFileEntry): void {
  useDiffStore.getState().addFileDiff(entry)
}

function getDirtyBufferWarning(entry: DiffFileEntry): string | null {
  const { openFiles } = useWorkspaceStore.getState()
  const openFile = openFiles.find(f => f.path === entry.path)
  if (openFile?.isDirty) {
    return `File "${entry.path}" has unsaved changes in the editor. Applying diff may conflict with unsaved content.`
  }
  return null
}

async function checkExternalModification(entry: DiffFileEntry): Promise<string | null> {
  const workspaceStore = useWorkspaceStore.getState()
  const absolutePath = toAbsoluteWorkspacePath(workspaceStore.rootPath, entry.path)

  const fileExists = await exists(absolutePath)
  if (!fileExists) {
    return `File "${entry.path}" no longer exists on disk. The reviewed content will still be written.`
  }

  const currentContent = await readFile(absolutePath)
  if (currentContent !== entry.originalContent) {
    return `File "${entry.path}" was modified externally or by the editor after the review was generated. Applying the diff may partially overwrite those changes.`
  }

  return null
}

async function syncReviewedEntry(entry: DiffFileEntry, pendingBehavior: PendingBehavior): Promise<boolean> {
  const workspaceStore = useWorkspaceStore.getState()
  const absolutePath = toAbsoluteWorkspacePath(workspaceStore.rootPath, entry.path)

  const dirtyWarning = getDirtyBufferWarning(entry)
  if (dirtyWarning) {
    console.warn(dirtyWarning)
  }

  const modWarning = await checkExternalModification(entry)
  if (modWarning) {
    console.warn(modWarning)
  }

  const reviewedContent = getReviewedContent(entry, pendingBehavior)

  await writeFile(absolutePath, reviewedContent)
  setDiffEntry(entry)
  workspaceStore.notifyFileEdited(entry.path, reviewedContent)
  return true
}

export function buildDiffFileEntry(
  path: string,
  originalContent: string,
  modifiedContent: string,
  source: DiffReviewSource = "agent",
): DiffFileEntry {
  const normalizedPath = normalizeWorkspacePath(path)
  return {
    path: normalizedPath,
    originalContent,
    modifiedContent,
    rawDiff: generateUnifiedDiff(originalContent, modifiedContent, normalizedPath),
    hunks: buildHunkStatuses(originalContent, modifiedContent),
    status: "pending",
    createdAt: Date.now(),
    source,
  }
}

async function commitDiffEntry(entry: DiffFileEntry, content: string): Promise<boolean> {
  const workspaceStore = useWorkspaceStore.getState()
  const absolutePath = toAbsoluteWorkspacePath(workspaceStore.rootPath, entry.path)

  await writeFile(absolutePath, content)
  setDiffEntry(entry)
  workspaceStore.notifyFileEdited(entry.path, content)
  return true
}

async function commitDiffDecision(path: string, content: string, accepted: boolean): Promise<boolean> {
  const entry = useDiffStore.getState().files.get(path)
  if (!entry) return false

  const nextEntry: DiffFileEntry = {
    ...entry,
    status: accepted ? "accepted" : "rejected",
    hunks: entry.hunks.map((hunk) => ({
      ...hunk,
      status: accepted ? "accepted" : "rejected",
    })),
  }
  return commitDiffEntry(nextEntry, content)
}

export async function acceptDiffReviewFile(path: string): Promise<boolean> {
  const normalizedPath = normalizeWorkspacePath(path)
  const entry = useDiffStore.getState().files.get(normalizedPath)
  if (!entry) return false
  return commitDiffDecision(normalizedPath, entry.modifiedContent, true)
}

export async function rejectDiffReviewFile(path: string): Promise<boolean> {
  const normalizedPath = normalizeWorkspacePath(path)
  const entry = useDiffStore.getState().files.get(normalizedPath)
  if (!entry) return false
  return commitDiffDecision(normalizedPath, entry.originalContent, false)
}

export async function acceptDiffReviewHunk(path: string, hunkIndex: number): Promise<boolean> {
  const normalizedPath = normalizeWorkspacePath(path)
  const entry = useDiffStore.getState().files.get(normalizedPath)
  if (!entry) return false

  const nextEntry = withUpdatedHunkStatus(entry, hunkIndex, "accepted")
  if (!nextEntry) return false

  return syncReviewedEntry(nextEntry, "modified")
}

export async function rejectDiffReviewHunk(path: string, hunkIndex: number): Promise<boolean> {
  const normalizedPath = normalizeWorkspacePath(path)
  const entry = useDiffStore.getState().files.get(normalizedPath)
  if (!entry) return false

  const nextEntry = withUpdatedHunkStatus(entry, hunkIndex, "rejected")
  if (!nextEntry) return false

  return syncReviewedEntry(nextEntry, "modified")
}

export async function acceptAllDiffReviews(): Promise<void> {
  const paths = Array.from(useDiffStore.getState().files.keys())
  for (const path of paths) {
    await acceptDiffReviewFile(path)
  }
}

export async function rejectAllDiffReviews(): Promise<void> {
  const paths = Array.from(useDiffStore.getState().files.keys())
  for (const path of paths) {
    await rejectDiffReviewFile(path)
  }
}
