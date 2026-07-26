import { Component, type ErrorInfo, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { AlertTriangle, RefreshCw, RotateCcw, Copy } from "lucide-react"

interface ErrorBoundaryProps {
  children: ReactNode
  name: string
  fallback?: ReactNode
  onError?: (error: Error, info: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ errorInfo: info })
    console.error(`[ErrorBoundary:${this.props.name}]`, error, info.componentStack)
    if (typeof window !== "undefined" && (window as any).__runtimeCrashReporter) {
      (window as any).__runtimeCrashReporter.capture({
        component: this.props.name,
        error: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
      })
    }
    this.props.onError?.(error, info)
  }

  handleCopyError = () => {
    const { error, errorInfo } = this.state
    const text = [
      `Component: ${this.props.name}`,
      `Error: ${error?.message ?? "Unknown"}`,
      ``,
      `Stack:`,
      error?.stack ?? "N/A",
      ``,
      `Component Stack:`,
      errorInfo?.componentStack ?? "N/A",
    ].join("\n")
    navigator.clipboard.writeText(text).catch(() => {})
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleReloadConversation = () => {
    window.dispatchEvent(new CustomEvent("conversation:reset"))
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      const isDev = typeof window !== "undefined" && (window as any).__DEV__ !== false
      return (
        <div className={cn(
          "flex flex-col items-center justify-center p-6 rounded-lg border m-3",
          "bg-[var(--color-accent-red)]/[0.04] border-[var(--color-accent-red)]/15",
        )}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-[var(--color-accent-red)]" />
            <p className="text-xs font-semibold text-[var(--color-accent-red)]">
              {this.props.name} crashed
            </p>
          </div>

          <p className="text-[11px] text-[var(--text-tertiary)] mb-3 max-w-xs text-center leading-relaxed">
            {this.state.error?.message ?? "An unexpected error occurred"}
          </p>

          {isDev && this.state.error?.stack && (
            <details className="w-full max-w-md mb-3">
              <summary className="cursor-pointer text-[10px] text-[var(--text-quaternary)] hover:text-[var(--text-tertiary)]">
                View stack trace
              </summary>
              <pre className="mt-2 max-h-32 overflow-auto rounded border border-[var(--border-subtle)] bg-[var(--surface-app)] p-2 text-[9px] leading-relaxed text-[var(--text-tertiary)] font-mono">
                {this.state.error.stack}
              </pre>
            </details>
          )}

          <div className="flex items-center gap-2 flex-wrap justify-center">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-md bg-[var(--color-accent-red)]/10 text-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/20 transition-colors font-medium"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
            <button
              onClick={this.handleReloadConversation}
              className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-md bg-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--border-default)] transition-colors font-medium"
            >
              <RotateCcw className="h-3 w-3" />
              Reset conversation
            </button>
            {isDev && (
              <button
                onClick={this.handleCopyError}
                className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-md bg-[var(--border-subtle)] text-[var(--text-tertiary)] hover:bg-[var(--border-default)] hover:text-[var(--text-secondary)] transition-colors"
              >
                <Copy className="h-3 w-3" />
                Copy error
              </button>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
