export type ToolResult<T = unknown> = {
  data: T
  error?: string
  isError?: boolean
  newMessages?: Array<{ role: string; content: string }>
  contextModifier?: Record<string, unknown>
  meta?: Record<string, unknown>
}
