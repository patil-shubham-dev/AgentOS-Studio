import { Component, type ErrorInfo, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { AlertTriangle, RefreshCw } from "lucide-react"

interface ErrorBoundaryProps {
  children: ReactNode
  name: string
  fallback?: ReactNode
  onError?: (error: Error, info: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
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

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className={cn(
          "flex flex-col items-center justify-center p-4 rounded-lg border",
          "bg-red-950/30 border-red-500/20",
        )}>
          <AlertTriangle className="h-5 w-5 text-red-400 mb-2" />
          <p className="text-[10px] font-medium text-red-300 mb-1">
            {this.props.name} crashed
          </p>
          <p className="text-[9px] text-red-400/60 mb-2 max-w-xs text-center">
            {this.state.error?.message ?? "Unknown error"}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-1 text-[9px] px-2 py-1 rounded bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
          >
            <RefreshCw className="h-2.5 w-2.5" />
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
