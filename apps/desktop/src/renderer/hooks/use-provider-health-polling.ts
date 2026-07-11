import { useEffect, useRef, useCallback } from "react"
import { useAppStore } from "@/stores/app-store"
import { runFullValidation } from "@agentic-os/providers"

const POLL_INTERVAL_MS = 30_000
const INITIAL_DELAY_MS = 2_000

export interface HealthCheckProvider {
  baseUrl: string
  apiKey: string
  runtime: string | null
  models: { id: string }[]
}

/**
 * Core polling logic using the full 5-step validation pipeline.
 * Each provider gets the complete URL → Auth → Completion → Streaming → Capabilities check.
 * Respects a version token so stale runs can be aborted early.
 */
export async function runProviderHealthChecks(
  providers: HealthCheckProvider[],
  getVersion: () => number,
): Promise<void> {
  const runVersion = getVersion()

  for (const provider of providers) {
    if (runVersion !== getVersion()) return

    const models = provider.models.map((m) => m.id)
    try {
      await runFullValidation(provider.baseUrl, provider.apiKey, provider.runtime, models)
    } catch {
      // Validation errors are already recorded in the health cache
    }
  }
}

/**
 * useProviderHealthPolling
 *
 * Periodically runs full 5-step validation (URL → Auth → Completion → Streaming → Capabilities)
 * on all configured providers to keep the health cache up-to-date.
 *
 * This ensures:
 * - Provider health states reflect actual validation results
 * - Runtime health status is driven by real connectivity checks
 * - All 5 validation steps are executed, not just a basic ping
 * - The UI has accurate, structured diagnostics to display
 */
export function useProviderHealthPolling(enabled = true) {
  const providers = useAppStore((s) => s.providers)
  const initialized = useRef(false)
  const healthCheckVersion = useRef(0)

  const runHealthChecks = useCallback(async () => {
    if (!enabled || providers.length === 0) return

    const version = ++healthCheckVersion.current

    await runProviderHealthChecks(
      providers,
      () => healthCheckVersion.current,
    )
  }, [enabled, providers])

  // Initial run after a short delay
  useEffect(() => {
    if (!enabled || initialized.current) return
    initialized.current = true

    const timer = setTimeout(() => {
      runHealthChecks()
    }, INITIAL_DELAY_MS)

    return () => clearTimeout(timer)
  }, [enabled, runHealthChecks])

  // Periodic polling
  useEffect(() => {
    if (!enabled) return

    const interval = setInterval(() => {
      runHealthChecks()
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [enabled, runHealthChecks])

  // Run health checks when providers change (add/remove)
  const prevCount = useRef(providers.length)
  useEffect(() => {
    if (providers.length !== prevCount.current) {
      prevCount.current = providers.length
      runHealthChecks()
    }
  }, [providers.length, runHealthChecks])
}
