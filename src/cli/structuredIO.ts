/**
 * Structured I/O format — NDJSON-based protocol for headless mode.
 * Inspired by Claude Code's structuredIO.ts.
 *
 * Messages are newline-delimited JSON (NDJSON).
 * Each line is a JSON object with a "type" field.
 *
 * Output message types:
 *   { type: "text", content: string }
 *   { type: "tool_start", toolName: string, args: Record<string, unknown> }
 *   { type: "tool_result", toolName: string, result: unknown, isError?: boolean }
 *   { type: "error", message: string }
 *   { type: "done", finishReason: string }
 *   { type: "metadata", key: string, value: unknown }
 *   { type: "thinking", content: string }
 *
 * Input message types:
 *   { type: "message", content: string }
 *   { type: "stdin", data: string }
 *   { type: "cancel" }
 *   { type: "config", key: string, value: unknown }
 */

export type StructuredOutputEvent =
  | { type: "text"; content: string }
  | { type: "tool_start"; toolName: string; args: Record<string, unknown> }
  | { type: "tool_result"; toolName: string; result: unknown; isError?: boolean }
  | { type: "error"; message: string; code?: string }
  | { type: "done"; finishReason: string; usage?: { promptTokens: number; completionTokens: number } }
  | { type: "metadata"; key: string; value: unknown }
  | { type: "thinking"; content: string }

export type StructuredInputEvent =
  | { type: "message"; content: string }
  | { type: "stdin"; data: string }
  | { type: "cancel" }
  | { type: "config"; key: string; value: unknown }

function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj)
  } catch {
    return JSON.stringify({ type: "error", message: "Failed to serialize output" })
  }
}

export function writeStructuredOutput(event: StructuredOutputEvent): void {
  process.stdout.write(safeStringify(event) + "\n")
}

export function parseStructuredInput(line: string): StructuredInputEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed)
    if (!parsed.type) return null
    return parsed as StructuredInputEvent
  } catch {
    return null
  }
}

export function createStructuredReader(): {
  readInput(): Promise<StructuredInputEvent | null>
  close(): void
} {
  let buffer = ""
  let closed = false

  function readLine(): string | null {
    const idx = buffer.indexOf("\n")
    if (idx === -1) return null
    const line = buffer.slice(0, idx)
    buffer = buffer.slice(idx + 1)
    return line
  }

  return {
    readInput(): Promise<StructuredInputEvent | null> {
      return new Promise((resolve) => {
        if (closed) return resolve(null)

        const line = readLine()
        if (line !== null) {
          return resolve(parseStructuredInput(line))
        }

        const onData = (chunk: Buffer) => {
          buffer += chunk.toString()
          const l = readLine()
          if (l !== null) {
            process.stdin.removeListener("data", onData)
            resolve(parseStructuredInput(l))
          }
        }

        process.stdin.on("data", onData)
        process.stdin.on("end", () => {
          process.stdin.removeListener("data", onData)
          closed = true
          resolve(null)
        })
      })
    },
    close() {
      closed = true
      process.stdin.removeAllListeners("data")
    },
  }
}

export function writeError(message: string, code?: string): void {
  writeStructuredOutput({ type: "error", message, code })
}

export function writeText(content: string): void {
  writeStructuredOutput({ type: "text", content })
}

export function writeDone(finishReason: string, usage?: { promptTokens: number; completionTokens: number }): void {
  writeStructuredOutput({ type: "done", finishReason, usage })
}

export function writeToolStart(toolName: string, args: Record<string, unknown>): void {
  writeStructuredOutput({ type: "tool_start", toolName, args })
}

export function writeToolResult(toolName: string, result: unknown, isError?: boolean): void {
  writeStructuredOutput({ type: "tool_result", toolName, result, isError })
}

export function writeMetadata(key: string, value: unknown): void {
  writeStructuredOutput({ type: "metadata", key, value })
}

export function writeThinking(content: string): void {
  writeStructuredOutput({ type: "thinking", content })
}
