import { FilePlus, FolderPlus, RefreshCw, ChevronsUpDown, ChevronsDown, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface WorkspaceHeaderProps {
  rootPath: string | null
  fileCount: number
  isLoading: boolean
  onNewFile: () => void
  onNewFolder: () => void
  onRefresh: () => void
  onCollapseAll: () => void
  onExpandAll: () => void
  onCloseWorkspace?: () => void
}

export function WorkspaceHeader(props: WorkspaceHeaderProps) {
  const { rootPath, fileCount, isLoading, onNewFile, onNewFolder, onRefresh, onCollapseAll, onExpandAll, onCloseWorkspace } = props
  const name = rootPath ? rootPath.split(/[/\\]+/).pop() : ""

  return (
    <div className="border-b border-white/[0.04]">
      <div className="flex items-center justify-between px-1 py-0.5">
        <div className="flex items-center gap-1.5 min-w-0 px-1">
          <span className="text-[10px] font-semibold text-white/30 uppercase tracking-[0.08em] select-none truncate max-w-[160px]">
            {name || "Explorer"}
          </span>
          {rootPath && !isLoading && (
            <span className="text-[9px] text-white/20 font-mono shrink-0">{fileCount}</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <HeaderButton onClick={onNewFile} disabled={!rootPath} title="New File">
            <FilePlus className="h-[11px] w-[11px]" />
          </HeaderButton>
          <HeaderButton onClick={onNewFolder} disabled={!rootPath} title="New Folder">
            <FolderPlus className="h-[11px] w-[11px]" />
          </HeaderButton>
          <HeaderButton onClick={onRefresh} disabled={!rootPath || isLoading} title="Refresh Explorer">
            {isLoading ? <Loader2 className="h-[11px] w-[11px] animate-spin" /> : <RefreshCw className="h-[11px] w-[11px]" />}
          </HeaderButton>
          <HeaderButton onClick={onCollapseAll} disabled={!rootPath} title="Collapse All">
            <ChevronsUpDown className="h-[11px] w-[11px]" />
          </HeaderButton>
          <HeaderButton onClick={onExpandAll} disabled={!rootPath} title="Expand All">
            <ChevronsDown className="h-[11px] w-[11px]" />
          </HeaderButton>
          {rootPath && (
            <HeaderButton onClick={onCloseWorkspace} title="Close Workspace">
              <X className="h-[11px] w-[11px]" />
            </HeaderButton>
          )}
        </div>
      </div>
    </div>
  )
}

function HeaderButton({ onClick, disabled, title, children }: { onClick?: () => void; disabled?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick ?? undefined}
      disabled={disabled}
      title={title}
      className={cn(
        "rounded p-0.5 transition-all duration-100",
        "text-white/20 hover:text-white/60 hover:bg-white/[0.06]",
        "disabled:opacity-20 disabled:pointer-events-none",
      )}
    >
      {children}
    </button>
  )
}
