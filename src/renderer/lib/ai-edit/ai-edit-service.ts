import type { ChatMessage } from "@agentic-os/providers"
import { chatCompletion } from "@agentic-os/providers"
import type { RuntimeRole } from "@/types"
import { useAppStore } from "@/stores/app-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"

// ── Types ──

interface AIEditRequest {
  filePath: string
  language: string
  selectedCode: string
  fullFileContent: string
  instruction: string
}

interface AIEditResult {
  editedCode: string
  patch: string
  explanation?: string
}

interface ProviderConfig {
  baseUrl: string
  apiKey: string
  model: string
  runtime: string | null
}

// ── Prompt ──

function buildEditPrompt(req: AIEditRequest): ChatMessage[] {
  const systemPrompt = `You are an expert code editor. Given a file and a section of code, apply the user's edit instruction precisely.

Rules:
1. Return ONLY the replaced section of code
2. Do NOT include any explanation or markdown formatting
3. Keep the exact same indentation style
4. If the instruction is unclear, return the original code unchanged
5. The output should be valid ${req.language} code only`

  const userPrompt = `File: ${req.filePath}
Language: ${req.language}

Full file content:
\`\`\`${req.language}
${req.fullFileContent}
\`\`\`

Selected code to edit:
\`\`\`${req.language}
${req.selectedCode}
\`\`\`

Instruction: ${req.instruction}

Return only the edited version of the selected code, with no explanation or formatting.`

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]
}

// ── Diff Generation ──

function generateUnifiedDiff(original: string, edited: string): string {
  if (original === edited) return ""

  const origLines = original.split("\n")
  const editLines = edited.split("\n")
  const lines: string[] = []

  // Simple diff: find changed region
  let startOld = 0
  let startNew = 0
  let endOld = origLines.length
  let endNew = editLines.length

  // Find common prefix
  while (startOld < origLines.length && startNew < editLines.length &&
         origLines[startOld] === editLines[startNew]) {
    startOld++
    startNew++
  }

  // Find common suffix
  while (endOld > startOld && endNew > startNew &&
         origLines[endOld - 1] === editLines[endNew - 1]) {
    endOld--
    endNew--
  }

  const oldCount = endOld - startOld
  const newCount = endNew - startNew

  if (oldCount === 0 && newCount === 0) return ""

  lines.push(`@@ -${startOld + 1},${oldCount} +${startNew + 1},${newCount} @@`)

  for (let i = startOld; i < endOld; i++) {
    lines.push(`-${origLines[i]}`)
  }
  for (let i = startNew; i < endNew; i++) {
    lines.push(`+${editLines[i]}`)
  }

  return lines.join("\n")
}

// ── Provider Resolution ──

function resolveEditProvider(): ProviderConfig | null {
  const { wiredAgents } = useWorkspaceRuntime.getState()
  const providers = useAppStore.getState().providers ?? []

  // Prefer coder role for edits
  const wired = wiredAgents.find((a) => a.runtimeRole === "coder" || a.roleId === "coder")
  if (!wired) return null

  const provider = providers.find((p) => p.id === wired.providerId)
  if (!provider) return null

  return {
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: wired.model,
    runtime: provider.runtime,
  }
}

// ── Main Service ──

export async function requestAIEdit(
  req: AIEditRequest,
  signal?: AbortSignal,
): Promise<AIEditResult> {
  const config = resolveEditProvider()
  if (!config) {
    throw new Error("No AI provider configured. Set up a provider in Settings → Roles.")
  }

  const messages = buildEditPrompt(req)

  const response = await chatCompletion(
    config.baseUrl,
    config.apiKey,
    config.runtime,
    {
      model: config.model,
      messages,
      maxTokens: 4096,
      temperature: 0.3,
    },
    signal,
  )

  const editedCode = response.message.content?.trim() ?? req.selectedCode

  const patch = generateUnifiedDiff(req.selectedCode, editedCode)

  return {
    editedCode,
    patch,
    explanation: undefined,
  }
}
