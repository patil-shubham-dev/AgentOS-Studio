import { useAppStore } from "@/stores/app-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"

interface AiCompletionRequest {
  prefix: string
  suffix: string
  filePath: string
  language: string
  recentCompletions: string[]
  openFiles: string[]
}

interface ProviderConfig {
  baseUrl: string
  apiKey: string
  model: string
  runtime: string | null
}

function resolveProvider(): ProviderConfig | null {
  const { wiredAgents } = useWorkspaceRuntime.getState()
  const providers = useAppStore.getState().providers ?? []
  const wired = wiredAgents.find((a) => a.roleId === "coder" || a.runtimeRole === "coder")
  if (!wired) return null
  const provider = providers.find((p) => p.id === wired.providerId)
  if (!provider) return null
  return { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: wired.model, runtime: provider.runtime }
}

function buildPrompt(req: AiCompletionRequest): string {
  return `Complete the code at cursor position. Return ONLY the completion text with no explanation or formatting.

Language: ${req.language}
File: ${req.filePath}

Code before cursor:
\`\`\`${req.language}
${req.prefix}
\`\`\`

Code after cursor:
\`\`\`${req.language}
${req.suffix}
\`\`\`

${req.recentCompletions.length > 0 ? `Recently accepted completions for context:\n${req.recentCompletions.slice(-3).join("\n")}\n\n` : ""}
Completion:`
}

export async function requestAiCompletion(req: AiCompletionRequest): Promise<string | null> {
  const config = resolveProvider()
  if (!config) return null

  const url = `${config.baseUrl.replace(/\/+$/, "")}/v1/chat/completions`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2000)

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: "You are a code completion engine. Generate concise, context-aware code completions. Never explain. Never format. Return only the completion text." },
          { role: "user", content: buildPrompt(req) },
        ],
        max_tokens: 128,
        temperature: 0.1,
        stop: ["\n\n\n"],
      }),
      signal: controller.signal,
    })

    if (!response.ok) return null

    const json = await response.json()
    const text = json?.choices?.[0]?.message?.content?.trim() ?? null
    return text
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
