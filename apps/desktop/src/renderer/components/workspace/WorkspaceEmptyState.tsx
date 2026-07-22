import { Clock3, FolderOpen, Pin } from "lucide-react"

import type { RecentWorkspace } from "@/lib/workspace"
import { cn } from "@/lib/utils"
import { PremiumGeometricEmptyState } from "./PremiumGeometricEmptyState"

interface WorkspaceEmptyStateProps {
  recentWorkspaces: RecentWorkspace[]
  onOpenWorkspace: () => void
  onOpenRecent: (path: string) => void
}

function formatRecentTime(timestamp: number): string {
  const elapsed = Date.now() - timestamp
  const minute = 60_000
  const hour = minute * 60
  const day = hour * 24

  if (elapsed < hour) return "Just now"
  if (elapsed < day) return `${Math.max(1, Math.round(elapsed / hour))}h ago`
  if (elapsed < day * 7) return `${Math.round(elapsed / day)}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function compactPath(path: string): string {
  const normalized = path.replace(/\\/g, "/")
  const parts = normalized.split("/").filter(Boolean)
  if (parts.length <= 3) return path
  return `${parts[0]}/.../${parts.slice(-2).join("/")}`
}

export function WorkspaceEmptyState({
  recentWorkspaces,
  onOpenWorkspace,
  onOpenRecent,
}: WorkspaceEmptyStateProps) {
  const visibleRecent = recentWorkspaces.slice(0, 4)

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-10">
      <div className="grid w-full max-w-3xl gap-8 md:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] md:items-center">
        <section className="flex min-w-0 flex-col items-center text-center md:items-start md:text-left">
          <PremiumGeometricEmptyState />
          <div className="mt-5 space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-accent-brand)]">
              AgenticOS
            </p>
            <h1 className="text-[22px] font-semibold leading-tight text-[var(--text-primary)]">
              Open a workspace
            </h1>
            <p className="max-w-sm text-[13px] leading-relaxed text-[var(--text-secondary)]">
              Pick a project folder and AgenticOS will restore files, context, chat, and review state around it.
            </p>
          </div>
          <button
            onClick={onOpenWorkspace}
            className="mt-6 inline-flex h-9 items-center gap-2 rounded-md border border-[var(--color-accent-brand-border)] bg-[var(--color-accent-brand-muted)] px-4 text-[13px] font-medium text-[var(--color-accent-brand-text)] transition-[background-color,border-color,transform] duration-[var(--motion-fast)] ease-[var(--motion-easing)] hover:border-[var(--color-accent-brand)]/45 hover:bg-[var(--color-accent-brand)]/20 active:scale-[0.98]"
          >
            <FolderOpen className="h-4 w-4" />
            Open Folder
          </button>
        </section>

        {visibleRecent.length > 0 && (
          <section className="min-w-0">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                Recent
              </h2>
              <Clock3 className="h-3.5 w-3.5 text-[var(--text-quaternary)]" />
            </div>
            <div className="space-y-2">
              {visibleRecent.map((workspace) => (
                <button
                  key={workspace.path}
                  onClick={() => onOpenRecent(workspace.path)}
                  className={cn(
                    "group flex w-full min-w-0 items-center gap-3 rounded-md border px-3 py-2.5 text-left",
                    "border-[var(--border-default)] bg-[var(--surface-elevated)]/70",
                    "transition-[background-color,border-color,transform] duration-[var(--motion-fast)] ease-[var(--motion-easing)]",
                    "hover:border-[var(--border-hover)] hover:bg-[var(--surface-overlay)] active:scale-[0.99]",
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-app)] text-[var(--color-accent-brand)]">
                    <FolderOpen className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[12px] font-medium text-[var(--text-primary)]">
                        {workspace.name}
                      </span>
                      {workspace.pinned && <Pin className="h-3 w-3 shrink-0 text-[var(--color-accent-amber)]" />}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-[var(--text-quaternary)]">
                      {compactPath(workspace.path)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-quaternary)]">
                    {formatRecentTime(workspace.lastOpened)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
