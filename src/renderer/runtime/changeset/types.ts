export type ChangeSetId = string
export type ChangeSetFileId = string
export type DiffHunkId = string

export type ChangeSetStatus =
  | "draft"
  | "proposed"
  | "pending_review"
  | "partially_accepted"
  | "accepted"
  | "rejected"
  | "conflicted"
  | "restored"

export type ChangeSetFileStatus = "pending" | "accepted" | "rejected" | "conflicted"
export type DiffHunkStatus = "pending" | "accepted" | "rejected"
export type ChangeType = "create" | "modify" | "delete" | "rename"
export type DiffLineType = "context" | "add" | "remove"

export interface DiffLine {
  type: DiffLineType
  oldLine?: number
  newLine?: number
  content: string
}

export interface DiffHunk {
  id: DiffHunkId
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
  status: DiffHunkStatus
}

export interface ChangeSetFile {
  id: ChangeSetFileId
  path: string
  oldPath?: string
  changeType: ChangeType
  beforeHash?: string
  afterHash?: string
  beforeContent?: string
  afterContent?: string
  hunks: DiffHunk[]
  status: ChangeSetFileStatus
}

export interface ChangeSet {
  id: ChangeSetId
  sessionId: string
  correlationId: string
  title: string
  reason: string
  status: ChangeSetStatus
  files: ChangeSetFile[]
  baseSnapshotId?: string
  acceptedSnapshotId?: string
  sourceToolCallIds: string[]
  createdAt: number
  updatedAt: number
}

export function createChangeSetId(): ChangeSetId {
  return `cs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function createChangeSetFileId(): ChangeSetFileId {
  return `csf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function createDiffHunkId(): DiffHunkId {
  return `hunk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
