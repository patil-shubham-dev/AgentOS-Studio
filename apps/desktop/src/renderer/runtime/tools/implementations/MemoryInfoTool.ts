import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export const MemoryInfoTool: AgentTool = buildTool({
  name: 'memory_info',
  aliases: ['meminfo', 'system_info'],
  description: 'Display current memory usage, CPU information, and system resource utilization. Provides heap usage, total memory, CPU core count, and device memory. Useful for diagnosing performance issues or checking resource availability.',
  inputSchema: {
    type: 'object',
    properties: {
      detailed: {
        type: 'boolean',
        description: 'If true, returns detailed memory breakdown including heap stats',
      },
    },
    required: [],
  },
  promptCategory: 'utilities',
  promptPriority: 55,
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  requiredCapabilities: () => [ToolCapabilities.READ_ONLY],
  getActivityDescription: () => 'Checking system memory',
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const detailed = input.detailed === true
    let heapUsed = 0
    let heapTotal = 0
    let rss = 0

    try {
      const mem = process.memoryUsage()
      heapUsed = mem.heapUsed
      heapTotal = mem.heapTotal
      rss = mem.rss
    } catch {
      // process.memoryUsage may not be available in all environments
    }

    const cpuCores = navigator.hardwareConcurrency || 0
    const deviceMem = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 0

    const summary: Record<string, string> = {
      'Heap Used': formatBytes(heapUsed),
      'Heap Total': formatBytes(heapTotal),
      'RSS': formatBytes(rss),
      'Heap Usage': heapTotal > 0 ? `${((heapUsed / heapTotal) * 100).toFixed(1)}%` : 'N/A',
      'CPU Cores': String(cpuCores),
      'Device Memory': deviceMem > 0 ? `${deviceMem} GB` : 'N/A',
    }

    let text = '## System Memory Info\n\n'
    text += '| Metric | Value |\n|---|---|\n'
    for (const [key, val] of Object.entries(summary)) {
      text += `| ${key} | ${val} |\n`
    }

    if (detailed) {
      const heapDiff = heapTotal - heapUsed
      text += `\n### Details\n`
      text += `- Heap fragmentation: ${formatBytes(heapDiff)} free (${heapTotal > 0 ? ((heapDiff / heapTotal) * 100).toFixed(1) : 'N/A'}% of total)\n`
      text += `- Available device memory: ${deviceMem > 0 ? `${deviceMem} GB` : 'unknown'}\n`
      text += `- Logical CPU cores: ${cpuCores}\n`
    }

    return {
      data: {
        heapUsed,
        heapTotal,
        rss,
        cpuCores,
        deviceMemoryGB: deviceMem,
      },
      meta: { type: 'memory_info' },
      newMessages: [{ role: 'user', content: text }],
    }
  },
})
