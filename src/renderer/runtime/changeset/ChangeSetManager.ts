import { readTextFile, writeTextFile, exists, mkdir } from "@/lib/electron-api"
import { computeDiff } from "@/lib/diff-engine"

function dirname(fp: string): string {
  const normalized = fp.replace(/\\/g, "/")
  const lastSep = normalized.lastIndexOf("/")
  return lastSep === -1 ? "." : normalized.slice(0, lastSep) || "/"
}
import {
  type ChangeSet,
  type ChangeSetFile,
  type DiffHunk,
  type DiffLine,
  type ChangeSetStatus,
  type ChangeSetFileStatus,
  type DiffHunkStatus,
  type ChangeType,
  createChangeSetId,
  createChangeSetFileId,
  createDiffHunkId,
} from "./types"
import { useChangeSetStore } from "./ChangeSetStore"

interface CreateChangeSetParams {
  sessionId: string
  correlationId: string
  title: string
  reason: string
  sourceToolCallIds?: string[]
}

interface AddFileParams {
  changeSetId: string
  path: string
  oldPath?: string
  changeType: ChangeType
  beforeContent?: string
  afterContent?: string
}

type ChangeSetEventCallback = (event: { type: string; changeSetId: string; files?: string[] }) => void

function simpleHash(content: string): string {
  if (!content) return ""
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

function convertUnifiedHunksToCanonical(
  original: string,
  modified: string,
  hunks: ReturnType<typeof computeDiff>
): DiffHunk[] {
  if (hunks.length === 0) return []

  const originalLines = original.split("\n")
  const modifiedLines = modified.split("\n")

  return hunks.map((hunk) => {
    const lines: DiffLine[] = []
    let localOldLine = hunk.oldStart
    let localNewLine = hunk.newStart

    for (const rawLine of hunk.lines) {
      if (rawLine.startsWith(" ")) {
        lines.push({ type: "context", oldLine: localOldLine, newLine: localNewLine, content: rawLine.slice(1) })
        localOldLine++
        localNewLine++
      } else if (rawLine.startsWith("-")) {
        lines.push({ type: "remove", oldLine: localOldLine, content: rawLine.slice(1) })
        localOldLine++
      } else if (rawLine.startsWith("+")) {
        lines.push({ type: "add", newLine: localNewLine, content: rawLine.slice(1) })
        localNewLine++
      }
    }

    return {
      id: createDiffHunkId(),
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      lines,
      status: "pending",
    }
  })
}

export class ChangeSetManager {
  private static instance: ChangeSetManager
  private listeners = new Set<ChangeSetEventCallback>()

  static getInstance(): ChangeSetManager {
    if (!ChangeSetManager.instance) {
      ChangeSetManager.instance = new ChangeSetManager()
    }
    return ChangeSetManager.instance
  }

  onEvent(cb: ChangeSetEventCallback): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(event: { type: string; changeSetId: string; files?: string[] }): void {
    for (const cb of this.listeners) {
      cb(event)
    }
  }

  createChangeSet(params: CreateChangeSetParams): ChangeSet {
    const id = createChangeSetId()
    const now = Date.now()
    const changeSet: ChangeSet = {
      id,
      sessionId: params.sessionId,
      correlationId: params.correlationId,
      title: params.title,
      reason: params.reason,
      status: "draft",
      files: [],
      sourceToolCallIds: params.sourceToolCallIds ?? [],
      createdAt: now,
      updatedAt: now,
    }
    useChangeSetStore.getState().addChangeSet(changeSet)
    this.emit({ type: "changeset_created", changeSetId: id, files: [] })
    return changeSet
  }

  addFileToChangeSet(params: AddFileParams): ChangeSetFile | null {
    const store = useChangeSetStore.getState()
    const changeSet = store.getChangeSet(params.changeSetId)
    if (!changeSet) return null
    if (changeSet.status !== "draft") return null

    const fileId = createChangeSetFileId()
    const beforeHash = params.beforeContent ? simpleHash(params.beforeContent) : undefined
    const afterHash = params.afterContent ? simpleHash(params.afterContent) : undefined

    let hunks: DiffHunk[] = []
    if (
      params.changeType === "modify" &&
      params.beforeContent !== undefined &&
      params.afterContent !== undefined
    ) {
      const computedHunks = computeDiff(params.beforeContent, params.afterContent)
      hunks = convertUnifiedHunksToCanonical(params.beforeContent, params.afterContent, computedHunks)
    }

    const file: ChangeSetFile = {
      id: fileId,
      path: params.path,
      oldPath: params.oldPath,
      changeType: params.changeType,
      beforeHash,
      afterHash,
      beforeContent: params.beforeContent,
      afterContent: params.afterContent,
      hunks,
      status: "pending",
    }

    const updatedFiles = [...changeSet.files, file]
    store.updateChangeSet(params.changeSetId, { files: updatedFiles, updatedAt: Date.now() })
    this.emit({ type: "changeset_file_added", changeSetId: params.changeSetId, files: [params.path] })
    return file
  }

  proposeChangeSet(changeSetId: string): boolean {
    return this.transitionStatus(changeSetId, "draft", "proposed")
  }

  submitForReview(changeSetId: string): boolean {
    return this.transitionStatus(changeSetId, "proposed", "pending_review")
  }

  acceptChangeSet(changeSetId: string): boolean {
    const store = useChangeSetStore.getState()
    const changeSet = store.getChangeSet(changeSetId)
    if (!changeSet) return false
    if (changeSet.status !== "pending_review" && changeSet.status !== "partially_accepted") return false

    const updatedFiles = changeSet.files.map((f) => ({
      ...f,
      status: "accepted" as ChangeSetFileStatus,
      hunks: f.hunks.map((h) => ({ ...h, status: "accepted" as DiffHunkStatus })),
    }))

    store.updateChangeSet(changeSetId, {
      status: "accepted",
      files: updatedFiles,
      updatedAt: Date.now(),
    })
    this.emit({ type: "changeset_accepted", changeSetId })
    return true
  }

  rejectChangeSet(changeSetId: string): boolean {
    if (!this.canTransition(useChangeSetStore.getState().getChangeSet(changeSetId), "rejected")) return false

    const store = useChangeSetStore.getState()
    const updatedFiles = (store.getChangeSet(changeSetId)?.files ?? []).map((f) => ({
      ...f,
      status: "rejected" as ChangeSetFileStatus,
      hunks: f.hunks.map((h) => ({ ...h, status: "rejected" as DiffHunkStatus })),
    }))

    store.updateChangeSet(changeSetId, {
      status: "rejected",
      files: updatedFiles,
      updatedAt: Date.now(),
    })
    this.emit({ type: "changeset_rejected", changeSetId })
    return true
  }

  acceptFile(changeSetId: string, fileId: string): boolean {
    const store = useChangeSetStore.getState()
    const changeSet = store.getChangeSet(changeSetId)
    if (!changeSet) return false
    if (changeSet.status !== "pending_review" && changeSet.status !== "partially_accepted") return false

    const updatedFiles = changeSet.files.map((f) => {
      if (f.id !== fileId) return f
      return {
        ...f,
        status: "accepted" as ChangeSetFileStatus,
        hunks: f.hunks.map((h) => ({ ...h, status: "accepted" as DiffHunkStatus })),
      }
    })

    const newStatus = this.deriveCompositeStatus(updatedFiles)
    store.updateChangeSet(changeSetId, { files: updatedFiles, status: newStatus, updatedAt: Date.now() })
    return true
  }

  rejectFile(changeSetId: string, fileId: string): boolean {
    const store = useChangeSetStore.getState()
    const changeSet = store.getChangeSet(changeSetId)
    if (!changeSet) return false
    if (changeSet.status !== "pending_review" && changeSet.status !== "partially_accepted") return false

    const updatedFiles = changeSet.files.map((f) => {
      if (f.id !== fileId) return f
      return {
        ...f,
        status: "rejected" as ChangeSetFileStatus,
        hunks: f.hunks.map((h) => ({ ...h, status: "rejected" as DiffHunkStatus })),
      }
    })

    const newStatus = this.deriveCompositeStatus(updatedFiles)
    store.updateChangeSet(changeSetId, { files: updatedFiles, status: newStatus, updatedAt: Date.now() })
    return true
  }

  acceptHunk(changeSetId: string, fileId: string, hunkId: string): boolean {
    return this.updateHunkStatus(changeSetId, fileId, hunkId, "accepted")
  }

  rejectHunk(changeSetId: string, fileId: string, hunkId: string): boolean {
    return this.updateHunkStatus(changeSetId, fileId, hunkId, "rejected")
  }

  markConflicted(changeSetId: string): boolean {
    return this.transitionTo(changeSetId, "conflicted")
  }

  restoreChangeSet(changeSetId: string): boolean {
    return this.transitionTo(changeSetId, "restored")
  }

  generateDiff(original: string, modified: string): DiffHunk[] {
    const hunks = computeDiff(original, modified)
    return convertUnifiedHunksToCanonical(original, modified, hunks)
  }

  hashContent(content: string): string {
    return simpleHash(content)
  }

  private transitionStatus(changeSetId: string, from: ChangeSetStatus, to: ChangeSetStatus): boolean {
    const store = useChangeSetStore.getState()
    const changeSet = store.getChangeSet(changeSetId)
    if (!changeSet || changeSet.status !== from) return false
    store.updateChangeSet(changeSetId, { status: to, updatedAt: Date.now() })
    this.emit({ type: `changeset_${to}`, changeSetId })
    return true
  }

  private transitionTo(changeSetId: string, status: ChangeSetStatus): boolean {
    const store = useChangeSetStore.getState()
    const changeSet = store.getChangeSet(changeSetId)
    if (!changeSet) return false
    if (!this.canTransition(changeSet, status)) return false
    store.updateChangeSet(changeSetId, { status, updatedAt: Date.now() })
    this.emit({ type: `changeset_${status}`, changeSetId })
    return true
  }

  private canTransition(changeSet: ChangeSet | undefined, target: ChangeSetStatus): boolean {
    if (!changeSet) return false
    const validTransitions: Record<ChangeSetStatus, ChangeSetStatus[]> = {
      draft: ["proposed"],
      proposed: ["pending_review"],
      pending_review: ["partially_accepted", "accepted", "rejected", "conflicted"],
      partially_accepted: ["accepted", "rejected", "conflicted", "restored"],
      accepted: ["restored"],
      rejected: ["restored"],
      conflicted: ["pending_review", "rejected"],
      restored: [],
    }
    return validTransitions[changeSet.status]?.includes(target) ?? false
  }

  private deriveCompositeStatus(files: ChangeSetFile[]): ChangeSetStatus {
    if (files.length === 0) return "pending_review"
    const allAccepted = files.every((f) => f.status === "accepted")
    const allRejected = files.every((f) => f.status === "rejected")
    const anyConflicted = files.some((f) => f.status === "conflicted")

    if (allAccepted) return "accepted"
    if (allRejected) return "rejected"
    if (anyConflicted) return "conflicted"
    return "partially_accepted"
  }

  async writeAcceptedChanges(changeSetId: string, workspaceRoot: string): Promise<{ written: string[]; failed: { path: string; error: string }[] }> {
    const store = useChangeSetStore.getState()
    const changeSet = store.getChangeSet(changeSetId)
    if (!changeSet) return { written: [], failed: [{ path: "", error: "ChangeSet not found" }] }
    if (changeSet.status !== "accepted") return { written: [], failed: [{ path: "", error: "ChangeSet is not in accepted state" }] }

    const written: string[] = []
    const failed: { path: string; error: string }[] = []

    for (const file of changeSet.files) {
      if (file.status !== "accepted") continue
      try {
        const fullPath = file.path.startsWith("/") || file.path.match(/^[a-zA-Z]:/) ? file.path : `${workspaceRoot}/${file.path}`
        const dir = dirname(fullPath)
        if (!(await exists(dir))) {
          await mkdir(dir)
        }
        await writeTextFile(fullPath, file.afterContent ?? "")
        written.push(file.path)
      } catch (err) {
        failed.push({ path: file.path, error: err instanceof Error ? err.message : String(err) })
      }
    }

    if (failed.length === 0) {
      store.updateChangeSet(changeSetId, { acceptedSnapshotId: `snap_${Date.now()}`, updatedAt: Date.now() })
    }

    return { written, failed }
  }

  async detectConflicts(changeSetId: string, workspaceRoot: string): Promise<{ file: string; beforeContent: string; currentContent: string; hasConflict: boolean }[]> {
    const store = useChangeSetStore.getState()
    const changeSet = store.getChangeSet(changeSetId)
    if (!changeSet) return []

    const conflicts: { file: string; beforeContent: string; currentContent: string; hasConflict: boolean }[] = []

    for (const file of changeSet.files) {
      if (file.changeType !== "modify" || file.status !== "pending") continue
      if (!file.beforeContent || !file.afterContent) continue

      try {
        const fullPath = file.path.startsWith("/") || file.path.match(/^[a-zA-Z]:/) ? file.path : `${workspaceRoot}/${file.path}`
        if (!(await exists(fullPath))) continue
        const currentContent = await readTextFile(fullPath)
        if (currentContent !== file.beforeContent) {
          conflicts.push({ file: file.path, beforeContent: file.beforeContent, currentContent, hasConflict: true })
        }
      } catch {
        conflicts.push({ file: file.path, beforeContent: file.beforeContent, currentContent: "", hasConflict: false })
      }
    }

    return conflicts
  }

  proposeFileEdit(params: {
    filePath: string
    beforeContent: string
    afterContent: string
    sessionId: string
    correlationId: string
    sourceToolCallIds?: string[]
  }): ChangeSet | null {
    const changeSet = this.createChangeSet({
      sessionId: params.sessionId,
      correlationId: params.correlationId,
      title: `Edit ${params.filePath}`,
      reason: "File modification",
      sourceToolCallIds: params.sourceToolCallIds,
    })

    this.addFileToChangeSet({
      changeSetId: changeSet.id,
      path: params.filePath,
      changeType: "modify",
      beforeContent: params.beforeContent,
      afterContent: params.afterContent,
    })

    this.proposeChangeSet(changeSet.id)
    return changeSet
  }

  private updateHunkStatus(
    changeSetId: string,
    fileId: string,
    hunkId: string,
    status: DiffHunkStatus
  ): boolean {
    const store = useChangeSetStore.getState()
    const changeSet = store.getChangeSet(changeSetId)
    if (!changeSet) return false
    if (changeSet.status !== "pending_review" && changeSet.status !== "partially_accepted") return false

    let changed = false
    const updatedFiles = changeSet.files.map((f) => {
      if (f.id !== fileId) return f
      const updatedHunks = f.hunks.map((h) => {
        if (h.id !== hunkId) return h
        changed = true
        return { ...h, status }
      })

      const fileStatus = deriveFileStatus(updatedHunks)
      return { ...f, hunks: updatedHunks, status: fileStatus }
    })

    if (!changed) return false

    const newStatus = this.deriveCompositeStatus(updatedFiles)
    store.updateChangeSet(changeSetId, { files: updatedFiles, status: newStatus, updatedAt: Date.now() })
    return true
  }
}

function deriveFileStatus(hunks: DiffHunk[]): ChangeSetFileStatus {
  if (hunks.length === 0) return "pending"
  const allAccepted = hunks.every((h) => h.status === "accepted")
  const allRejected = hunks.every((h) => h.status === "rejected")
  const anyAccepted = hunks.some((h) => h.status === "accepted")
  const anyRejected = hunks.some((h) => h.status === "rejected")

  if (allAccepted) return "accepted"
  if (allRejected) return "rejected"
  if (anyAccepted && anyRejected) return "conflicted"
  return "pending"
}
