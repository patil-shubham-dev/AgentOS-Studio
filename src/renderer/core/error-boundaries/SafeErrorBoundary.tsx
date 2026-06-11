import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logCrash } from '../crash-handling'
import { cancelPendingRefresh } from '@/runtime/runtime-coordinator'
import { useWorkspaceRuntime } from '@/runtime/workspace-runtime'
import { emitTelemetry } from '@/lib/telemetry'

interface Props {
  children: ReactNode
  name: string
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  onReset?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  showDetails: boolean
}

const FRIENDLY_MESSAGES: Record<string, string> = {
  Application: "Something went wrong while running the app. Try refreshing the page.",
  Sidebar: "The sidebar encountered an issue. Try reopening it.",
  Workspace: "The workspace had a problem. You may need to reload.",
  Route: "This page couldn't load properly. Try navigating away and back.",
  Chat: "The chat view had an error. Your conversation is safe.",
}

function friendlyMessage(name: string): string {
  return FRIENDLY_MESSAGES[name] ?? `${name} encountered an unexpected issue. Try reloading the panel.`
}

export class SafeErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })

    emitTelemetry({
      type: "error_boundary_activation",
      timestamp: Date.now(),
      error: error.message,
      metadata: { boundary: this.props.name },
    })

    logCrash({
      timestamp: new Date().toISOString(),
      type: 'renderer',
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack ?? undefined,
      metadata: { boundary: this.props.name },
    })

    console.error(`[SafeErrorBoundary:${this.props.name}]`, error.message)

    this.props.onError?.(error, errorInfo)
  }

  handleReset = (): void => {
    if (import.meta.env.DEV) {
      console.log(`[SafeErrorBoundary:${this.props.name}] Resetting — cleaning runtime state`)
    }
    cancelPendingRefresh()
    useWorkspaceRuntime.getState().reset()
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false })
    this.props.onReset?.()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div style={{
          padding: '24px',
          margin: '8px',
          background: '#1a1a1f',
          border: '1px solid #ef4444',
          borderRadius: '12px',
          fontFamily: 'inherit',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ color: '#ef4444', fontSize: '18px' }}>!</span>
            <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '13px' }}>
              {this.props.name}
            </span>
          </div>

          <p style={{ color: '#aaa', fontSize: '12px', lineHeight: '1.5', marginBottom: '16px' }}>
            {friendlyMessage(this.props.name)}
          </p>

          {this.state.showDetails && (
            <div style={{
              background: '#0d0d10',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '12px',
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#888',
              maxHeight: '160px',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {this.state.error?.message}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '6px 16px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '12px',
              }}
            >
              Reload Panel
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '6px 16px',
                background: 'transparent',
                color: '#ccc',
                border: '1px solid #555',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '12px',
              }}
            >
              Reload Page
            </button>
            <button
              onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
              style={{
                padding: '6px 16px',
                background: 'transparent',
                color: '#888',
                border: '1px solid #555',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '12px',
              }}
            >
              {this.state.showDetails ? 'Hide Details' : 'Show Details'}
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
