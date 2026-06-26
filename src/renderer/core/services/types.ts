export type ServiceStatus = 'uninitialized' | 'initializing' | 'running' | 'degraded' | 'failed' | 'restarting' | 'stopped' | 'disposed'

export interface ServiceHealth {
  status: ServiceStatus
  healthy: boolean
  message?: string
  uptime?: number
  error?: string
  lastChecked?: number
}

export interface KernelService {
  readonly id: string
  readonly dependencies: string[]
  initialize(): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
  dispose(): Promise<void>
  health(): ServiceHealth
  restart?(): Promise<void>
}

export type ReadinessLevel = 'shell' | 'settings' | 'workspace' | 'ai' | 'browser' | 'full'

export interface ReadinessState {
  level: ReadinessLevel
  ready: boolean
  label: string
  timestamp: number
}

export interface StartupReportEntry {
  phase: string
  duration: number
  status: 'success' | 'failed' | 'skipped'
  error?: string
  parallel?: boolean
}

export interface StartupReport {
  version: string
  platform: string
  mode: 'cold' | 'warm'
  totalDuration: number
  criticalPath: number
  deferredDuration: number
  entries: StartupReportEntry[]
  longestTask: { name: string; duration: number }
  failedServices: string[]
  services: { id: string; status: ServiceStatus; duration: number }[]
}

export interface KernelOptions {
  timeout: number
}

export const DEFAULT_KERNEL_OPTIONS: KernelOptions = {
  timeout: 10000,
}

export interface BootReport {
  success: boolean
  duration: number
  services: {
    id: string
    status: ServiceStatus
    duration: number
    error?: string
  }[]
  kernel: ServiceStatus
}
