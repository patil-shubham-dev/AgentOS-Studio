import { useAppStore } from '@/stores/app-store'
import { useSandboxStore } from '@/stores/sandbox-store'
import { Shield, GitBranch, FolderOpen } from 'lucide-react'

/**
 * SandboxStatusIndicator — a small badge in the bottom-left corner that shows
 * when sandbox mode is active and displays the current worktree path
 * when a sandbox is actively being used.
 */
export function SandboxStatusIndicator() {
  const sandboxMode = useAppStore((s) => s.sandboxMode)
  const activeSandbox = useSandboxStore((s) => s.activeSandbox)

  const isActive = sandboxMode === 'on'
  const hasWorktree = activeSandbox?.status === 'active' && activeSandbox.worktreePath

  if (!isActive) return null

  // Extract a short display name from the worktree path
  const worktreeName = hasWorktree
    ? activeSandbox!.worktreePath.split(/[/\\]/).pop() ?? activeSandbox!.worktreePath
    : null

  return (
    <div
      className="fixed bottom-2 left-2 z-50 flex items-center gap-1.5 rounded-lg border border-emerald-500/15 bg-emerald-500/8 px-2 py-1 shadow-lg backdrop-blur-sm"
      title={
        hasWorktree
          ? `Branch: ${activeSandbox!.branchName}\nWorktree: ${activeSandbox!.worktreePath}`
          : 'Sandbox mode is on — worktree will be created when writing files'
      }
    >
      {hasWorktree ? (
        <>
          <Shield className="h-3 w-3 text-emerald-400 shrink-0" />
          <GitBranch className="h-2.5 w-2.5 text-emerald-400/60 shrink-0" />
          <code className="text-[9px] font-mono text-emerald-400/80 max-w-[160px] truncate">
            {activeSandbox!.branchName}
          </code>
          <span className="text-[7px] text-emerald-400/30">·</span>
          <FolderOpen className="h-2 w-2 text-emerald-400/50 shrink-0" />
          <code className="text-[8px] font-mono text-emerald-400/50 max-w-[120px] truncate">
            {worktreeName}
          </code>
        </>
      ) : (
        <>
          <Shield className="h-3 w-3 text-emerald-400/60 shrink-0" />
          <span className="text-[9px] font-medium text-emerald-400/60">Sandbox</span>
        </>
      )}
    </div>
  )
}
