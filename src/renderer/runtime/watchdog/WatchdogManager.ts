export interface WatchdogConfig {
  intervalMs: number
  timeoutMs: number
  maxRestarts: number
  healthCheckFn: () => boolean | Promise<boolean>
}

export class WatchdogManager {
  private static instance: WatchdogManager
  private interval: ReturnType<typeof setInterval> | null = null
  private restartCount: number = 0
  private config: WatchdogConfig = {
    intervalMs: 30000,
    timeoutMs: 5000,
    maxRestarts: 3,
    healthCheckFn: () => true,
  }
  private isHealthy: boolean = true
  private faultListeners: Array<() => void> = []

  static getInstance(): WatchdogManager {
    if (!WatchdogManager.instance) {
      WatchdogManager.instance = new WatchdogManager()
    }
    return WatchdogManager.instance
  }

  setConfig(config: Partial<WatchdogConfig>): void {
    this.config = { ...this.config, ...config }
  }

  start(): void {
    if (this.interval) return
    this.restartCount = 0
    this.interval = setInterval(async () => {
      try {
        const healthy = await Promise.resolve(this.config.healthCheckFn())
        this.isHealthy = healthy
        if (!healthy) this.handleFault()
      } catch {
        this.isHealthy = false
        this.handleFault()
      }
    }, this.config.intervalMs)
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  private handleFault(): void {
    this.restartCount++
    for (const listener of this.faultListeners) {
      try { listener() } catch {}
    }
    if (this.restartCount > this.config.maxRestarts) {
      this.stop()
    }
  }

  onFault(listener: () => void): () => void {
    this.faultListeners.push(listener)
    return () => { this.faultListeners = this.faultListeners.filter(l => l !== listener) }
  }

  getHealth(): boolean {
    return this.isHealthy
  }

  getRestartCount(): number {
    return this.restartCount
  }

  resetRestartCount(): void {
    this.restartCount = 0
  }

  ping(): void {
    this.isHealthy = true
  }
}
