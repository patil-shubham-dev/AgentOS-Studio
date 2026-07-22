import { create } from "zustand"
import { persist } from "zustand/middleware"

export type AchievementId =
  | "first_session"
  | "tenth_session"
  | "hundredth_session"
  | "first_composer"
  | "first_pr"
  | "first_fix"
  | "first_skill"
  | "first_memory"
  | "first_connector"
  | "first_scheduled_task"
  | "first_review"
  | "consistency_3"
  | "consistency_7"
  | "speed_demon"
  | "code_master"

export interface Achievement {
  id: AchievementId
  title: string
  description: string
  icon: string
  unlockedAt: number | null
  seen: boolean
}

interface AchievementState {
  achievements: Record<AchievementId, Achievement>
  unlockedIds: AchievementId[]
  justUnlockedId: AchievementId | null
  clearJustUnlocked: () => void
  unlock: (id: AchievementId) => void
  markSeen: (id: AchievementId) => void
  checkAndUnlock: (stats: { sessions: number; prs: number; fixes: number; skills: number; tasks: number; reviewCount: number; totalChanges: number }) => void
  isUnlocked: (id: AchievementId) => boolean
}

const ACHIEVEMENT_DEFS: Record<AchievementId, Omit<Achievement, "unlockedAt" | "seen">> = {
  first_session: { id: "first_session", title: "First Steps", description: "Complete your first AI coding session", icon: "🚀" },
  tenth_session: { id: "tenth_session", title: "Getting Serious", description: "Complete 10 AI coding sessions", icon: "🔥" },
  hundredth_session: { id: "hundredth_session", title: "Century", description: "Complete 100 AI coding sessions", icon: "💎" },
  first_composer: { id: "first_composer", title: "Multi-File Maestro", description: "Use the multi-file composer for the first time", icon: "📝" },
  first_pr: { id: "first_pr", title: "Pull Request Pro", description: "Create your first pull request via AI", icon: "🔄" },
  first_fix: { id: "first_fix", title: "Bug Hunter", description: "Let AI auto-fix a terminal error", icon: "🐛" },
  first_skill: { id: "first_skill", title: "Skill Builder", description: "Use or create a skill for the first time", icon: "⚡" },
  first_memory: { id: "first_memory", title: "Memory Keeper", description: "AI saves its first learning from your session", icon: "🧠" },
  first_connector: { id: "first_connector", title: "Connected", description: "Connect an external service (GitHub, Slack, Linear)", icon: "🔗" },
  first_scheduled_task: { id: "first_scheduled_task", title: "Automator", description: "Schedule your first recurring AI task", icon: "⏰" },
  first_review: { id: "first_review", title: "Code Reviewer", description: "Review code changes for the first time", icon: "👁️" },
  consistency_3: { id: "consistency_3", title: "Consistent", description: "Use AgenticOS for 3 days in a row", icon: "📅" },
  consistency_7: { id: "consistency_7", title: "Dedicated", description: "Use AgenticOS for 7 days in a row", icon: "📆" },
  speed_demon: { id: "speed_demon", title: "Speed Demon", description: "Complete 5 tasks within 10 minutes", icon: "⚡" },
  code_master: { id: "code_master", title: "Code Master", description: "Generate over 10,000 lines of code changes", icon: "🏆" },
}

function buildInitial(): Record<AchievementId, Achievement> {
  const rec: Record<string, Achievement> = {}
  for (const [id, def] of Object.entries(ACHIEVEMENT_DEFS)) {
    rec[id] = { ...def, unlockedAt: null, seen: false } as Achievement
  }
  return rec as Record<AchievementId, Achievement>
}

export const useAchievementStore = create<AchievementState>()(
  persist(
    (set, get) => ({
      achievements: buildInitial(),
      unlockedIds: [],
      justUnlockedId: null,

      clearJustUnlocked: () => set({ justUnlockedId: null }),

      unlock: (id) => {
        const a = get().achievements[id]
        if (!a || a.unlockedAt) return
        const now = Date.now()
        set((s) => ({
          achievements: { ...s.achievements, [id]: { ...s.achievements[id], unlockedAt: now } },
          unlockedIds: [...s.unlockedIds, id],
          justUnlockedId: id,
        }))
      },

      markSeen: (id) =>
        set((s) => ({
          achievements: { ...s.achievements, [id]: { ...s.achievements[id], seen: true } },
        })),

      checkAndUnlock: (stats) => {
        const getA = get().achievements
        const unlocks: AchievementId[] = []

        if (stats.sessions >= 1 && !getA.first_session.unlockedAt) unlocks.push("first_session")
        if (stats.sessions >= 10 && !getA.tenth_session.unlockedAt) unlocks.push("tenth_session")
        if (stats.sessions >= 100 && !getA.hundredth_session.unlockedAt) unlocks.push("hundredth_session")
        if (stats.prs >= 1 && !getA.first_pr.unlockedAt) unlocks.push("first_pr")
        if (stats.fixes >= 1 && !getA.first_fix.unlockedAt) unlocks.push("first_fix")
        if (stats.skills >= 1 && !getA.first_skill.unlockedAt) unlocks.push("first_skill")
        if (stats.tasks >= 1 && !getA.first_scheduled_task.unlockedAt) unlocks.push("first_scheduled_task")
        if (stats.reviewCount >= 1 && !getA.first_review.unlockedAt) unlocks.push("first_review")
        if (stats.totalChanges >= 10000 && !getA.code_master.unlockedAt) unlocks.push("code_master")

        for (const id of unlocks) get().unlock(id)
      },

      isUnlocked: (id) => !!get().achievements[id]?.unlockedAt,
    }),
    {
      name: "aos-achievement-store",
      partialize: (state) => ({
        achievements: state.achievements,
        unlockedIds: state.unlockedIds,
      }),
    }
  )
)
