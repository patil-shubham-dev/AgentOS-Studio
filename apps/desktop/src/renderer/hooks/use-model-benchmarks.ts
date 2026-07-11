import { useState, useCallback, useEffect } from "react"
import { getAllProviderCache, getGatewayProviderHealth } from "@agentic-os/providers"
import type { GatewayProvider } from "@/types"

export interface ModelBenchmarkData {
  latencyMs: number | null
  tokensPerSec: number | null
  ttftMs: number | null
  p50Ms: number | null
  p95Ms: number | null
  p99Ms: number | null
  samples: number
  isHealthy: boolean
  lastChecked: number
  providerError: string | null
}

export interface BenchmarkSnapshot {
  [providerId: string]: ModelBenchmarkData
}

function collectBenchmarks(providers: GatewayProvider[]): BenchmarkSnapshot {
  const libHealth = getAllProviderCache()
  const snapshot: BenchmarkSnapshot = {}

  for (const provider of providers) {
    const gwHealth = getGatewayProviderHealth(provider.baseUrl)
    const libHealthEntry = libHealth[provider.baseUrl]

    const firstTokenMs = libHealthEntry?.firstTokenMs ?? []
    const avgFirstToken =
      firstTokenMs.length > 0
        ? firstTokenMs.reduce((a, b) => a + b, 0) / firstTokenMs.length
        : null

    const sorted = [...firstTokenMs].sort((a, b) => a - b)

    const latencyMs = gwHealth?.avgLatencyMs ?? null

    const tokensPerSec = null

    const ttftMs = avgFirstToken

    const p50 =
      sorted.length > 0
        ? sorted[Math.max(0, Math.floor(sorted.length * 0.5))] ?? null
        : null
    const p95 =
      sorted.length > 0
        ? sorted[Math.max(0, Math.floor(sorted.length * 0.95))] ?? null
        : null
    const p99 =
      sorted.length > 0
        ? sorted[Math.max(0, Math.floor(sorted.length * 0.99))] ?? null
        : null

    snapshot[provider.id] = {
      latencyMs,
      tokensPerSec,
      ttftMs,
      p50Ms: p50,
      p95Ms: p95,
      p99Ms: p99,
      samples: gwHealth?.samples ?? libHealthEntry?.totalRequests ?? 0,
      isHealthy: (gwHealth?.samples ?? 0) > 0,
      lastChecked: gwHealth?.lastSuccess ?? libHealthEntry?.lastStreamingSuccess ?? 0,
      providerError: null,
    }
  }

  return snapshot
}

export function useModelBenchmarks(
  providers: GatewayProvider[],
): {
  benchmarks: BenchmarkSnapshot
  refresh: () => void
  isLoading: boolean
} {
  const [benchmarks, setBenchmarks] = useState<BenchmarkSnapshot>(() =>
    collectBenchmarks(providers),
  )
  const [isLoading, setIsLoading] = useState(false)

  const refresh = useCallback(() => {
    setIsLoading(true)
    requestAnimationFrame(() => {
      setBenchmarks(collectBenchmarks(providers))
      setIsLoading(false)
    })
  }, [providers])

  useEffect(() => {
    const interval = setInterval(refresh, 30_000)
    return () => clearInterval(interval)
  }, [refresh])

  useEffect(() => {
    refresh()
  }, [providers.length])

  return { benchmarks, refresh, isLoading }
}
