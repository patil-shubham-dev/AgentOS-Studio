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
  pending: PendingApproval | null
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

export const useApprovalStore = create<ApprovalStore>((set, get) => ({
  pending: null,
  alwaysAllow: false,
  expiredMessage: null,
  requestApproval: (opts) => {
    // Auto-approve if alwaysAllow is set
    if (get().alwaysAllow) {
      return Promise.resolve(true)
    }

    return new Promise<boolean>((resolve) => {
      const timeoutId = setTimeout(() => {
        set({
          pending: null,
          expiredMessage: `Approval request timed out after 60s for operation: ${opts.command.slice(0, 100)}`,
        })
        // Clear the expired message after 8 seconds
        setTimeout(() => {
          set({ expiredMessage: null })
        }, 8000)
        resolve(false)
      }, 60_000)

      set({
        expiredMessage: null,
        pending: {
          id: Date.now().toString(),
          command: opts.command,
          operationType: opts.operationType,
          toolName: opts.toolName,
          args: opts.args,
          resolve: (result: boolean) => {
            clearTimeout(timeoutId)
            resolve(result)
          }
        }
      })
    })
  },
  approve: () => {
    const { pending } = get()
    if (pending) {
      pending.resolve(true)
      set({ pending: null, expiredMessage: null })
    }
  },
  reject: () => {
    const { pending } = get()
    if (pending) {
      pending.resolve(false)
      set({ pending: null, expiredMessage: null })
    }
  },
  setAlwaysAllow: (value) => set({ alwaysAllow: value }),
  clearExpired: () => set({ expiredMessage: null }),
}))

export async function requestCommandApproval(opts: {
  command: string
  operationType?: PendingApproval["operationType"]
  toolName?: string
  args?: Record<string, unknown>
}): Promise<boolean> {
  return useApprovalStore.getState().requestApproval(opts)
}
