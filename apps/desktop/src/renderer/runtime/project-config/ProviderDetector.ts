export interface DetectedProvider {
  id: string
  name: string
  baseUrl: string
  runtimeKey: string
  isLocal: boolean
  isOpenAiCompatible: boolean
  models: string[]
  reachable: boolean
  latencyMs: number
}

export type ProviderDetectionResult = {
  detected: DetectedProvider[]
  unreachable: { id: string; name: string; baseUrl: string; error: string }[]
}

const LOCAL_PROVIDERS = [
  {
    id: "ollama",
    name: "Ollama",
    baseUrl: "http://localhost:11434",
    runtimeKey: "Ollama",
    isLocal: true,
    isOpenAiCompatible: true,
    modelEndpoint: "/api/tags",
    modelPath: "models",
  },
  {
    id: "lm-studio",
    name: "LM Studio",
    baseUrl: "http://localhost:1234",
    runtimeKey: "LM Studio",
    isLocal: true,
    isOpenAiCompatible: true,
    modelEndpoint: "/v1/models",
    modelPath: "data",
  },
  {
    id: "vllm",
    name: "vLLM",
    baseUrl: "http://localhost:8000",
    runtimeKey: "vLLM",
    isLocal: true,
    isOpenAiCompatible: true,
    modelEndpoint: "/v1/models",
    modelPath: "data",
  },
  {
    id: "local-ai",
    name: "LocalAI",
    baseUrl: "http://localhost:8080",
    runtimeKey: "LocalAI",
    isLocal: true,
    isOpenAiCompatible: true,
    modelEndpoint: "/v1/models",
    modelPath: "data",
  },
]

async function checkReachability(baseUrl: string): Promise<{ reachable: boolean; latencyMs: number }> {
  const start = performance.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(`${baseUrl}/`, { signal: controller.signal, method: "HEAD" })
    clearTimeout(timeout)
    return { reachable: res.ok || res.status < 500, latencyMs: Math.round(performance.now() - start) }
  } catch {
    return { reachable: false, latencyMs: Math.round(performance.now() - start) }
  }
}

async function fetchModels(baseUrl: string, endpoint: string, modelPath: string): Promise<string[]> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(`${baseUrl}${endpoint}`, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return []
    const data = await res.json()
    const raw = modelPath.split(".").reduce((acc, key) => acc?.[key], data as Record<string, unknown>)
    if (Array.isArray(raw)) {
      return raw.map((m: Record<string, unknown>) => (m.name ?? m.id ?? m.model ?? "") as string).filter(Boolean)
    }
    return []
  } catch {
    return []
  }
}

export async function detectLocalProviders(): Promise<ProviderDetectionResult> {
  const detected: DetectedProvider[] = []
  const unreachable: { id: string; name: string; baseUrl: string; error: string }[] = []

  for (const provider of LOCAL_PROVIDERS) {
    const { reachable, latencyMs } = await checkReachability(provider.baseUrl)
    if (!reachable) {
      unreachable.push({ id: provider.id, name: provider.name, baseUrl: provider.baseUrl, error: "Not reachable" })
      continue
    }
    const models = await fetchModels(provider.baseUrl, provider.modelEndpoint, provider.modelPath)
    detected.push({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      runtimeKey: provider.runtimeKey,
      isLocal: true,
      isOpenAiCompatible: true,
      models,
      reachable: true,
      latencyMs,
    })
  }

  return { detected, unreachable }
}

export function buildProviderPayload(
  detected: DetectedProvider,
  apiKey: string,
): { name: string; baseUrl: string; apiKey: string; runtime: string | null; isLocal: boolean; isOpenAiCompatible: boolean; models: { id: string; name: string }[] } {
  return {
    name: detected.name,
    baseUrl: detected.baseUrl,
    apiKey: apiKey || "",
    runtime: detected.runtimeKey,
    isLocal: detected.isLocal,
    isOpenAiCompatible: detected.isOpenAiCompatible,
    models: detected.models.length > 0
      ? detected.models.map((m) => ({ id: m, name: m }))
      : [{ id: "default", name: `${detected.name} Default` }],
  }
}
