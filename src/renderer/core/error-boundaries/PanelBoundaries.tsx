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


