import { SafeErrorBoundary } from './SafeErrorBoundary'
import type { ReactNode } from 'react'

export function SidebarBoundary({ children }: { children: ReactNode }) {
  return (
    <SafeErrorBoundary name="Sidebar" onReset={() => window.location.reload()}>
      {children}
    </SafeErrorBoundary>
  )
}

export function WorkspaceBoundary({ children }: { children: ReactNode }) {
  return (
    <SafeErrorBoundary name="Workspace">
      {children}
    </SafeErrorBoundary>
  )
}

export function EditorBoundary({ children }: { children: ReactNode }) {
  return (
    <SafeErrorBoundary name="Editor">
      {children}
    </SafeErrorBoundary>
  )
}

export function BrowserBoundary({ children }: { children: ReactNode }) {
  return (
    <SafeErrorBoundary name="Browser">
      {children}
    </SafeErrorBoundary>
  )
}

export function TerminalBoundary({ children }: { children: ReactNode }) {
  return (
    <SafeErrorBoundary name="Terminal">
      {children}
    </SafeErrorBoundary>
  )
}

export function AgentBoundary({ children }: { children: ReactNode }) {
  return (
    <SafeErrorBoundary name="Agent">
      {children}
    </SafeErrorBoundary>
  )
}
