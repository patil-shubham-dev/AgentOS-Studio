export interface ParsedTerminalLine {
  text: string
  segments: Array<{ text: string; type: "plain" | "filepath" | "error" | "lineno" }>
}

const FILE_PATH_RE = /(?:^|\s)((?:\.(?:\/|\\))?(?:(?:[a-zA-Z]:(?:\\[^\\:\n"'\s]+)+)|(?:\/(?:[^\/\n"'\s])+)+(?:\/[^:\n"'\s]+\.\w+)|(?:[a-zA-Z0-9_-]+\/[^:\n"'\s]+\.\w+)))(?::(\d+))?(?::(\d+))?(?=\s|$)/gim
const ERROR_RE = /^(error|Error|ERROR|failed|Failed|FAILED|Cannot|cannot|Exception)\b/m
const FILE_LOCATION_TEST_RE = /(?:\.(?:\/|\\))?(?:(?:[a-zA-Z]:(?:\\[^\\:\n"'\s]+)+)|(?:\/(?:[^\/\n"'\s])+)+(?:\/[^:\n"'\s]+\.\w+)|(?:[a-zA-Z0-9_-]+\/[^:\n"'\s]+\.\w+))/i

export function parseTerminalOutput(output: string): ParsedTerminalLine[] {
  const lines = output.split("\n")
  const result: ParsedTerminalLine[] = []

  for (const line of lines) {
    const parsed = parseLine(line)
    result.push(parsed)
  }

  return result
}

function parseLine(line: string): ParsedTerminalLine {
  const isError = ERROR_RE.test(line) || line.includes("error:")
  const segments: ParsedTerminalLine["segments"] = []
  let lastIndex = 0

  FILE_PATH_RE.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = FILE_PATH_RE.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: line.slice(lastIndex, match.index), type: isError ? "error" : "plain" })
    }

    let fullPath = match[1].trim()
    if (fullPath.startsWith("./") || fullPath.startsWith(".\\")) {
      fullPath = fullPath.slice(2)
    }
    const lineNo = match[2] ?? undefined
    segments.push({ text: fullPath, type: "filepath" })
    if (lineNo) {
      segments.push({ text: `:${lineNo}`, type: "lineno" })
      if (match[3]) {
        segments.push({ text: `:${match[3]}`, type: "lineno" })
      }
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < line.length) {
    segments.push({ text: line.slice(lastIndex), type: isError ? "error" : "plain" })
  }

  if (segments.length === 0) {
    segments.push({ text: line, type: isError ? "error" : "plain" })
  }

  return { text: line, segments }
}

export interface FileLocation {
  path: string
  line?: number
  column?: number
}

const FILE_LOCATION_RE = /(?:\.(?:\/|\\))?(?:(?:[a-zA-Z]:(?:\\[^\\:\n"'\s]+)+)|(?:\/(?:[^\/\n"'\s])+)+(?:\/[^:\n"'\s]+\.\w+)|(?:[a-zA-Z0-9_-]+\/[^:\n"'\s]+\.\w+))(?::(\d+))?(?::(\d+))?/gi

export function extractFileLocations(output: string): FileLocation[] {
  const locations: FileLocation[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null

  FILE_LOCATION_RE.lastIndex = 0
  while ((match = FILE_LOCATION_RE.exec(output)) !== null) {
    const path = match[0].replace(/^[.\/\\]+/, "")
    const line = match[1] ? parseInt(match[1], 10) : undefined
    const column = match[2] ? parseInt(match[2], 10) : undefined

    if (!path.includes("node_modules") && !seen.has(path)) {
      seen.add(path)
      locations.push({ path, line, column })
    }
  }

  return locations
}

export function hasFileLocations(output: string): boolean {
  FILE_LOCATION_TEST_RE.lastIndex = 0
  return FILE_LOCATION_TEST_RE.test(output)
}
