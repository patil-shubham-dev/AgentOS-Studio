import { Folder, FilePlus, FolderPlus, RefreshCw, ChevronsUpDown, ChevronsDown, Loader2 } from "lucide-react"
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
}

export function WorkspaceHeader({
  rootPath,
  fileCount,
  isLoading,
  onNewFile,
  onNewFolder,
  onRefresh,
  onCollapseAll,
  onExpandAll,
}: WorkspaceHeaderProps) {
  const name = rootPath ? rootPath.split(/[/\\]/).pop() : ""

  return (
    <div className="border-b border-white/[0.04]">
      <div className="flex items-center justify-between px-2 py-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Folder className="h-3 w-3 shrink-0 text-white/30" />
          <span className="text-[10px] font-medium text-white/25 uppercase tracking-widest truncate max-w-[160px]">
            {name || "Explorer"}
          </span>
          {rootPath && !isLoading && (
            <span className="text-[9px] text-white/15 shrink-0">
              {fileCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onNewFile}
            disabled={!rootPath}
            className={cn(
              "rounded p-0.5 transition-all",
              rootPath
                ? "text-white/25 hover:text-white/60 hover:bg-white/[0.06]"
                : "text-white/10 cursor-not-allowed"
            )}
            title="New File"
          >
            <FilePlus className="h-3 w-3" />
          </button>
          <button
            onClick={onNewFolder}
            disabled={!rootPath}
            className={cn(
              "rounded p-0.5 transition-all",
              rootPath
                ? "text-white/25 hover:text-white/60 hover:bg-white/[0.06]"
                : "text-white/10 cursor-not-allowed"
            )}
            title="New Folder"
          >
            <FolderPlus className="h-3 w-3" />
          </button>
          <button
            onClick={onRefresh}
            disabled={!rootPath || isLoading}
            className={cn(
              "rounded p-0.5 transition-all",
              rootPath && !isLoading
                ? "text-white/25 hover:text-white/60 hover:bg-white/[0.06]"
                : "text-white/10 cursor-not-allowed"
            )}
            title="Refresh"
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </button>
          <button
            onClick={onCollapseAll}
            disabled={!rootPath}
            className={cn(
              "rounded p-0.5 transition-all",
              rootPath
                ? "text-white/25 hover:text-white/60 hover:bg-white/[0.06]"
                : "text-white/10 cursor-not-allowed"
            )}
            title="Collapse All"
          >
            <ChevronsUpDown className="h-3 w-3" />
          </button>
          <button
            onClick={onExpandAll}
            disabled={!rootPath}
            className={cn(
              "rounded p-0.5 transition-all",
              rootPath
                ? "text-white/25 hover:text-white/60 hover:bg-white/[0.06]"
                : "text-white/10 cursor-not-allowed"
            )}
            title="Expand All"
          >
            <ChevronsDown className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
