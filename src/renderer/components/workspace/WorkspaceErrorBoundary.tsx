import { Component, type ErrorInfo, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { logCrash } from "@/core/crash-handling"
import { AlertTriangle, RefreshCw, FolderOpen, Bug } from "lucide-react"

interface WorkspaceErrorBoundaryProps {
  children: ReactNode
  onOpenFolder?: () => void
}

interface WorkspaceErrorBoundaryState {
  hasError: boolean
  error: Error | null
  stackTrace: string | null
}

export class WorkspaceErrorBoundary extends Component<WorkspaceErrorBoundaryProps, WorkspaceErrorBoundaryState> {
  constructor(props: WorkspaceErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, stackTrace: null }
  }

  static getDerivedStateFromError(error: Error): WorkspaceErrorBoundaryState {
    return { hasError: true, error, stackTrace: error.stack ?? null }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[WorkspaceErrorBoundary]", error, info.componentStack)
    logCrash({
      timestamp: new Date().toISOString(),
      type: "workspace",
      error: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
      route: "/code-canvas",
    }).catch(() => {})
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, stackTrace: null })
  }

  handleReportIssue = (): void => {
    logCrash({
      timestamp: new Date().toISOString(),
      type: "workspace",
      error: this.state.error?.message ?? "Unknown workspace crash",
      stack: this.state.error?.stack ?? undefined,
      route: "/code-canvas",
      metadata: { action: "user_report", fromErrorBoundary: true },
    }).catch(() => {})
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className={cn(
          "flex h-full w-full flex-col items-center justify-center p-8",
          "bg-[#0a0a0b]",
        )}>
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
              <AlertTriangle className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white/60">Workspace Crashed</h2>
              <p className="mt-1 text-sm text-white/30">
                Something went wrong while running the workspace.
              </p>
            </div>
            {this.state.error && (
              <div className={cn(
                "w-full rounded-lg border border-red-500/10 bg-red-950/20 p-3 text-left",
              )}>
                <p className="break-words font-mono text-[11px] text-red-300/80">
                  {this.state.error.message}
                </p>
                {this.state.stackTrace && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[10px] text-white/30 hover:text-white/50">
                      Stack trace
                    </summary>
                    <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[9px] text-white/20">
                      {this.state.stackTrace}
                    </pre>
                  </details>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={this.handleRetry}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border border-blue-500/20 px-4 py-2 text-xs font-medium",
                  "bg-blue-500/15 text-blue-400 transition-all hover:bg-blue-500/25",
                )}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
              {this.props.onOpenFolder && (
                <button
                  onClick={this.props.onOpenFolder}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-xs font-medium",
                    "bg-white/5 text-white/50 transition-all hover:bg-white/10 hover:text-white/70",
                  )}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Open Folder
                </button>
              )}
              <button
                onClick={this.handleReportIssue}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-xs font-medium",
                  "bg-white/5 text-white/50 transition-all hover:bg-white/10 hover:text-white/70",
                )}
              >
                <Bug className="h-3.5 w-3.5" />
                Report Issue
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
