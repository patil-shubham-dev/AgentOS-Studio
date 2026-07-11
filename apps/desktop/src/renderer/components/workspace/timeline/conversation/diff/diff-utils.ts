import hljs from "highlight.js"

export interface DiffLine {
  type: "add" | "del" | "context"
  content: string
  html?: string
}

export interface DiffHunk {
  header: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

export function parseDiff(diffContent: string): DiffHunk[] {
  if (!diffContent) return []

  const rawLines = diffContent.split("\n")
  const hunks: DiffHunk[] = []
  let currentHunk: DiffHunk | null = null

  for (const line of rawLines) {
    const hunkHeader = line.match(
      /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/,
    )
    if (hunkHeader) {
      if (currentHunk) hunks.push(currentHunk)
      currentHunk = {
        header: line,
        oldStart: parseInt(hunkHeader[1]),
        oldLines: parseInt(hunkHeader[2] || "1"),
        newStart: parseInt(hunkHeader[3]),
        newLines: parseInt(hunkHeader[4] || "1"),
        lines: [],
      }
      continue
    }

    if (!currentHunk) continue

    if (line.startsWith("+")) {
      currentHunk.lines.push({ type: "add", content: line.slice(1) })
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({ type: "del", content: line.slice(1) })
    } else if (line.startsWith(" ")) {
      currentHunk.lines.push({ type: "context", content: line.slice(1) })
    } else if (line.startsWith("\\")) {
      continue
    }
  }

  if (currentHunk) hunks.push(currentHunk)
  return hunks
}

export function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || ""
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    java: "java",
    cs: "csharp",
    php: "php",
    css: "css",
    scss: "scss",
    less: "less",
    html: "html",
    htm: "html",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "bash",
    dockerfile: "dockerfile",
    tf: "hcl",
    vue: "html",
    svelte: "html",
    xml: "xml",
    svg: "xml",
    toml: "ini",
    cfg: "ini",
    ini: "ini",
    kt: "kotlin",
    dart: "dart",
    swift: "swift",
    pl: "perl",
    lua: "lua",
    r: "r",
    pgsql: "pgsql",
    txt: "plaintext",
  }
  return langMap[ext] || "plaintext"
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function highlightLine(line: string, language: string): string {
  if (!line) return ""
  if (language === "plaintext") return escapeHtml(line)
  try {
    const result = hljs.highlight(line, {
      language,
      ignoreIllegals: true,
    })
    return result.value || escapeHtml(line)
  } catch {
    return escapeHtml(line)
  }
}

export function applyHighlighting(
  lines: DiffLine[],
  language: string,
): DiffLine[] {
  if (language === "plaintext") {
    return lines.map((l) => ({
      ...l,
      html: escapeHtml(l.content),
    }))
  }

  return lines.map((l) => ({
    ...l,
    html: highlightLine(l.content, language),
  }))
}

export function formatFileOp(
  filePath: string,
  operation: string,
  additions?: number,
  deletions?: number,
): string {
  const fileName = filePath.split("/").pop() || filePath
  switch (operation) {
    case "create":
      return `Created ${fileName}`
    case "delete":
      return `Deleted ${fileName}`
    case "rename":
      return `Moved ${fileName}`
    case "read":
      return `Read ${fileName}`
    default:
      return `${fileName}`
  }
}
