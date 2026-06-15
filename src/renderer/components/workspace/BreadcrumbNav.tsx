import { useMemo } from "react"
import { motion } from "framer-motion"
import { ChevronRight, FileCode } from "lucide-react"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { cn } from "@/lib/utils"

export function BreadcrumbNav() {
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath)
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const openFile = useWorkspaceStore((s) => s.openFile)

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

  return (
    <div className="flex items-center gap-0.5 px-3 py-1 border-b border-white/[0.03] bg-black/10 overflow-x-auto shrink-0 scrollbar-thin">
      {segments.map((seg, i) => (
        <div key={seg.path + seg.label} className="flex items-center gap-0.5">
          {i > 0 && (
            <ChevronRight className="h-2.5 w-2.5 text-white/15 shrink-0" />
          )}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (seg.isFile) return
              if (seg.path && rootPath) {
                const name = seg.label
                const fullPath = seg.path
                openFile({ path: fullPath, name, content: "", isDirty: false })
              }
            }}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-all shrink-0",
              seg.isFile
                ? "text-white/60 cursor-default"
                : "text-white/30 hover:text-white/60 hover:bg-white/[0.04] cursor-pointer",
            )}
          >
            {seg.isFile && <FileCode className="h-2.5 w-2.5 text-blue-400/50" />}
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
