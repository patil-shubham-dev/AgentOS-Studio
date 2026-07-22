import { memo, useMemo } from "react"
import { semanticSearch } from "@/lib/semantic-search"
import { Search, Sparkles } from "lucide-react"
import { FileIcon } from "./FileIcon"

interface SemanticSearchSectionProps {
  query: string
  rootPath: string | null
  onOpenPath: (path: string) => void
}

export const SemanticSearchSection = memo(function SemanticSearchSection({
  query,
  rootPath,
  onOpenPath,
}: SemanticSearchSectionProps) {
  const results = useMemo(() => {
    if (!query.trim() || query.length < 2) return []
    if (!semanticSearch.ready) return []
    return semanticSearch.search(query, 8)
  }, [query])

  if (!query.trim() || results.length === 0) return null

  return (
    <div style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center gap-1.5 px-3 py-1 select-none">
        <Sparkles className="h-2.5 w-2.5" style={{ color: "var(--color-accent-brand)" }} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-quaternary)" }}>
          Semantic
        </span>
        <span className="text-[9px] font-mono" style={{ color: "var(--text-quaternary)" }}>{results.length}</span>
      </div>
      <div className="py-0.5">
        {results.map((r) => {
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
              <span className="text-[9px] font-mono shrink-0" style={{ color: "var(--text-quaternary)" }}>
                {r.score.toFixed(1)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
})
