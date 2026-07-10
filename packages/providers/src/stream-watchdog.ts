export type WatchdogConfig = {
  timeoutMs: number
  warnThresholdMs: number
  onWarn?: (elapsedMs: number) => void
  onTimeout?: () => void
}

export class StreamWatchdog {
  private lastEventTime: number
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly config: WatchdogConfig
  private warned = false

  constructor(config: WatchdogConfig) {
    this.config = config
    this.lastEventTime = performance.now()
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      const elapsed = performance.now() - this.lastEventTime
      if (!this.warned && elapsed > this.config.warnThresholdMs) {
        this.warned = true
        this.config.onWarn?.(elapsed)
      }
      if (elapsed > this.config.timeoutMs) {
        this.config.onTimeout?.()
        this.stop()
      }
    }, 5_000)
  }

  pet(): void {
    this.lastEventTime = performance.now()
    this.warned = false
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
