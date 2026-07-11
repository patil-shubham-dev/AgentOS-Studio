import type { KernelService, ServiceHealth, KernelOptions, BootReport, ServiceStatus } from "./types"
import { DEFAULT_KERNEL_OPTIONS } from "./types"

const LOG_PREFIX = "[RuntimeKernel]"

export class RuntimeKernel {
  private services = new Map<string, KernelService>()
  private status: ServiceStatus = "uninitialized"
  private options: KernelOptions
  private startTime = 0

  constructor(options?: Partial<KernelOptions>) {
    this.options = { ...DEFAULT_KERNEL_OPTIONS, ...options }
  }

  register(service: KernelService): void {
    if (this.services.has(service.id)) {
      console.warn(`${LOG_PREFIX} Service "${service.id}" already registered — skipping`)
      return
    }

    for (const dep of service.dependencies) {
      if (!this.services.has(dep)) {
        console.warn(`${LOG_PREFIX} Service "${service.id}" depends on unregistered "${dep}"`)
      }
    }

    this.services.set(service.id, service)
    if (import.meta.env.DEV) {
      console.debug(`${LOG_PREFIX} Registered service: ${service.id}`)
    }
  }

  get<T extends KernelService>(id: string): T | undefined {
    return this.services.get(id) as T | undefined
  }

  async boot(): Promise<BootReport> {
    const start = performance.now()
    this.status = "initializing"

    const serviceReports: BootReport["services"] = []

    const initOrder = this.resolveInitOrder()
    const promises: Promise<void>[] = []

    for (const id of initOrder) {
      const service = this.services.get(id)
      if (!service) continue

      const svcStart = performance.now()
      try {
        await service.initialize()
        const duration = performance.now() - svcStart
        serviceReports.push({ id, status: "running", duration })
        if (import.meta.env.DEV) {
          console.debug(`${LOG_PREFIX} Initialized: ${id} (${duration.toFixed(0)}ms)`)
        }
      } catch (err) {
        const duration = performance.now() - svcStart
        const msg = err instanceof Error ? err.message : String(err)
        serviceReports.push({ id, status: "error", duration, error: msg })
        console.error(`${LOG_PREFIX} Failed to initialize ${id}: ${msg}`)
      }
    }

    // Start all initialized services
    for (const report of serviceReports) {
      if (report.status !== "running") continue
      const service = this.services.get(report.id)
      if (!service) continue
      try {
        await service.start()
      } catch (err) {
        report.status = "error"
        report.error = err instanceof Error ? err.message : String(err)
        console.error(`${LOG_PREFIX} Failed to start ${report.id}: ${report.error}`)
      }
    }

    this.status = "running"
    this.startTime = Date.now()

    const duration = performance.now() - start
    const success = serviceReports.every((r) => r.status === "running")

    console.log(`${LOG_PREFIX} Boot ${success ? "OK" : "DEGRADED"} (${duration.toFixed(0)}ms, ${serviceReports.length} services)`)

    return { success, duration, services: serviceReports, kernel: this.status }
  }

  async shutdown(): Promise<void> {
    if (import.meta.env.DEV) {
      console.debug(`${LOG_PREFIX} Shutting down ${this.services.size} services...`)
    }

    const initOrder = this.resolveInitOrder().reverse()
    for (const id of initOrder) {
      const service = this.services.get(id)
      if (!service) continue
      try {
        await service.stop()
        await service.dispose()
      } catch (err) {
        console.error(`${LOG_PREFIX} Error disposing ${id}:`, err)
      }
    }

    this.services.clear()
    this.status = "disposed"
    console.log(`${LOG_PREFIX} Shutdown complete`)
  }

  health(): ServiceHealth {
    return {
      status: this.status,
      healthy: this.status === "running",
      uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
    }
  }

  serviceHealths(): Map<string, ServiceHealth> {
    const healths = new Map<string, ServiceHealth>()
    for (const [id, service] of this.services) {
      try {
        healths.set(id, service.health())
      } catch {
        healths.set(id, { status: "error", healthy: false, error: "health check failed" })
      }
    }
    return healths
  }

  private resolveInitOrder(): string[] {
    const visited = new Set<string>()
    const order: string[] = []

    function dfs(id: string, services: Map<string, KernelService>, path: Set<string>): void {
      if (visited.has(id)) return
      if (path.has(id)) {
        console.warn(`${LOG_PREFIX} Circular dependency detected: ${[...path, id].join(" -> ")}`)
        return
      }
      path.add(id)
      const service = services.get(id)
      if (service) {
        for (const dep of service.dependencies) {
          if (services.has(dep)) {
            dfs(dep, services, path)
          }
        }
      }
      visited.add(id)
      path.delete(id)
      order.push(id)
    }

    for (const id of this.services.keys()) {
      dfs(id, this.services, new Set())
    }

    return order
  }
}
