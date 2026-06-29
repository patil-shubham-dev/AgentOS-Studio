import { computeDiff, generateUnifiedDiff, type UnifiedDiffHunk } from "@/lib/diff-engine"
import { writeFile, readFile } from "@/lib/filesystem"
import { exists } from "@/lib/electron-api"
import { FileHistoryManager } from "@/lib/file-history"
import { useDiffStore, type DiffFileEntry, type DiffHunkStatus } from "@/stores/diff-store"
import { useWorkspaceStore } from "@/stores/workspace-store"

export type DiffReviewSource = DiffFileEntry["source"]
type PendingBehavior = "modified" | "original"

/**
 * Tracks the last content we wrote for each absolute file path.
 * Used by safety checks to distinguish "we wrote this" from "external modification".
 */
const MAX_WRITTEN_CONTENT = 1000
export const writtenContent = new Map<string, string>()

function setWrittenContent(absolutePath: string, content: string): void {
  if (writtenContent.size >= MAX_WRITTEN_CONTENT && !writtenContent.has(absolutePath)) {
    const key = writtenContent.keys().next().value
    if (key !== undefined) writtenContent.delete(key)
  }
  writtenContent.set(absolutePath, content)
}

function isOurLastWrite(absolutePath: string, currentContent: string): boolean {
  const last = writtenContent.get(absolutePath)
  return last !== undefined && last === currentContent
}

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
  baseContent?: string,
): string {
  const base = baseContent ?? entry.originalContent
  const hunks = computeDiff(entry.originalContent, entry.modifiedContent)
  if (hunks.length === 0) {
    return pendingBehavior === "modified" ? entry.modifiedContent : base
  }

  // Process hunks in reverse order to avoid index shifting
  let result = base
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
    return `File "${entry.path}" no longer exists on disk.`
  }

  const currentContent = await readFile(absolutePath)
  if (currentContent !== entry.originalContent) {
    return `File "${entry.path}" was modified externally or by the editor after the review was generated. Applying the diff may partially overwrite those changes.`
  }

  return null
}

async function syncReviewedEntry(entry: DiffFileEntry, pendingBehavior: PendingBehavior, force = false): Promise<boolean> {
  const workspaceStore = useWorkspaceStore.getState()
  const absolutePath = toAbsoluteWorkspacePath(workspaceStore.rootPath, entry.path)

  const dirtyWarning = getDirtyBufferWarning(entry)
  if (dirtyWarning && !force) {
    console.warn(dirtyWarning)
    return false
  }

  let currentContent: string | undefined
  if (!force) {
    const fileExists = await exists(absolutePath)
    if (!fileExists) {
      console.error(`[diff-review] Blocked write to "${entry.path}": file no longer exists on disk. Use force=true to override.`)
      return false
    }
    currentContent = await readFile(absolutePath)
    if (currentContent !== entry.originalContent && !isOurLastWrite(absolutePath, currentContent)) {
      console.error(`[diff-review] Blocked write to "${entry.path}": file was modified externally. Use force=true to override.`)
      return false
    }
  }

  // Pass actual file content as base so reviewed content is based on what's on disk,
  // not stale entry.originalContent — avoids incorrect merge results if file was modified.
  const reviewedContent = getReviewedContent(entry, pendingBehavior, currentContent)

  await writeFile(absolutePath, reviewedContent)
  setWrittenContent(absolutePath, reviewedContent)
  const updatedEntry = { ...entry, originalContent: reviewedContent }
  setDiffEntry(updatedEntry)
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

async function commitDiffEntry(entry: DiffFileEntry, content: string, force = false): Promise<boolean> {
  const workspaceStore = useWorkspaceStore.getState()
  const absolutePath = toAbsoluteWorkspacePath(workspaceStore.rootPath, entry.path)

  if (!force) {
    const fileExists = await exists(absolutePath)
    if (!fileExists) {
      console.error(`[diff-review] Blocked write to "${entry.path}": file no longer exists on disk. Use force=true to override.`)
      return false
    }
    const currentContent = await readFile(absolutePath)
    if (currentContent !== entry.originalContent && !isOurLastWrite(absolutePath, currentContent)) {
      console.error(`[diff-review] Blocked write to "${entry.path}": file was modified externally. Use force=true to override.`)
      return false
    }
  }

  // Create snapshot before writing so accepted diffs can be undone
  try {
    const history = FileHistoryManager.getInstance()
    await history.createSnapshot(absolutePath, content, `diff-review-${Date.now()}`)
  } catch (err) {
    console.warn(`[diff-review] Failed to create snapshot for ${absolutePath}:`, err)
  }

  await writeFile(absolutePath, content)
  setWrittenContent(absolutePath, content)
  setDiffEntry(entry)
  workspaceStore.notifyFileEdited(entry.path, content)
  return true
}

async function commitDiffDecision(path: string, content: string, accepted: boolean, force = false): Promise<boolean> {
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
  return commitDiffEntry(nextEntry, content, force)
}

export async function acceptDiffReviewFile(path: string, force = false): Promise<boolean> {
  const normalizedPath = normalizeWorkspacePath(path)
  const entry = useDiffStore.getState().files.get(normalizedPath)
  if (!entry) return false
  return commitDiffDecision(normalizedPath, entry.modifiedContent, true, force)
}

export async function rejectDiffReviewFile(path: string, force = false): Promise<boolean> {
  const normalizedPath = normalizeWorkspacePath(path)
  const entry = useDiffStore.getState().files.get(normalizedPath)
  if (!entry) return false
  return commitDiffDecision(normalizedPath, entry.originalContent, false, force)
}

export async function acceptDiffReviewHunk(path: string, hunkIndex: number, force = false): Promise<boolean> {
  const normalizedPath = normalizeWorkspacePath(path)
  const entry = useDiffStore.getState().files.get(normalizedPath)
  if (!entry) return false

  const nextEntry = withUpdatedHunkStatus(entry, hunkIndex, "accepted")
  if (!nextEntry) return false

  const result = await syncReviewedEntry(nextEntry, "modified", force)
  if (!result) return false
  return true
}

export async function rejectDiffReviewHunk(path: string, hunkIndex: number, force = false): Promise<boolean> {
  const normalizedPath = normalizeWorkspacePath(path)
  const entry = useDiffStore.getState().files.get(normalizedPath)
  if (!entry) return false

  const nextEntry = withUpdatedHunkStatus(entry, hunkIndex, "rejected")
  if (!nextEntry) return false

  const result = await syncReviewedEntry(nextEntry, "modified", force)
  if (!result) return false
  return true
}

export async function acceptAllDiffReviews(force = false): Promise<number> {
  const paths = Array.from(useDiffStore.getState().files.keys())
  let accepted = 0
  const results = await Promise.allSettled(paths.map((path) => acceptDiffReviewFile(path, force)))
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) accepted++
  }
  return accepted
}

export async function rejectAllDiffReviews(force = false): Promise<number> {
  const paths = Array.from(useDiffStore.getState().files.keys())
  let rejected = 0
  const results = await Promise.allSettled(paths.map((path) => rejectDiffReviewFile(path, force)))
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) rejected++
  }
  return rejected
}
