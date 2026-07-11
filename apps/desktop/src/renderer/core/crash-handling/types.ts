export type CrashType = 'renderer' | 'route' | 'panel' | 'workspace' | 'provider' | 'runtime'

export interface RuntimeSnapshot {
  subscriptions: { owner: string; keys: string[] }[]
  timers: string[]
  mutationTrace: { store: string; action: string; time: number }[]
  eventBus: { listenerCount: number; types: string[] }
  storeStatus: {
    workspaceRuntime: string
    workspaceRuntimeHealth: string
  }
  memory?: {
    jsHeapSizeLimit?: number
    totalJSHeapSize?: number
    usedJSHeapSize?: number
  }
}

export interface CrashEntry {
  timestamp: string
  type: CrashType
  error: string
  stack?: string
  componentStack?: string
  route?: string
  panel?: string
  metadata?: Record<string, unknown>
  runtimeSnapshot?: RuntimeSnapshot
}
