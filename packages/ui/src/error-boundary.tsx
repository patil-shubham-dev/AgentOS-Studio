import * as React from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "./button"

interface AppErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  constructor(props: AppErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("AppErrorBoundary caught an error:", error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex min-h-[400px] w-full items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Something went wrong</h3>
              <p className="max-w-md text-sm text-muted-foreground">
                {this.state.error?.message || "An unexpected error occurred."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleRetry}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Backward-compatible alias
const ErrorBoundary = AppErrorBoundary

export { AppErrorBoundary, ErrorBoundary }
