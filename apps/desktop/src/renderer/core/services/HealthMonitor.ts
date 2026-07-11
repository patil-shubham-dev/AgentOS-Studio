import type { KernelService, ServiceHealth, ServiceStatus } from '../kernel/types'
import { StartupStore } from '@/lib/startup-store'
import { useToastStore } from '@/stores/toast-store'

interface MonitoredService {
  service: KernelService
  failures: number
  lastRestart: number
}

const CHECK_INTERVAL = 30000
const MAX_FAILURES = 3
const RESTART_COOLDOWN = 10000

const monitored = new Map<string, MonitoredService>()
let timer: ReturnType<typeof setInterval> | null = null

export const HealthMonitor = {
  start(services: KernelService[]) {
    for (const s of services) {
      monitored.set(s.id, { service: s, failures: 0, lastRestart: 0 })
    }
    if (timer) clearInterval(timer)
    timer = setInterval(() => checkAll(), CHECK_INTERVAL)
    if (typeof window !== 'undefined') {
      console.log(`[HealthMonitor] Monitoring ${services.length} services (every ${CHECK_INTERVAL / 1000}s)`)
    }
  },

  stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    monitored.clear()
  },

  getServiceHealths(): Map<string, ServiceHealth> {
    const result = new Map<string, ServiceHealth>()
    for (const [id, entry] of monitored) {
      try {
        result.set(id, entry.service.health())
      } catch {
        result.set(id, { status: 'failed' as ServiceStatus, healthy: false, error: 'health check threw' })
      }
    }
    return result
  },

  async restartService(id: string): Promise<boolean> {
    const entry = monitored.get(id)
    if (!entry) return false
    const now = Date.now()
    if (now - entry.lastRestart < RESTART_COOLDOWN) return false
    if (entry.failures >= MAX_FAILURES) return false

    entry.lastRestart = now
    entry.failures++
    const svc = entry.service

    StartupStore.updateService(svc.id, 'restarting' as any, `Restart attempt ${entry.failures}/${MAX_FAILURES}`)
    useToastStore.getState().addToast(`Recovering ${svc.id} (${entry.failures}/${MAX_FAILURES})...`, 'info', 4000)

    try {
      if (svc.restart) {
        await svc.restart()
      } else {
        await svc.stop()
        await svc.dispose()
        await svc.initialize()
        await svc.start()
      }
      entry.failures = 0
      StartupStore.updateService(svc.id, 'ready', undefined)
      useToastStore.getState().addToast(`${svc.id} recovered successfully`, 'success', 3000)
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      StartupStore.updateService(svc.id, 'failed' as any, `Restart failed: ${msg}`)
      useToastStore.getState().addToast(`Failed to recover ${svc.id}: ${msg}`, 'error', 6000)
      return false
    }
  },

  getStatus(id: string): { healthy: boolean; failures: number } {
    const entry = monitored.get(id)
    if (!entry) return { healthy: false, failures: 0 }
    try {
      const h = entry.service.health()
      return { healthy: h.healthy, failures: entry.failures }
    } catch {
      return { healthy: false, failures: entry.failures }
    }
  },
}

async function checkAll() {
  for (const [id, entry] of monitored) {
    try {
      const health = entry.service.health()
      if (!health.healthy) {
        console.warn(`[HealthMonitor] ${id} unhealthy: ${health.error || 'unknown'}`)
        useToastStore.getState().addToast(`${id} health degraded: ${health.error || 'unknown'}`, 'error', 5000)
        await HealthMonitor.restartService(id)
      }
    } catch {
      console.warn(`[HealthMonitor] ${id} health check threw — restarting`)
      useToastStore.getState().addToast(`${id} health check failed — restarting`, 'error', 5000)
      await HealthMonitor.restartService(id)
    }
  }
}
