import { type ReactNode } from 'react'
import { SafeErrorBoundary } from '../error-boundaries'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SafeErrorBoundary name="AppProviders">
      {children}
    </SafeErrorBoundary>
  )
}
