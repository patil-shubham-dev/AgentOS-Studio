import { useMemo } from "react"
import { useAgentStore } from "@/stores/agent-store"

const ACTIVITY_LABELS: Record<string, string> = {
  editing: "Editing",
  reading: "Reading",
  referencing: "Referenced",
  reviewing: "Reviewing",
  relevant: "Relevant",
  error: "Error",
}

const ACTIVITY_COLORS: Record<string, string> = {
  editing: "text-amber-400",
  reading: "text-blue-400",
  referencing: "text-purple-400",
  reviewing: "text-cyan-400",
  relevant: "text-white/30",
  error: "text-red-400",
}

export function useAgentFileBadges(rootPath: string | null): {
  fileActivities: { path: string; label: string; color: string }[]
} {
  const fileActivities = useAgentStore((s) => s.fileActivities)

  return useMemo(() => {
    if (!rootPath || fileActivities.length === 0) return { fileActivities: [] }

    return {
      fileActivities: fileActivities.map((fa) => ({
        path: fa.path,
        label: `${ACTIVITY_LABELS[fa.activity] || fa.activity}`,
        color: ACTIVITY_COLORS[fa.activity] || "text-white/40",
      })),
    }
  }, [fileActivities, rootPath])
}
