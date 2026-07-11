import { create } from "zustand"

export interface PendingApproval {
  id: string
  command: string
  operationType?: "tool_execution" | "file_write" | "file_edit" | "command_run" | "browser_launch" | "design_create"
  toolName?: string
  args?: Record<string, unknown>
  resolve: (approved: boolean) => void
}

interface ApprovalStore {
  queue: PendingApproval[]
  current: PendingApproval | null
  alwaysAllow: boolean
  expiredMessage: string | null
  requestApproval: (opts: {
    command: string
    operationType?: PendingApproval["operationType"]
    toolName?: string
    args?: Record<string, unknown>
  }) => Promise<boolean>
  approve: () => void
  reject: () => void
  setAlwaysAllow: (value: boolean) => void
  clearExpired: () => void
}

let approvalIdCounter = 0

export const useApprovalStore = create<ApprovalStore>((set, get) => ({
  queue: [],
  current: null,
  alwaysAllow: false,
  expiredMessage: null,
  requestApproval: (opts) => {
    if (get().alwaysAllow) {
      return Promise.resolve(true)
    }

    return new Promise<boolean>((resolve) => {
      const timeoutId = setTimeout(() => {
        const state = get()
        set({
          current: null,
          expiredMessage: `Approval request timed out after 60s for operation: ${opts.command.slice(0, 100)}`,
        })
        setTimeout(() => {
          set({ expiredMessage: null })
        }, 8000)
        const item = state.queue.find((q) => q.id === id)
        if (item) {
          clearTimeout(timeoutId)
          resolve(false)
          set({ queue: state.queue.filter((q) => q.id !== id) })
          processQueue()
        }
      }, 60_000)

      const id = `ap_${++approvalIdCounter}`
      const entry: PendingApproval = {
        id,
        command: opts.command,
        operationType: opts.operationType,
        toolName: opts.toolName,
        args: opts.args,
        resolve: (result: boolean) => {
          clearTimeout(timeoutId)
          resolve(result)
        },
      }

      set((s) => ({
        expiredMessage: null,
        queue: [...s.queue, entry],
      }))
      processQueue()
    })
  },
  approve: () => {
    const { current } = get()
    if (current) {
      current.resolve(true)
      set({ current: null, expiredMessage: null })
      processQueue()
    }
  },
  reject: () => {
    const { current } = get()
    if (current) {
      current.resolve(false)
      set({ current: null, expiredMessage: null })
      processQueue()
    }
  },
  setAlwaysAllow: (value) => set({ alwaysAllow: value }),
  clearExpired: () => set({ expiredMessage: null }),
}))

function processQueue(): void {
  const state = useApprovalStore.getState()
  if (state.current) return
  const next = state.queue[0]
  if (!next) return
  useApprovalStore.setState({ current: next, queue: state.queue.slice(1) })
}

export async function requestCommandApproval(opts: {
  command: string
  operationType?: PendingApproval["operationType"]
  toolName?: string
  args?: Record<string, unknown>
}): Promise<boolean> {
  return useApprovalStore.getState().requestApproval(opts)
}
