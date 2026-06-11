import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { useDesignStore } from '@/stores/design-store'

export const DesignCreateArtifactTool: AgentTool = buildTool({
  name: 'design_create_artifact',
  description: 'Create a new design artifact in the DesignWorkspace with component code',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name for the design artifact' },
      description: { type: 'string', description: 'Description of the design' },
      code: { type: 'string', description: 'The full React + Tailwind component code' },
      label: { type: 'string', description: 'Version label' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
    },
    required: ['name', 'description', 'code', 'label'],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.SKILL_EXECUTION],
  getActivityDescription: (input) => {
    const n = (input as any)?.name
    return n ? `Creating design "${n}"` : 'Creating a design artifact'
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const a = input as Record<string, any>
    const id = useDesignStore.getState().addArtifact({
      name: String(a.name ?? ''),
      description: String(a.description ?? ''),
      tags: Array.isArray(a.tags) ? a.tags : ['ai-generated'],
    })
    useDesignStore.getState().addVersion(id, { label: String(a.label ?? 'AI Generated'), code: String(a.code ?? ''), changes: String(a.description ?? 'Created from AI request') })
    return { data: `Design artifact "${a.name}" created with ID: ${id}.` }
  },
})

export const DesignAddVersionTool: AgentTool = buildTool({
  name: 'design_add_version',
  description: 'Add a new version to an existing design artifact',
  inputSchema: {
    type: 'object',
    properties: {
      artifact_id: { type: 'string', description: 'The ID of the design artifact to update' },
      code: { type: 'string', description: 'Updated component code' },
      label: { type: 'string', description: 'Version label describing the change' },
      changes: { type: 'string', description: 'Description of what changed in this version' },
    },
    required: ['artifact_id', 'code', 'label', 'changes'],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.SKILL_EXECUTION],
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const a = input as Record<string, string>
    useDesignStore.getState().addVersion(a.artifact_id ?? '', { label: a.label ?? '', code: a.code ?? '', changes: a.changes ?? '' })
    return { data: `Version added to artifact ${a.artifact_id} (${a.label})` }
  },
})

export const DesignGeneratePreviewTool: AgentTool = buildTool({
  name: 'design_generate_preview',
  description: 'Generate an HTML preview string for a component design',
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Component code to generate a preview for' },
    },
    required: ['code'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  requiredCapabilities: () => [ToolCapabilities.SKILL_EXECUTION],
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const code = String(input.code ?? '')
    const html = `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body class="p-6 bg-[#0a0a0b] text-white min-h-screen"><pre class="bg-[#1a1a2e] p-4 rounded-lg text-sm overflow-auto"><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre></body></html>`
    return { data: html }
  },
})
