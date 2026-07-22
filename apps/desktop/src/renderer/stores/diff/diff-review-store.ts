/**
 * DiffReviewStore — tracks AI code review comments and inline user comments on diffs.
 *
 * Supports:
 *   - AI-generated review comments per hunk/line
 *   - User inline questions and AI responses (threaded)
 *   - Draft state for active comment being composed
 *   - Review loading state for the "Review with AI" flow
 */

import { create } from "zustand"

export type CommentSeverity = "info" | "warning" | "error"
export type CommentCategory = "info" | "bug" | "style" | "security" | "test" | "question"

export interface ReviewComment {
  id: string
  filePath: string
  hunkIndex: number
  lineNumber: number
  author: "ai" | "user"
  content: string
  parentId: string | null
  severity: CommentSeverity
  category: CommentCategory
  createdAt: number
}

export interface InlineCommentDraft {
  filePath: string
  hunkIndex: number
  lineNumber: number
  parentId?: string
}

export interface DiffReviewStoreState {
  comments: Map<string, ReviewComment[]>
  reviewInProgress: boolean
  reviewError: string | null
  activeDraft: InlineCommentDraft | null

  addComment: (comment: ReviewComment) => void
  addComments: (comments: ReviewComment[]) => void
  clearFileComments: (filePath: string) => void
  clearAll: () => void
  setReviewInProgress: (v: boolean) => void
  setReviewError: (err: string | null) => void
  setActiveDraft: (draft: InlineCommentDraft | null) => void
  getCommentsForHunk: (filePath: string, hunkIndex: number) => ReviewComment[]
  getCommentsForLine: (filePath: string, hunkIndex: number, lineNumber: number) => ReviewComment[]
  getCommentThreads: (filePath: string, hunkIndex: number) => ReviewComment[][]
  getHunkCommentCount: (filePath: string, hunkIndex: number) => number
}

function makeKey(filePath: string, hunkIndex: number): string {
  return `${filePath}:${hunkIndex}`
}

let commentCounter = 0
function nextCommentId(): string {
  return `review-comment-${Date.now()}-${++commentCounter}`
}

export const useDiffReviewStore = create<DiffReviewStoreState>((set, get) => ({
  comments: new Map(),
  reviewInProgress: false,
  reviewError: null,
  activeDraft: null,

  addComment: (comment) =>
    set((state) => {
      const key = makeKey(comment.filePath, comment.hunkIndex)
      const next = new Map(state.comments)
      const existing = next.get(key) ?? []
      next.set(key, [...existing, comment])
      return { comments: next }
    }),

  addComments: (comments) =>
    set((state) => {
      const next = new Map(state.comments)
      for (const comment of comments) {
        const key = makeKey(comment.filePath, comment.hunkIndex)
        const existing = next.get(key) ?? []
        existing.push(comment)
        next.set(key, existing)
      }
      return { comments: next }
    }),

  clearFileComments: (filePath) =>
    set((state) => {
      const next = new Map(state.comments)
      for (const key of next.keys()) {
        if (key.startsWith(`${filePath}:`)) {
          next.delete(key)
        }
      }
      return { comments: next }
    }),

  clearAll: () => set({ comments: new Map(), reviewError: null, activeDraft: null }),

  setReviewInProgress: (v) => set({ reviewInProgress: v }),

  setReviewError: (err) => set({ reviewError: err }),

  setActiveDraft: (draft) => set({ activeDraft: draft }),

  getCommentsForHunk: (filePath, hunkIndex) => {
    const key = makeKey(filePath, hunkIndex)
    return get().comments.get(key) ?? []
  },

  getCommentsForLine: (filePath, hunkIndex, lineNumber) => {
    const key = makeKey(filePath, hunkIndex)
    return (get().comments.get(key) ?? []).filter((c) => c.lineNumber === lineNumber)
  },

  getCommentThreads: (filePath, hunkIndex) => {
    const key = makeKey(filePath, hunkIndex)
    const all = get().comments.get(key) ?? []
    const topLevel = all.filter((c) => c.parentId === null)
    return topLevel.map((parent) => {
      const replies = all.filter((c) => c.parentId === parent.id)
      return [parent, ...replies]
    })
  },

  getHunkCommentCount: (filePath, hunkIndex) => {
    const key = makeKey(filePath, hunkIndex)
    return (get().comments.get(key) ?? []).length
  },
}))

export { nextCommentId }
