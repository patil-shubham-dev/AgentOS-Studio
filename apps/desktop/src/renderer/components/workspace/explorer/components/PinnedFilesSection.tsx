import { useCallback } from "react"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { Pin, X } from "lucide-react"
import { FileIcon } from "./FileIcon"

interface PinnedFilesSectionProps {
  rootPath: string | null
  onOpenPath: (path: string) => void
}

export function PinnedFilesSection({ rootPath, onOpenPath }: PinnedFilesSectionProps) {
  const pinned = useWorkspaceStore((s) => s.pinnedFiles)
  const togglePinFile = useWorkspaceStore((s) => s.togglePinFile)

  const handleUnpin = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    togglePinFile(path)
  }, [togglePinFile])

  if (!pinned || pinned.length === 0) return null

  return (
    <div style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <SectionHeader label="Pinned" count={pinned.length} />
      <div className="py-0.5">
        {pinned.map((path: string) => {
          const name = path.split("/").pop() || path
          return (
            <div
              key={path}
              onClick={() => {
                const abs = rootPath ? rootPath.replace(/\\/g, "/") + "/" + path : path
                onOpenPath(abs)
              }}
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
              onFocus={(e) => {
                e.currentTarget.style.outline = "2px solid var(--color-accent-brand)"
                e.currentTarget.style.outlineOffset = "-2px"
                e.currentTarget.style.background = "var(--border-default)"
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = ""
                e.currentTarget.style.background = "transparent"
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  const abs = rootPath ? rootPath.replace(/\\/g, "/") + "/" + path : path
                  onOpenPath(abs)
                }
              }}
            >
              <Pin className="h-2.5 w-2.5 shrink-0" style={{ color: "var(--text-quaternary)" }} />
              <FileIcon path={name} />
              <span className="truncate flex-1">{name}</span>
              <button
                onClick={(e) => handleUnpin(e, path)}
                className="p-0.5 rounded transition-all ml-auto"
                style={{ color: "transparent" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-tertiary)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "transparent"
                }}
                onFocus={(e) => {
                  e.currentTarget.style.outline = "2px solid var(--color-accent-brand)"
                  e.currentTarget.style.outlineOffset = "1px"
                }}
                onBlur={(e) => {
                  e.currentTarget.style.outline = ""
                }}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function RecentFilesSection({ rootPath, onOpenPath }: { rootPath: string | null; onOpenPath: (path: string) => void }) {
  const recentlyOpened = useWorkspaceStore((s) => s.recentlyOpened)

  if (!recentlyOpened || recentlyOpened.length === 0) return null

  return (
    <div style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <SectionHeader label="Recent" count={recentlyOpened.length} />
      <div className="py-0.5">
        {recentlyOpened.map((p: { path: string; timestamp: number }) => {
          const name = p.path.split("/").pop() || p.path
          return (
            <div
              key={p.path + p.timestamp}
              onClick={() => {
                const abs = rootPath ? rootPath.replace(/\\/g, "/") + "/" + p.path : p.path
                onOpenPath(abs)
              }}
              className="flex items-center gap-1.5 px-3 py-0.5 cursor-pointer text-[11px] transition-colors"
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
              onFocus={(e) => {
                e.currentTarget.style.outline = "2px solid var(--color-accent-brand)"
                e.currentTarget.style.outlineOffset = "-2px"
                e.currentTarget.style.background = "var(--border-default)"
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = ""
                e.currentTarget.style.background = "transparent"
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  const abs = rootPath ? rootPath.replace(/\\/g, "/") + "/" + p.path : p.path
                  onOpenPath(abs)
                }
              }}
            >
              <FileIcon path={name} />
              <span className="truncate flex-1">{name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function OpenEditorsSection({ rootPath, onOpenPath }: { rootPath: string | null; onOpenPath: (path: string) => void }) {
  const openFiles = useWorkspaceStore((s) => s.openFiles)
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath)
  const closeFile = useWorkspaceStore((s) => s.closeFile)

  if (!openFiles || openFiles.length === 0) return null

  return (
    <div style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <SectionHeader label="Open Editors" count={openFiles.length} />
      <div className="py-0.5">
        {openFiles.map((p) => {
          const isActive = p.path === activeFilePath
          return (
            <div
              key={p.path}
              onClick={() => {
                const abs = rootPath ? rootPath.replace(/\\/g, "/") + "/" + p.path : p.path
                onOpenPath(abs)
              }}
              className="flex items-center gap-1.5 px-3 py-0.5 cursor-pointer text-[11px] transition-colors group"
              tabIndex={0}
              role="button"
              style={{
                color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                background: isActive ? "var(--color-accent-brand-muted)" : "transparent",
                borderLeft: isActive ? "2px solid var(--color-accent-brand)" : "2px solid transparent",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = "var(--text-primary)"
                  e.currentTarget.style.background = "var(--border-default)"
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = "var(--text-secondary)"
                  e.currentTarget.style.background = "transparent"
                }
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = "2px solid var(--color-accent-brand)"
                e.currentTarget.style.outlineOffset = "-2px"
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = ""
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  const abs = rootPath ? rootPath.replace(/\\/g, "/") + "/" + p.path : p.path
                  onOpenPath(abs)
                }
              }}
            >
              <FileIcon path={p.name} />
              <span className="truncate flex-1">{p.name}</span>
              {p.isDirty && (
                <span className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ background: "var(--color-accent-amber)" }}
                  title="Unsaved changes" />
              )}
              <button
                onClick={(e) => { e.stopPropagation(); closeFile(p.path) }}
                className="p-0.5 rounded transition-all ml-auto"
                style={{ color: "transparent" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-tertiary)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "transparent"
                }}
                onFocus={(e) => {
                  e.currentTarget.style.outline = "2px solid var(--color-accent-brand)"
                  e.currentTarget.style.outlineOffset = "1px"
                }}
                onBlur={(e) => {
                  e.currentTarget.style.outline = ""
                }}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 select-none">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em]"
        style={{ color: "var(--text-quaternary)" }}>{label}</span>
      <span className="text-[9px] font-mono" style={{ color: "var(--text-quaternary)" }}>{count}</span>
    </div>
  )
}
