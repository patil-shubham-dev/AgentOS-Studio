import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface SharedSkill {
  id: string
  name: string
  description: string
  prompt: string
  version: number
  author: string
  tags: string[]
  updatedAt: number
}

export interface SharedRule {
  id: string
  pattern: string
  rule: string
  priority: number
  enabled: boolean
}

export interface TeamMember {
  id: string
  name: string
  role: "admin" | "editor" | "viewer"
  joinedAt: number
}

export interface TeamWorkspace {
  id: string
  name: string
  description: string
  members: TeamMember[]
  sharedSkills: SharedSkill[]
  sharedRules: SharedRule[]
  syncEnabled: boolean
  lastSyncAt: number | null
}

interface TeamWorkspaceState {
  workspaces: TeamWorkspace[]
  activeWorkspaceId: string | null
  addWorkspace: (name: string, description?: string) => void
  removeWorkspace: (id: string) => void
  setActiveWorkspace: (id: string | null) => void
  addSkill: (workspaceId: string, skill: Omit<SharedSkill, "id" | "version" | "updatedAt">) => void
  removeSkill: (workspaceId: string, skillId: string) => void
  updateSkill: (workspaceId: string, skillId: string, updates: Partial<SharedSkill>) => void
  addRule: (workspaceId: string, rule: Omit<SharedRule, "id">) => void
  removeRule: (workspaceId: string, ruleId: string) => void
  updateRule: (workspaceId: string, ruleId: string, updates: Partial<SharedRule>) => void
  addMember: (workspaceId: string, member: Omit<TeamMember, "joinedAt">) => void
  removeMember: (workspaceId: string, memberId: string) => void
  toggleSync: (workspaceId: string) => void
  getActiveWorkspace: () => TeamWorkspace | null
}

function genId(): string {
  return `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export const useTeamWorkspaceStore = create<TeamWorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,

      addWorkspace: (name, description = "") =>
        set((s) => ({
          workspaces: [
            ...s.workspaces,
            {
              id: genId(),
              name,
              description,
              members: [],
              sharedSkills: [],
              sharedRules: [],
              syncEnabled: false,
              lastSyncAt: null,
            },
          ],
        })),

      removeWorkspace: (id) =>
        set((s) => ({
          workspaces: s.workspaces.filter((w) => w.id !== id),
          activeWorkspaceId: s.activeWorkspaceId === id ? null : s.activeWorkspaceId,
        })),

      setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

      addSkill: (workspaceId, skill) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id !== workspaceId ? w : {
              ...w,
              sharedSkills: [
                ...w.sharedSkills,
                {
                  ...skill,
                  id: genId(),
                  version: 1,
                  updatedAt: Date.now(),
                },
              ],
            }
          ),
        })),

      removeSkill: (workspaceId, skillId) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id !== workspaceId ? w : {
              ...w,
              sharedSkills: w.sharedSkills.filter((sk) => sk.id !== skillId),
            }
          ),
        })),

      updateSkill: (workspaceId, skillId, updates) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id !== workspaceId ? w : {
              ...w,
              sharedSkills: w.sharedSkills.map((sk) =>
                sk.id !== skillId ? sk : {
                  ...sk,
                  ...updates,
                  version: sk.version + 1,
                  updatedAt: Date.now(),
                }
              ),
            }
          ),
        })),

      addRule: (workspaceId, rule) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id !== workspaceId ? w : {
              ...w,
              sharedRules: [...w.sharedRules, { ...rule, id: genId() }],
            }
          ),
        })),

      removeRule: (workspaceId, ruleId) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id !== workspaceId ? w : {
              ...w,
              sharedRules: w.sharedRules.filter((r) => r.id !== ruleId),
            }
          ),
        })),

      updateRule: (workspaceId, ruleId, updates) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id !== workspaceId ? w : {
              ...w,
              sharedRules: w.sharedRules.map((r) =>
                r.id !== ruleId ? r : { ...r, ...updates }
              ),
            }
          ),
        })),

      addMember: (workspaceId, member) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id !== workspaceId ? w : {
              ...w,
              members: [...w.members, { ...member, joinedAt: Date.now() }],
            }
          ),
        })),

      removeMember: (workspaceId, memberId) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id !== workspaceId ? w : {
              ...w,
              members: w.members.filter((m) => m.id !== memberId),
            }
          ),
        })),

      toggleSync: (workspaceId) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id !== workspaceId ? w : {
              ...w,
              syncEnabled: !w.syncEnabled,
              lastSyncAt: !w.syncEnabled ? Date.now() : w.lastSyncAt,
            }
          ),
        })),

      getActiveWorkspace: () => {
        const state = get()
        if (!state.activeWorkspaceId) return null
        return state.workspaces.find((w) => w.id === state.activeWorkspaceId) || null
      },
    }),
    {
      name: "aos-team-workspace-store",
      partialize: (state) => ({
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
      }),
    }
  )
)
