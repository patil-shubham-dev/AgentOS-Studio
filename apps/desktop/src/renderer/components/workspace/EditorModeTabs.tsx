import { memo } from "react"
import { Code2, GitCompare, History, ListTodo, Search, WandSparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { ShortcutHint } from "@/components/ui/ShortcutHint"
import type { EditorMode } from "@/stores/workspace-store"

interface EditorModeOption {
  id: EditorMode
  label: string
  icon: React.ElementType
  shortcut?: string
}

const MODE_OPTIONS: EditorModeOption[] = [
  { id: "editor", label: "Editor", icon: Code2, shortcut: "⌘⇧E" },
  { id: "diff", label: "Diff", icon: GitCompare, shortcut: "⌘⇧D" },
  { id: "composer", label: "Composer", icon: WandSparkles },
  { id: "history", label: "History", icon: History },
  { id: "problems", label: "Problems", icon: ListTodo },
  { id: "search", label: "Search", icon: Search },
]

interface EditorModeTabsProps {
  editorMode: EditorMode
  onSelectMode: (mode: EditorMode) => void
  onToggleHistory: () => void
  onToggleProblems: () => void
  onToggleSearch: () => void
}

export const EditorModeTabs = memo(function EditorModeTabs({
  editorMode,
  onSelectMode,
  onToggleHistory,
  onToggleProblems,
  onToggleSearch,
}: EditorModeTabsProps) {
  const handleClick = (opt: EditorModeOption) => {
    if (opt.id === "editor") {
      onSelectMode("editor")
    } else if (opt.id === "history") {
      onSelectMode("history")
      onToggleHistory()
    } else if (opt.id === "problems") {
      onSelectMode("problems")
      onToggleProblems()
    } else if (opt.id === "search") {
      onSelectMode("search")
      onToggleSearch()
    } else {
      onSelectMode(opt.id)
    }
  }

  return (
    <div className="flex items-center border-b border-[var(--border-subtle)] bg-[var(--surface-panel)]/30 px-2 shrink-0">
      {MODE_OPTIONS.map((opt) => {
        const Icon = opt.icon
        const isActive = editorMode === opt.id
        return (
          <button
            key={opt.id}
            onClick={() => handleClick(opt)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium transition-all border-b-2 -mb-[1px]",
              isActive
                ? "text-[var(--accent-code)] border-[var(--accent-code)]/70"
                : "text-[var(--text-tertiary)] border-transparent hover:text-[var(--text-secondary)] hover:border-[var(--border-hover)]",
            )}
          >
            <Icon className="h-3 w-3" />
            <span>{opt.label}</span>
            {opt.shortcut && <ShortcutHint keys={opt.shortcut} className="ml-1" />}
          </button>
        )
      })}
    </div>
  )
})
