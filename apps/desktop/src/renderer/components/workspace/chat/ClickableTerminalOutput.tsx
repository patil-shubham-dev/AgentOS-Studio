import { memo, useMemo, useCallback } from "react"
import { useWorkspaceStore } from "@/stores/workspace-store"

interface ClickableTerminalOutputProps {
  text: string
  maxLength?: number
  maxHeight?: number
  isError?: boolean
}

const FILE_PATH_PATTERN = /([a-zA-Z0-9_./\\-]+\.(?:ts|tsx|js|jsx|json|css|html|md|py|rs|go|java|rb|c|cpp|h|hpp|yaml|yml|toml|env|sh|bash|ps1|sql|graphql|svelte|vue))(?::(\d+))?(?::(\d+))?/g

export function parseFilePaths(text: string): Array<{ path: string; line?: number; col?: number; index: number; length: number }> {
  const matches: Array<{ path: string; line?: number; col?: number; index: number; length: number }> = []
  const re = new RegExp(FILE_PATH_PATTERN.source, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    matches.push({
      path: match[1],
      line: match[2] ? parseInt(match[2], 10) : undefined,
      col: match[3] ? parseInt(match[3], 10) : undefined,
      index: match.index,
      length: match[0].length,
    })
  }
  return matches
}

export const ClickableTerminalOutput = memo(function ClickableTerminalOutput({
  text,
  maxLength,
  maxHeight,
  isError,
}: ClickableTerminalOutputProps) {
  const displayText = useMemo(() => {
    if (!text) return ""
    if (maxLength && text.length > maxLength) {
      return text.slice(0, maxLength) + "\n… (truncated)"
    }
    return text
  }, [text, maxLength])

  const segments = useMemo(() => {
    if (!displayText) return []
    const paths = parseFilePaths(displayText)
    if (paths.length === 0) return [{ type: "text" as const, content: displayText }]

    const result: Array<{ type: "text" | "file"; content: string; path?: string; line?: number }> = []
    let lastIndex = 0
    for (const p of paths) {
      if (p.index > lastIndex) {
        result.push({ type: "text", content: displayText.slice(lastIndex, p.index) })
      }
      result.push({
        type: "file",
        content: displayText.slice(p.index, p.index + p.length),
        path: p.path,
        line: p.line,
      })
      lastIndex = p.index + p.length
    }
    if (lastIndex < displayText.length) {
      result.push({ type: "text", content: displayText.slice(lastIndex) })
    }
    return result
  }, [displayText])

  const handleOpen = useCallback((path: string, line?: number) => {
    const state = useWorkspaceStore.getState()
    const rootPath = state.rootPath
    const absolutePath = path.startsWith("/") || path.match(/^[a-zA-Z]:/)
      ? path
      : rootPath ? `${rootPath}/${path.replace(/\\/g, "/")}` : path
    state.openFileInDiffMode(absolutePath)
    if (line) {
      state.setCursorPosition(line, 1)
      state.setVisibleRange(line, line + 20)
    }
  }, [])

  return (
    <pre
      className="font-mono overflow-x-auto whitespace-pre-wrap break-all"
      style={{
        maxHeight: maxHeight ?? 300,
        color: isError ? "var(--color-accent-red)" : "var(--text-tertiary)",
        fontSize: 10,
        lineHeight: 1.6,
      }}
    >
      {segments.length > 0 ? (
        segments.map((seg, i) => {
          if (seg.type === "file" && seg.path) {
            return (
              <button
                key={i}
                onClick={() => handleOpen(seg.path!, seg.line)}
                className="inline cursor-pointer underline decoration-dotted underline-offset-2 hover:opacity-80 transition-opacity"
                style={{
                  color: isError ? "#fbbf24" : "var(--color-accent-blue, #60a5fa)",
                  textDecorationColor: isError ? "#fbbf24" : "var(--color-accent-blue, #60a5fa)",
                }}
                title={`Open ${seg.path}${seg.line ? `:${seg.line}` : ""}`}
              >
                {seg.content}
              </button>
            )
          }
          return <span key={i}>{seg.content}</span>
        })
      ) : (
        displayText || ""
      )}
    </pre>
  )
})
