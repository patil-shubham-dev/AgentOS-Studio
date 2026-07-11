export interface CrashReport {
  component: string
  error: string
  stack?: string
  componentStack?: string
  timestamp: number
  route?: string
  runtimeState?: string
  sessionId?: string | null
}

class RuntimeCrashReporterImpl {
  private reports: CrashReport[] = []
  private listeners = new Set<(report: CrashReport) => void>()
  private maxReports = 50

  capture(report: Omit<CrashReport, "timestamp" | "route" | "runtimeState" | "sessionId">): void {
    const full: CrashReport = {
      ...report,
      timestamp: Date.now(),
      route: typeof window !== "undefined" ? window.location.pathname : "unknown",
      runtimeState: this.getRuntimeState(),
      sessionId: this.getSessionId(),
    }
    this.reports.push(full)
    if (this.reports.length > this.maxReports) {
      this.reports.shift()
    }
    for (const cb of this.listeners) {
      try { cb(full) } catch { /* drop dead listeners */ }
    }
    console.error(`[RuntimeCrash] ${report.component}: ${report.error}`)
  }

  subscribe(cb: (report: CrashReport) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  getReports(): CrashReport[] {
    return [...this.reports]
  }

  clear(): void {
    this.reports = []
  }

  private getRuntimeState(): string {
    try {
      const sm = (globalThis as any).__sessionManager
      const session = sm?.getActive?.()
      return session?.getState?.() ?? "unknown"
    } catch {
      return "unknown"
    }
  }

  private getSessionId(): string | null {
    try {
      const sm = (globalThis as any).__sessionManager
      return sm?.getActiveSessionId?.() ?? null
    } catch {
      return null
    }
  }
}

export const runtimeCrashReporter = new RuntimeCrashReporterImpl()

if (typeof window !== "undefined") {
  (window as any).__runtimeCrashReporter = runtimeCrashReporter
}
