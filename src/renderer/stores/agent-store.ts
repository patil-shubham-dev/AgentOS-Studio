import { create } from "zustand"
import type { RuntimeRole } from "@/types"
import type { ChatMessage } from "@agentic-os/providers"

const MAX_MESSAGES_PER_ROLE = 200
const MAX_ORCHESTRATION_STEPS = 100
const MAX_AGENT_ASSIGNMENTS = 50

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
    set((s) => {
      const existing = s.conversations[role]?.messages ?? []
      const messages = existing.length >= MAX_MESSAGES_PER_ROLE
        ? [...existing.slice(-(MAX_MESSAGES_PER_ROLE - 1)), msg]
        : [...existing, msg]
      return {
        conversations: {
          ...s.conversations,
          [role]: { role, messages },
        },
      }
    }),

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

  addAgentAssignment: (assignment) =>
    set((s) => {
      if (s.wiredRoles.length > 0 && !s.wiredRoles.includes(assignment.role)) {
        console.warn(`[AgentStore] Blocked assignment for unwired role "${assignment.role}". Available: [${s.wiredRoles.join(", ")}]`)
        return s
      }
      const assignments = s.agentAssignments.length >= MAX_AGENT_ASSIGNMENTS
        ? [...s.agentAssignments.slice(-(MAX_AGENT_ASSIGNMENTS - 1)), assignment]
        : [...s.agentAssignments, assignment]
      return { agentAssignments: assignments }
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
    set((s) => {
      const steps = s.orchestrationSteps.length >= MAX_ORCHESTRATION_STEPS
        ? [...s.orchestrationSteps.slice(-(MAX_ORCHESTRATION_STEPS - 1)), { ...step, id, timestamp: Date.now() }]
        : [...s.orchestrationSteps, { ...step, id, timestamp: Date.now() }]
      return { orchestrationSteps: steps }
    })
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
