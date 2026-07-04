import { buildTool, type AgentTool } from "@/runtime/tools/core/AgentTool"
import type { ToolContext } from "@/runtime/tools/core/ToolContext"
import type { ToolResult } from "@/runtime/tools/core/ToolResult"
import { GlobalMemoryStore } from "@/core/memory/GlobalMemoryStore"

export const SavePreferenceTool: AgentTool = buildTool({
  name: "save_preference",
  description: "Save a global user preference (e.g. 'always use yarn', 'prefer functional components'). These persist across all workspaces.",
  inputSchema: {
    type: "object",
    properties: {
      key: { type: "string", description: "Unique preference key (e.g. 'package-manager', 'component-style')" },
      value: { type: "string", description: "Preference value (e.g. 'yarn', 'functional')" },
      category: {
        type: "string",
        enum: ["convention", "style", "workflow", "tool", "general"],
        description: "Category for organizing preferences",
      },
    },
    required: ["key", "value"],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => true,
  requiredCapabilities: () => [],
  getActivityDescription: (input) => {
    const p = (input as any)?.key
    return p ? `Saving preference "${p}"` : "Saving a preference"
  },
  permissions: async () => ({ behavior: "allow" }),
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const key = input.key as string
    const value = input.value as string
    const category = (input.category as GlobalPreferenceCategory) ?? "general"
    await GlobalMemoryStore.getInstance().setPreference(key, value, category, ctx.role ?? "agent")
    return {
      data: `Preference saved: ${key} = ${value}`,
      meta: { status: "saved", key, value, category },
    }
  },
})

type GlobalPreferenceCategory = "convention" | "style" | "workflow" | "tool" | "general"
