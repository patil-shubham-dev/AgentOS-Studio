import { create } from "zustand"
import { WorktreeSandboxManager, type Sandbox } from "@/lib/git/WorktreeSandbox"

export interface SessionWorktree {
  sessionId: string
  sandbox: Sandbox
  createdAt: number
}

interface GitWorktreeState {
  worktrees: Map<string, SessionWorktree>
  selectedSessionId: string | null
  isCreating: Set<string>
  isRemoving: Set<string>

  createWorktree: (sessionId: string, workspaceRoot: string, taskId: string) => Promise<SessionWorktree | null>
  removeWorktree: (sessionId: string) => Promise<boolean>
  getWorktree: (sessionId: string) => SessionWorktree | undefined
  cleanupAll: () => Promise<void>
}

const manager = WorktreeSandboxManager.getInstance()

export const useGitWorktreeStore = create<GitWorktreeState>()((set, get) => ({
  worktrees: new Map(),
  selectedSessionId: null,
  isCreating: new Set(),
  isRemoving: new Set(),

  createWorktree: async (sessionId, workspaceRoot, taskId) => {
    const state = get()
    if (state.isCreating.has(sessionId)) return null

    set((s) => {
      const c = new Set(s.isCreating)
      c.add(sessionId)
      return { isCreating: c }
    })

    try {
      const sandbox = await manager.create(workspaceRoot, taskId)
      if (!sandbox) return null

      const sw: SessionWorktree = {
        sessionId,
        sandbox,
        createdAt: Date.now(),
      }

      set((s) => {
        const m = new Map(s.worktrees)
        m.set(sessionId, sw)
        const c = new Set(s.isCreating)
        c.delete(sessionId)
        return { worktrees: m, isCreating: c }
      })

      return sw
    } catch {
      set((s) => {
        const c = new Set(s.isCreating)
        c.delete(sessionId)
        return { isCreating: c }
      })
      return null
    }
  },

  removeWorktree: async (sessionId) => {
    const state = get()
    const sw = state.worktrees.get(sessionId)
    if (!sw) return false

    set((s) => {
      const r = new Set(s.isRemoving)
      r.add(sessionId)
      return { isRemoving: r }
    })

    try {
      const ok = await manager.discard(sw.sandbox)
      if (ok) {
        set((s) => {
          const m = new Map(s.worktrees)
          m.delete(sessionId)
          const r = new Set(s.isRemoving)
          r.delete(sessionId)
          return { worktrees: m, isRemoving: r }
        })
      }
      return ok
    } catch {
      set((s) => {
        const r = new Set(s.isRemoving)
        r.delete(sessionId)
        return { isRemoving: r }
      })
      return false
    }
  },

  getWorktree: (sessionId) => {
    return get().worktrees.get(sessionId)
  },

  cleanupAll: async () => {
    const state = get()
    const promises = Array.from(state.worktrees.keys()).map((sid) =>
      get().removeWorktree(sid)
    )
    await Promise.allSettled(promises)
  },
}))
