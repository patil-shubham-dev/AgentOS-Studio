import { memo, useMemo } from "react"
import { semanticSearch } from "@/lib/semantic-search"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { GitBranch } from "lucide-react"
import { FileIcon } from "./FileIcon"

interface RelatedFilesSectionProps {
  rootPath: string | null
  onOpenPath: (path: string) => void
}

export const RelatedFilesSection = memo(function RelatedFilesSection({
  rootPath,
  onOpenPath,
}: RelatedFilesSectionProps) {
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath)
  const openFiles = useWorkspaceStore((s) => s.openFiles)

  const relatedFiles = useMemo(() => {
    if (!activeFilePath || !semanticSearch.ready) return []

    const activeName = activeFilePath.split("/").pop() || ""
    if (!activeName) return []

    const results = semanticSearch.search(activeName.replace(/\.[^.]+$/, ""), 6)

    // Filter out the active file itself and already-open files
    const openPaths = new Set(openFiles.map((f) => f.path))
    return results
      .filter((r) => r.filePath !== activeFilePath && !openPaths.has(r.filePath))
      .slice(0, 4)
  }, [activeFilePath, openFiles])

  if (relatedFiles.length === 0) return null

  return (
    <div style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center gap-1.5 px-3 py-1 select-none">
        <GitBranch className="h-2.5 w-2.5" style={{ color: "var(--color-accent-amber)" }} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-quaternary)" }}>
          Related
        </span>
        <span className="text-[9px] font-mono" style={{ color: "var(--text-quaternary)" }}>{relatedFiles.length}</span>
      </div>
      <div className="py-0.5">
        {relatedFiles.map((r) => {
          const abs = rootPath ? rootPath.replace(/\\/g, "/") + "/" + r.filePath : r.filePath
          return (
            <div
              key={r.filePath}
              onClick={() => onOpenPath(abs)}
              className="flex items-center gap-1.5 px-3 py-0.5 cursor-pointer text-[11px] transition-colors group"
              tabIndex={0}
              role="button"
              style={{ color: "var(--text-secondary)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text-primary)"
                e.currentTarget.style.background = "var(--border-default)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-secondary)"
                e.currentTarget.style.background = "transparent"
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onOpenPath(abs)
                }
              }}
            >
              <FileIcon path={r.fileName} />
              <span className="truncate flex-1">{r.filePath}</span>
              {r.matchSnippet && (
                <span className="text-[8px] truncate max-w-[100px]" style={{ color: "var(--text-quaternary)" }}>
                  {r.matchSnippet.replace(/\n/g, " ").slice(0, 40)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})
