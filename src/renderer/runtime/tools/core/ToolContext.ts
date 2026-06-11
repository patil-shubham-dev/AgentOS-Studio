export type ToolContext = {
  role: string
  executionMode?: string
  provider?: string
  model?: string
  signal?: AbortSignal
  env?: Record<string, string>
  cwd?: string
  traceId?: string
  messageHistory?: Array<{ role: string; content: string }>
  setProgress?: (msg: string) => void
  appendSystemMessage?: (msg: string) => void
  /** Called incrementally for streaming tool output (e.g., per command line). */
  onOutput?: (output: string) => void
}
