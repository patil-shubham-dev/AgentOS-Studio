import { create } from "zustand"
import type { RuntimeRole } from "@/types"
import type { ChatMessage } from "@agentic-os/providers"

export type ExecutionMode = "autonomous" | "fastest" | "most_accurate" | "research_heavy" | "human_guided" | "safe_mode"

export interface AgentAssignment {
  role: RuntimeRole
  reason: string
  status: "pending" | "active" | "completed" | "failed"
  startedAt?: number
  completedAt?: number
}

export interface OrchestrationStep {
  id: string
  type: "analyze" | "delegate" | "execute" | "review" | "complete" | "error"
  agent: RuntimeRole
  description: string
  status: "pending" | "running" | "done" | "failed"
  timestamp: number
}

export interface AgentStatus {
  id: string
  role: string
  state: "idle" | "planning" | "researching" | "browsing" | "editing" | "validating" | "complete" | "failed"
  currentTask: string
  progress?: number
  lastAction?: string
  lastUpdated: number
}

export interface FileActivity {
  path: string
  agentRole: string
  activity: "editing" | "reading" | "referencing" | "reviewing"
  timestamp: number
}

interface AgentConversation {
  role: RuntimeRole
  messages: ChatMessage[]
}

export interface AgentStore {
  activeRole: RuntimeRole
  conversations: Partial<Record<RuntimeRole, AgentConversation>>
  isProcessing: boolean

  wiredRoles: RuntimeRole[]
  executionMode: ExecutionMode

  agentAssignments: AgentAssignment[]
  orchestrationSteps: OrchestrationStep[]
  agentStatuses: Record<string, AgentStatus>
  fileActivities: FileActivity[]

  setActiveRole: (role: RuntimeRole) => void
  getMessages: () => ChatMessage[]
  addMessage: (role: RuntimeRole, msg: ChatMessage) => void
  setMessages: (role: RuntimeRole, msgs: ChatMessage[]) => void
  setProcessing: (processing: boolean) => void
  setWiredRoles: (roles: RuntimeRole[]) => void
  validateAssignment: (role: RuntimeRole) => boolean

  setExecutionMode: (mode: ExecutionMode) => void
  addAgentAssignment: (assignment: AgentAssignment) => void
  updateAgentAssignment: (role: RuntimeRole, updates: Partial<AgentAssignment>) => void
  clearAssignments: () => void
  addOrchestrationStep: (step: Omit<OrchestrationStep, "id" | "timestamp">) => string
  updateOrchestrationStep: (id: string, updates: Partial<OrchestrationStep>) => void
  clearOrchestrationSteps: () => void
  resetOrchestration: () => void

  setAgentStatus: (id: string, status: Partial<AgentStatus>) => void
  removeAgentStatus: (id: string) => void
  setFileActivity: (path: string, agentRole: string, activity: FileActivity["activity"]) => void
  clearFileActivity: (path: string) => void
  clearAllFileActivities: () => void
}

function emptyConversation(role: RuntimeRole): AgentConversation {
  return { role, messages: [] }
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  activeRole: "coder",
  conversations: {
    coder: emptyConversation("coder"),
    design: emptyConversation("design"),
    vision: emptyConversation("vision"),
    qa: emptyConversation("qa"),
    manager: emptyConversation("manager"),
    runtime: emptyConversation("runtime"),
  },
  isProcessing: false,

  wiredRoles: [],
  executionMode: "autonomous",

  agentAssignments: [],
  orchestrationSteps: [],
  agentStatuses: {},
  fileActivities: [],

  setActiveRole: (role) => set({ activeRole: role }),

  getMessages: () => {
    const { conversations, activeRole } = get()
    return conversations[activeRole]?.messages ?? []
  },

  addMessage: (role, msg) =>
    set((s) => ({
      conversations: {
        ...s.conversations,
        [role]: {
          role,
          messages: [...(s.conversations[role]?.messages ?? []), msg],
        },
      },
    })),

  setMessages: (role, msgs) =>
    set((s) => ({
      conversations: {
        ...s.conversations,
        [role]: { role, messages: msgs },
      },
    })),

  setProcessing: (processing) =>
    set({ isProcessing: processing }),

  setWiredRoles: (roles) => set({ wiredRoles: roles }),

  validateAssignment: (role) => {
    const { wiredRoles } = get()
    if (wiredRoles.length === 0) return true
    return wiredRoles.includes(role)
  },

  setExecutionMode: (mode) => set({ executionMode: mode }),
  addAgentAssignment: (assignment) =>
    set((s) => {
      if (s.wiredRoles.length > 0 && !s.wiredRoles.includes(assignment.role)) {
        console.warn(`[AgentStore] Blocked assignment for unwired role "${assignment.role}". Available: [${s.wiredRoles.join(", ")}]`)
        return s
      }
      return {
        agentAssignments: [...s.agentAssignments, assignment],
      }
    }),
  updateAgentAssignment: (role, updates) =>
    set((s) => ({
      agentAssignments: s.agentAssignments.map((a) =>
        a.role === role ? { ...a, ...updates } : a
      ),
    })),
  clearAssignments: () => set({ agentAssignments: [] }),
  addOrchestrationStep: (step) => {
    const id = crypto.randomUUID()
    set((s) => ({
      orchestrationSteps: [
        ...s.orchestrationSteps,
        { ...step, id, timestamp: Date.now() },
      ],
    }))
    return id
  },
  updateOrchestrationStep: (id, updates) =>
    set((s) => ({
      orchestrationSteps: s.orchestrationSteps.map((step) =>
        step.id === id ? { ...step, ...updates } : step
      ),
    })),
  clearOrchestrationSteps: () => set({ orchestrationSteps: [] }),
  resetOrchestration: () =>
    set({
      agentAssignments: [],
      orchestrationSteps: [],
    }),

  setAgentStatus: (id, status) =>
    set((s) => ({
      agentStatuses: {
        ...s.agentStatuses,
        [id]: {
          ...(s.agentStatuses[id] ?? { id, role: id, state: "idle", currentTask: "", lastUpdated: Date.now() }),
          ...status,
          lastUpdated: Date.now(),
        },
      },
    })),

  removeAgentStatus: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.agentStatuses
      return { agentStatuses: rest }
    }),

  setFileActivity: (path, agentRole, activity) =>
    set((s) => {
      const existing = s.fileActivities.findIndex((f) => f.path === path && f.agentRole === agentRole)
      const entry: FileActivity = { path, agentRole, activity, timestamp: Date.now() }
      if (existing >= 0) {
        const updated = [...s.fileActivities]
        updated[existing] = entry
        return { fileActivities: updated }
      }
      return { fileActivities: [...s.fileActivities, entry] }
    }),

  clearFileActivity: (path) =>
    set((s) => ({
      fileActivities: s.fileActivities.filter((f) => f.path !== path),
    })),

  clearAllFileActivities: () => set({ fileActivities: [] }),
}))
