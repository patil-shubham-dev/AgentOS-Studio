interface OutlineEntry {
  type: "function" | "class" | "interface" | "type" | "enum" | "const" | "component" | "hook"
  name: string
  signature: string
  exported: boolean
  line: number
  column: number
  docComment?: string
  parameters?: Array<{ name: string; type: string; optional: boolean }>
  members?: string[]
}

interface ImportEntry {
  source: string
  specifiers: Array<{ name: string; alias?: string; type: "named" | "default" | "namespace" }>
  line: number
}

interface CallSite {
  callee: string
  callerLine: number
  callerContext: string
}

interface DependencyGraph {
  imports: ImportEntry[]
  exports: string[]
  reExports: string[]
}

interface AstOutline {
  path: string
  language: string
  entries: OutlineEntry[]
  totalLines: number
  dependencies: DependencyGraph
  callSites: CallSite[]
}

export interface ContextSummary {
  path: string
  language: string
  totalLines: number
  exports: string[]
  imports: ImportEntry[]
  definitions: string[]
}

const EXTENSION_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  mjs: "javascript", cjs: "javascript", mts: "typescript", cts: "typescript",
  vue: "vue", svelte: "svelte", astro: "astro",
  py: "python", rs: "rust", go: "go", rb: "ruby",
  java: "java", kt: "kotlin", swift: "swift",
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? ""
  return EXTENSION_MAP[ext] ?? "unknown"
}

function lineAt(code: string, index: number): number {
  return code.substring(0, index).split("\n").length
}

function lineContent(lines: string[], lineNum: number): string {
  return lines[lineNum - 1]?.trim() ?? ""
}

function extractDocComment(lines: string[], lineNum: number): string | undefined {
  const comments: string[] = []
  let current = lineNum - 2
  while (current >= 0) {
    const trimmed = lines[current]?.trim() ?? ""
    if (trimmed.startsWith("///")) {
      comments.unshift(trimmed.replace("///", "").trim())
      current--
    } else if (trimmed.startsWith("*") && current > 0 && lines[current - 1]?.trim().endsWith("/**")) {
      comments.unshift(trimmed.replace(/^\s*\*\s?/, ""))
      current--
      const openLine = lines[current]?.trim() ?? ""
      if (openLine.endsWith("/**")) {
        const summary = openLine.replace("/**", "").trim()
        if (summary) comments.unshift(summary)
        break
      }
    } else if (trimmed.startsWith("/*")) {
      const cleaned = trimmed.replace(/^\/\*+/, "").replace(/\*+\/$/, "").trim()
      if (cleaned) comments.unshift(cleaned)
      break
    } else if (trimmed === "" || trimmed.startsWith("//")) {
      if (trimmed.startsWith("//")) {
        comments.unshift(trimmed.replace("//", "").trim())
      }
      current--
    } else {
      break
    }
  }
  return comments.length > 0 ? comments.join(" ") : undefined
}

function extractImportStatement(line: string): ImportEntry | null {
  const defaultMatch = line.match(
    /^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/,
  )
  if (defaultMatch) {
    return {
      source: defaultMatch[2],
      specifiers: [{ name: defaultMatch[1], type: "default" }],
      line: 0,
    }
  }

  const namedMatch = line.match(
    /^import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"]/,
  )
  if (namedMatch) {
    const specifiers = namedMatch[1].split(",").map((s) => {
      const trimmed = s.trim()
      const asMatch = trimmed.match(/(\w+)\s+as\s+(\w+)/)
      return asMatch
        ? { name: asMatch[1], alias: asMatch[2], type: "named" as const }
        : { name: trimmed, type: "named" as const }
    })
    return { source: namedMatch[2], specifiers, line: 0 }
  }

  const namespaceMatch = line.match(
    /^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/,
  )
  if (namespaceMatch) {
    return {
      source: namespaceMatch[2],
      specifiers: [{ name: namespaceMatch[1], type: "namespace" }],
      line: 0,
    }
  }

  const sideEffectMatch = line.match(/^import\s+['"]([^'"]+)['"]/)
  if (sideEffectMatch) {
    return { source: sideEffectMatch[1], specifiers: [], line: 0 }
  }

  return null
}

function extractImportStatements(code: string): ImportEntry[] {
  const imports: ImportEntry[] = []
  const importBlockPattern = /^import\s+(?:type\s+)?[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm
  const sideEffectPattern = /^import\s+['"][^'"]+['"]\s*;?\s*$/gm

  let match: RegExpExecArray | null
  while ((match = importBlockPattern.exec(code)) !== null) {
    const entry = extractImportStatement(match[0])
    if (entry) {
      entry.line = lineAt(code, match.index)
      imports.push(entry)
    }
  }
  while ((match = sideEffectPattern.exec(code)) !== null) {
    const entry = extractImportStatement(match[0])
    if (entry) {
      entry.line = lineAt(code, match.index)
      imports.push(entry)
    }
  }
  return imports
}

function extractExportStatements(code: string): string[] {
  const exports: string[] = []
  const exportPattern = /^export\s+(?:default\s+)?(?:function|class|interface|type|enum|const|let|var|abstract\s+class)\s+(\w+)/gm
  let match: RegExpExecArray | null
  while ((match = exportPattern.exec(code)) !== null) {
    exports.push(match[1])
  }

  const reExportPattern = /^export\s+\{\s*([^}]+)\s*\}\s*$/gm
  while ((match = reExportPattern.exec(code)) !== null) {
    match[1].split(",").forEach((s) => {
      const name = s.trim().split(/\s+as\s+/)[0].trim()
      if (name) exports.push(name)
    })
  }

  return [...new Set(exports)]
}

function extractParameterTypes(sig: string): Array<{ name: string; type: string; optional: boolean }> {
  const params: Array<{ name: string; type: string; optional: boolean }> = []
  const parenStart = sig.indexOf("(")
  const parenEnd = sig.lastIndexOf(")")
  if (parenStart === -1 || parenEnd === -1) return params

  const paramStr = sig.slice(parenStart + 1, parenEnd)
  if (!paramStr.trim()) return params

  let depth = 0
  let current = ""
  for (const ch of paramStr) {
    if (ch === "(" || ch === "{" || ch === "[") depth++
    else if (ch === ")" || ch === "}" || ch === "]") depth--
    if (ch === "," && depth === 0) {
      const parsed = parseSingleParam(current.trim())
      if (parsed) params.push(parsed)
      current = ""
    } else {
      current += ch
    }
  }
  const parsed = parseSingleParam(current.trim())
  if (parsed) params.push(parsed)

  return params
}

function parseSingleParam(text: string): { name: string; type: string; optional: boolean } | null {
  if (!text) return null
  const defaultMatch = text.match(/(\w+)\??\s*:\s*([^=]+?)(?:\s*=\s*.+)?$/)
  if (defaultMatch) {
    return {
      name: defaultMatch[1],
      type: defaultMatch[2].trim(),
      optional: text.includes("?") || text.includes("="),
    }
  }
  const nameMatch = text.match(/(\w+)/)
  if (nameMatch) {
    return { name: nameMatch[1], type: "any", optional: false }
  }
  return null
}

function extractMembers(code: string, startLine: number): string[] {
  const lines = code.split("\n")
  const members: string[] = []
  let braceDepth = 0
  let started = false

  for (let i = startLine; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed.includes("{")) {
      started = true
      braceDepth += (trimmed.match(/{/g) || []).length
    }
    if (trimmed.includes("}")) {
      braceDepth -= (trimmed.match(/}/g) || []).length
      if (started && braceDepth <= 0) break
    }
    if (started && trimmed && !trimmed.startsWith("}")) {
      const memberMatch = trimmed.match(
        /^(?:public|private|protected|static|readonly)\s+(\w+)|^(\w+)\s*(?:\?|:|\()/,
      )
      if (memberMatch) {
        members.push(trimmed.replace(/[,;]$/, ""))
      }
    }
  }

  return members
}

function extractCallSites(code: string, functionNames: string[]): CallSite[] {
  const callSites: CallSite[] = []
  const nameSet = new Set(functionNames)
  const lines = code.split("\n")

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const name of nameSet) {
      const callPattern = new RegExp(
        `(?<!\\.|\\w)${name}\\s*\\(`,
        "g",
      )
      let match: RegExpExecArray | null
      while ((match = callPattern.exec(line)) !== null) {
        if (line.includes(`function ${name}`) || line.includes(`${name}:`) || line.includes(`${name}(`))
          continue
        callSites.push({
          callee: name,
          callerLine: i + 1,
          callerContext: line.trim().slice(0, 120),
        })
      }
    }
  }

  return callSites
}

const TS_FN = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(?:[A-Za-z_$]\w*)\s*\(/gm
const TS_CLASS = /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/gm
const TS_INTERFACE = /^(?:export\s+)?(?:default\s+)?interface\s+(\w+)/gm
const TS_TYPE = /^(?:export\s+)?type\s+(\w+)\s*=/gm
const TS_ENUM = /^(?:export\s+)?(?:const\s+)?enum\s+(\w+)/gm
const TS_CONST = /^(?:export\s+)?(?:default\s+)?const\s+(\w+)\s*[:=]/gm
const TS_ARROW_FN = /^(?:export\s+)?(?:default\s+)?(?:const\s+)?(\w+)\s*=\s*(?:\([^)]*\)|[^=]+?)\s*=>/gm
const TS_COMPONENT = /^(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w*)\s*\(/gm
const TS_HOOK = /^(?:export\s+)?(?:default\s+)?function\s+(use\w+)\s*\(/gm

function extractTypescriptOutline(
  code: string,
  filePath: string,
): Omit<AstOutline, "path" | "language" | "totalLines"> {
  const entries: OutlineEntry[] = []
  const lines = code.split("\n")
  const allNames: string[] = []
  const seen = new Set<string>()

  function addEntry(
    type: OutlineEntry["type"],
    name: string,
    match: RegExpExecArray,
    exported: boolean,
    sigLine: string,
  ): void {
    if (seen.has(name)) return
    seen.add(name)
    const lineNum = lineAt(code, match.index)
    const params = extractParameterTypes(sigLine)
    const members =
      type === "class" || type === "interface"
        ? extractMembers(code, lineNum)
        : undefined
    const docComment = extractDocComment(lines, lineNum)

    entries.push({
      type,
      name,
      signature: sigLine.length > 100 ? sigLine.slice(0, 100) + "..." : sigLine,
      exported,
      line: lineNum,
      column: match.index - code.lastIndexOf("\n", match.index - 1) - 1,
      docComment,
      parameters: params.length > 0 ? params : undefined,
      members: members && members.length > 0 ? members : undefined,
    })
    allNames.push(name)
  }

  function isExported(code: string, matchIndex: number): boolean {
    const lineStart = code.lastIndexOf("\n", matchIndex - 1) + 1
    const lineText = code.slice(lineStart, matchIndex)
    return /^export\b/.test(lineText)
  }

  const fnMatches = code.matchAll(TS_FN)
  for (const m of fnMatches) {
    const declEnd = m[0].lastIndexOf("(")
    const declPart = m[0].slice(0, declEnd).trim()
    const name = declPart.split(/\s+/).pop() ?? ""
    if (!name) continue
    const lineNum = lineAt(code, m.index)
    const sigLine = lines[lineNum - 1]?.trim() ?? ""
    const exported = isExported(code, m.index)
    const type = name[0] === name[0]?.toUpperCase() ? "component" : name.startsWith("use") ? "hook" : "function"
    addEntry(type, name, m, exported, sigLine)
  }

  const classMatches = code.matchAll(TS_CLASS)
  for (const m of classMatches) {
    const name = m[1]
    const exported = isExported(code, m.index)
    const lineNum = lineAt(code, m.index)
    const sigLine = lineContent(lines, lineNum)
    addEntry("class", name, m, exported, sigLine)
  }

  const ifaceMatches = code.matchAll(TS_INTERFACE)
  for (const m of ifaceMatches) {
    const name = m[1]
    const exported = isExported(code, m.index)
    const lineNum = lineAt(code, m.index)
    const sigLine = lineContent(lines, lineNum)
    addEntry("interface", name, m, exported, sigLine)
  }

  const typeMatches = code.matchAll(TS_TYPE)
  for (const m of typeMatches) {
    const name = m[1]
    const exported = isExported(code, m.index)
    const lineNum = lineAt(code, m.index)
    const sigLine = lineContent(lines, lineNum)
    addEntry("type", name, m, exported, sigLine)
  }

  const enumMatches = code.matchAll(TS_ENUM)
  for (const m of enumMatches) {
    const name = m[1]
    const exported = isExported(code, m.index)
    const lineNum = lineAt(code, m.index)
    const sigLine = lineContent(lines, lineNum)
    addEntry("enum", name, m, exported, sigLine)
  }

  const constMatches = code.matchAll(TS_CONST)
  for (const m of constMatches) {
    const name = m[1]
    if (seen.has(name)) continue
    const exported = isExported(code, m.index)
    const lineNum = lineAt(code, m.index)
    const sigLine = lineContent(lines, lineNum)
    addEntry("const", name, m, exported, sigLine)
  }

  const arrowMatches = code.matchAll(TS_ARROW_FN)
  for (const m of arrowMatches) {
    const name = m[1]
    if (seen.has(name)) continue
    const exported = isExported(code, m.index)
    const lineNum = lineAt(code, m.index)
    const sigLine = lineContent(lines, lineNum)
    addEntry("function", name, m, exported, sigLine)
  }

  const imports = extractImportStatements(code)
  const exports = extractExportStatements(code)
  const callSites = extractCallSites(code, allNames)

  return { entries, totalLines: lines.length, dependencies: { imports, exports, reExports: [] }, callSites }
}

const PY_FN = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\(/gm
const PY_CLASS = /^(\s*)class\s+(\w+)/gm
const PY_IMPORT = /^(?:from\s+(\S+)\s+)?import\s+(.+)$/gm

function extractPythonOutline(
  code: string,
  filePath: string,
): Omit<AstOutline, "path" | "language" | "totalLines"> {
  const entries: OutlineEntry[] = []
  const lines = code.split("\n")
  const allNames: string[] = []

  const fnMatches = code.matchAll(PY_FN)
  for (const m of fnMatches) {
    const name = m[2]
    const lineNum = lineAt(code, m.index)
    const sigLine = lines[lineNum - 1]?.trim() ?? ""
    const params = extractParameterTypes(sigLine)
    const docComment = extractDocComment(lines, lineNum)
    entries.push({
      type: "function", name, signature: sigLine, exported: false,
      line: lineNum, column: m[1].length,
      docComment, parameters: params.length > 0 ? params : undefined,
    })
    allNames.push(name)
  }

  const classMatches = code.matchAll(PY_CLASS)
  for (const m of classMatches) {
    const name = m[2]
    const lineNum = lineAt(code, m.index)
    const members = extractMembers(code, lineNum)
    const docComment = extractDocComment(lines, lineNum)
    entries.push({
      type: "class", name, signature: `class ${name}:`, exported: false,
      line: lineNum, column: m[1].length,
      docComment, members: members.length > 0 ? members : undefined,
    })
    allNames.push(name)
  }

  const imports: ImportEntry[] = []
  const importMatches = code.matchAll(PY_IMPORT)
  for (const m of importMatches) {
    const source = m[1] || m[2].split(",")[0].trim().split(/\s+as\s+/)[0]
    const specifiers = m[1]
      ? m[2].split(",").map((s) => {
          const trimmed = s.trim().split(/\s+as\s+/)
          return { name: trimmed[0], alias: trimmed[1], type: "named" as const }
        })
      : [{ name: m[2].trim().split(/\s+as\s+/)[0], type: "namespace" as const }]
    if (source) {
      imports.push({ source, specifiers, line: lineAt(code, m.index) })
    }
  }

  const callSites = extractCallSites(code, allNames)

  return {
    entries,
    totalLines: lines.length,
    dependencies: { imports, exports: [], reExports: [] },
    callSites,
  }
}

export function extractOutline(code: string, filePath: string): AstOutline {
  const language = detectLanguage(filePath)

  let result: Omit<AstOutline, "path" | "language" | "totalLines">
  if (language === "python") {
    result = extractPythonOutline(code, filePath)
  } else {
    result = extractTypescriptOutline(code, filePath)
  }

  return { path: filePath, language, ...result }
}

export function formatOutline(outline: AstOutline): string {
  if (outline.entries.length === 0 && outline.dependencies.imports.length === 0) return ""

  const parts: string[] = []
  const header = `## ${outline.path} — ${outline.language} (${outline.totalLines} lines)`
  parts.push(header)

  if (outline.dependencies.imports.length > 0) {
    const deps = outline.dependencies.imports.map((i) => {
      const specifiers = i.specifiers.map((s) => s.alias || s.name).join(", ")
      return `  import ${specifiers ? `{ ${specifiers} }` : ""} from "${i.source}"`
    })
    parts.push(`\n### Imports\n${deps.join("\n")}`)
  }

  if (outline.entries.length > 0) {
    const body = outline.entries.map((e) => {
      const exportTag = e.exported ? "export " : ""
      const docTag = e.docComment ? ` // ${e.docComment.replace(/\n/g, " ").slice(0, 80)}` : ""
      return `  [L${e.line}] ${exportTag}${e.signature}${docTag}`
    })
    parts.push(`\n### Symbols\n${body.join("\n")}`)
  }

  return parts.join("\n")
}

export function buildContextSummary(outline: AstOutline, maxEntries?: number): ContextSummary {
  const entries = maxEntries ? outline.entries.slice(0, maxEntries) : outline.entries
  return {
    path: outline.path,
    language: outline.language,
    totalLines: outline.totalLines,
    exports: outline.dependencies.exports,
    imports: outline.dependencies.imports,
    definitions: entries.map(
      (e) => `[L${e.line}] ${e.exported ? "export " : ""}${e.signature}`,
    ),
  }
}

export function formatContextSummary(summaries: ContextSummary[]): string {
  if (summaries.length === 0) return ""

  const parts: string[] = ["## Workspace Structure"]

  for (const s of summaries) {
    const fileLabel = `### ${s.path}`
    const meta = `${s.language}, ${s.totalLines} lines, ${s.definitions.length} definitions`
    parts.push(`${fileLabel}  _${meta}_`)

    if (s.imports.length > 0) {
      const extCount = s.imports.filter((i) => !i.source.startsWith(".")).length
      const localCount = s.imports.length - extCount
      parts.push(`  (${s.imports.length} imports: ${localCount} local, ${extCount} external)`)
    }

    if (s.exports.length > 0) {
      parts.push(`  Exports: ${s.exports.join(", ")}`)
    }

    if (s.definitions.length > 0) {
      parts.push(`  ${s.definitions.join("\n  ")}`)
    }
  }

  return parts.join("\n")
}

export async function getOutlineForFile(filePath: string): Promise<AstOutline | null> {
  try {
    const mod = await import("@/lib/electron-api")
    const { readTextFile } = mod
    const content = await readTextFile(filePath)
    if (!content) return null
    return extractOutline(content, filePath)
  } catch {
    return null
  }
}
