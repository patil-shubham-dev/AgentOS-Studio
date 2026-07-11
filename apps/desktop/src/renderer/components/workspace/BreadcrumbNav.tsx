import { useMemo } from "react"
import { motion } from "framer-motion"
import { ChevronRight, FileCode, FolderOpen } from "lucide-react"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { cn } from "@/lib/utils"

export function BreadcrumbNav() {
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath)
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const setRevealInExplorer = useWorkspaceStore((s) => s.setRevealInExplorer)

  const segments = useMemo(() => {
    if (!activeFilePath || !rootPath) return []
    const parts = activeFilePath.split("/")
    const rootName = rootPath.split("\\").pop() || rootPath.split("/").pop() || "workspace"
    return [
      { label: rootName, path: "", isRoot: true, isFile: false },
      ...parts.map((part, i) => ({
        label: part,
        path: parts.slice(0, i + 1).join("/"),
        isRoot: false,
        isFile: i === parts.length - 1,
      })),
    ]
  }, [activeFilePath, rootPath])

  if (!activeFilePath || segments.length === 0) return null

  const handleDirClick = (segPath: string) => {
    setRevealInExplorer(segPath)
  }

  return (
    <div className="flex items-center gap-0.5 px-3 py-1 border-b border-[var(--border-subtle)] bg-[var(--surface-panel)]/30 overflow-x-auto shrink-0 scrollbar-thin">
      {segments.map((seg, i) => (
        <div key={seg.path + seg.label} className="flex items-center gap-0.5">
          {i > 0 && (
            <ChevronRight className="h-2.5 w-2.5 text-[var(--text-quaternary)] shrink-0" />
          )}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => { if (!seg.isFile) handleDirClick(seg.path) }}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-all shrink-0",
              seg.isFile
                ? "text-[var(--text-secondary)] cursor-default"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] cursor-pointer",
            )}
          >
            {!seg.isFile && <FolderOpen className="h-2.5 w-2.5 text-[var(--color-accent-amber)]/40" />}
            {seg.isFile && <FileCode className="h-2.5 w-2.5 text-[var(--accent-code)]/50" />}
            <span className={cn(
              "truncate max-w-32",
              seg.isFile && "font-medium",
            )}>
              {seg.label}
            </span>
          </motion.button>
        </div>
      ))}
    </div>
  )
}
