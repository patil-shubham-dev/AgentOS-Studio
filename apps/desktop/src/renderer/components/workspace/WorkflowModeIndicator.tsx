import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useWorkspaceStore, type EditorMode } from "@/stores/workspace-store"
import { Code2, GitCompare, History, ListTodo, Search } from "lucide-react"

const MODE_CONFIG: Record<EditorMode, {
  label: string
  icon: React.ElementType
  color: string
  bg: string
  shortcut: string
  description: string
}> = {
  editor: {
    label: "Coding",
    icon: Code2,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    shortcut: "⌘⇧E",
    description: "Editing code",
  },
  diff: {
    label: "Reviewing",
    icon: GitCompare,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    shortcut: "⌘⇧D",
    description: "Reviewing changes",
  },
  history: {
    label: "Reviewing",
    icon: History,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    shortcut: "",
    description: "File history",
  },
  problems: {
    label: "Debugging",
    icon: ListTodo,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    shortcut: "",
    description: "Diagnostics",
  },
  search: {
    label: "Searching",
    icon: Search,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    shortcut: "⌘⇧F",
    description: "Searching files",
  },
}

export function WorkflowModeIndicator() {
  const editorMode = useWorkspaceStore((s) => s.editorMode)
  const cfg = MODE_CONFIG[editorMode] ?? MODE_CONFIG.editor
  const Icon = cfg.icon

  return (
    <motion.div
      layout
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2 py-1",
        cfg.bg,
      )}
    >
      <Icon className={cn("h-3 w-3", cfg.color)} />
      <span className={cn("text-[9px] font-medium", cfg.color)}>
        {cfg.label}
      </span>
      {cfg.shortcut && (
        <span className="text-[7px] text-white/20 font-mono ml-0.5 hidden sm:inline">
          {cfg.shortcut}
        </span>
      )}
    </motion.div>
  )
}
