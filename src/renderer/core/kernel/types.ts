export type ServiceStatus = "uninitialized" | "initializing" | "running" | "stopped" | "error" | "disposed"

export interface ServiceHealth {
  status: ServiceStatus
  healthy: boolean
  message?: string
  uptime?: number
  error?: string
}

export interface KernelService {
  readonly id: string
  readonly dependencies: string[]

  initialize(): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
  dispose(): Promise<void>
  health(): ServiceHealth
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
