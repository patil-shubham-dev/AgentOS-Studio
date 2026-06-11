import type { ChatMessage } from "@agentic-os/providers"
import { useAppStore } from "@/stores/app-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"

interface AIEditRequest {
  filePath: string
  language: string
  selectedCode: string
  fullFileContent: string
  instruction: string
}

export interface StreamingEditState {
  fullText: string
  tokenCount: number
  done: boolean
  error: string | null
}

export type StreamingEditCallback = (state: StreamingEditState) => void

interface ProviderConfig {
  baseUrl: string
  apiKey: string
  model: string
  runtime: string | null
}

function resolveEditProvider(): ProviderConfig | null {
  const { wiredAgents } = useWorkspaceRuntime.getState()
  const providers = useAppStore.getState().providers ?? []
  const wired = wiredAgents.find((a) => a.runtimeRole === "coder" || a.roleId === "coder")
  if (!wired) return null
  const provider = providers.find((p) => p.id === wired.providerId)
  if (!provider) return null
  return {
    baseUrl: provider.baseUrl.replace(/\/+$/, ""),
    apiKey: provider.apiKey,
    model: wired.model,
    runtime: provider.runtime,
  }
}

function buildEditPrompt(req: AIEditRequest): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You are an expert code editor. Given a file and a section of code, apply the user's edit instruction precisely.

Rules:
1. Return ONLY the replaced section of code
2. Do NOT include any explanation or markdown formatting
3. Keep the exact same indentation style
4. The output should be valid ${req.language} code only`,
    },
    {
      role: "user",
      content: `File: ${req.filePath}\nLanguage: ${req.language}\n\nFull file content:\n\`\`\`${req.language}\n${req.fullFileContent}\n\`\`\`\n\nSelected code to edit:\n\`\`\`${req.language}\n${req.selectedCode}\n\`\`\`\n\nInstruction: ${req.instruction}`,
    },
  ]
}

export async function streamAIEdit(
  req: AIEditRequest,
  onUpdate: StreamingEditCallback,
  signal?: AbortSignal,
): Promise<void> {
  const config = resolveEditProvider()
  if (!config) {
    onUpdate({ fullText: "", tokenCount: 0, done: false, error: "No AI provider configured. Set up a provider in Settings → Roles." })
    return
  }

  const messages = buildEditPrompt(req)
  const url = `${config.baseUrl}/v1/chat/completions`

  const body = JSON.stringify({
    model: config.model,
    messages,
    stream: true,
    max_tokens: 4096,
    temperature: 0.3,
  })

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
      signal,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => "")
      onUpdate({ fullText: "", tokenCount: 0, done: false, error: `HTTP ${response.status}: ${errText || response.statusText}` })
      return
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let fullText = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data: ")) continue
        const data = trimmed.slice(6)
        if (data === "[DONE]") continue

        try {
          const parsed = JSON.parse(data)
          const content = parsed?.choices?.[0]?.delta?.content
          if (content) {
            fullText += content
            onUpdate({ fullText, tokenCount: fullText.length, done: false, error: null })
          }
        } catch {
          // SSE parse glitch — skip
        }
      }
    }

    onUpdate({ fullText, tokenCount: fullText.length, done: true, error: null })
  } catch (err: any) {
    if (err?.name === "AbortError") return
    onUpdate({ fullText: "", tokenCount: 0, done: false, error: err?.message ?? "Request failed" })
  }
}
