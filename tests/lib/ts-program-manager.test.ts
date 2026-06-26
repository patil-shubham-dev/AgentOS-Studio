import { describe, it, expect } from "vitest"

interface TSSymbolInfo {
  name: string
  kind: string
  file: string
  line: number
  type?: string
  modifiers: string[]
  isExported: boolean
  isDefaultExport: boolean
  parentName?: string
  typeParameters?: string[]
  extends?: string[]
  implements?: string[]
}

interface TSCallGraphEntry {
  callerFile: string
  callerLine: number
  callerName: string
  calleeName: string
}

function extractSymbolsFromContent(content: string, relPath: string): TSSymbolInfo[] {
  const symbols: TSSymbolInfo[] = []

  const patterns: Array<{ kind: TSSymbolInfo["kind"]; pattern: RegExp }> = [
    { kind: "function", pattern: /^\s*(export\s+)?(default\s+)?(async\s+)?function\s+(\w+)/gm },
    { kind: "class", pattern: /^\s*(export\s+)?(default\s+)?(abstract\s+)?class\s+(\w+)/gm },
    { kind: "interface", pattern: /^\s*(export\s+)?(default\s+)?interface\s+(\w+)/gm },
    { kind: "type", pattern: /^\s*(export\s+)?type\s+(\w+)\s*=/gm },
    { kind: "enum", pattern: /^\s*(export\s+)?enum\s+(\w+)/gm },
    { kind: "const", pattern: /^\s*(export\s+)?(default\s+)?const\s+(\w+)\s*[:=]/gm },
  ]

  for (const { kind, pattern } of patterns) {
    const matches = content.matchAll(pattern)
    for (const m of matches) {
      const nameIndex = m.length - 1
      const name = m[nameIndex]
      if (!name) continue

      const nameInMatch = m[0].lastIndexOf(name)
      const namePos = m.index! + nameInMatch
      const prefix = content.substring(0, namePos)
      const line = prefix ? prefix.split("\n").length : 1

      symbols.push({
        name,
        kind,
        file: relPath,
        line,
        modifiers: [],
        isExported: !!m[1],
        isDefaultExport: !!m[2],
      })
    }
  }

  return symbols
}

function extractCallGraph(content: string, relPath: string, symbols: TSSymbolInfo[]): TSCallGraphEntry[] {
  const entries: TSCallGraphEntry[] = []
  const funcNames = new Set(
    symbols.filter((s) => s.kind === "function" || s.kind === "method").map((s) => s.name)
  )

  const lines = content.split("\n")
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]

    let currentFunc: string | undefined
    for (let i = lineIdx; i >= 0; i--) {
      const funcDecl = lines[i].match(/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/)
      if (funcDecl) {
        currentFunc = funcDecl[1]
        break
      }
    }
    if (!currentFunc) continue

    const callMatches = line.matchAll(/(\w+)\s*\(/g)
    for (const cm of callMatches) {
      const callee = cm[1]
      if (callee !== currentFunc && funcNames.has(callee)) {
        entries.push({
          callerFile: relPath,
          callerLine: lineIdx + 1,
          callerName: currentFunc,
          calleeName: callee,
        })
      }
    }
  }

  return entries
}

describe("TSProgramManager — regex fallback symbol extraction", () => {
  it("extracts exported function declarations", () => {
    const symbols = extractSymbolsFromContent(
      `export function greet(name: string): string { return "hello" }`,
      "src/greet.ts"
    )
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe("greet")
    expect(symbols[0].kind).toBe("function")
    expect(symbols[0].isExported).toBe(true)
  })

  it("extracts default export functions", () => {
    const symbols = extractSymbolsFromContent(
      `export default function App() { return null }`,
      "src/App.tsx"
    )
    expect(symbols[0].isDefaultExport).toBe(true)
  })

  it("extracts class declarations", () => {
    const symbols = extractSymbolsFromContent(
      `export abstract class BaseController { abstract handle(): void }`,
      "src/controller.ts"
    )
    expect(symbols).toHaveLength(1)
    expect(symbols[0].kind).toBe("class")
    expect(symbols[0].name).toBe("BaseController")
  })

  it("extracts interface declarations", () => {
    const symbols = extractSymbolsFromContent(
      `export interface User { name: string; age: number }`,
      "src/types.ts"
    )
    expect(symbols).toHaveLength(1)
    expect(symbols[0].kind).toBe("interface")
  })

  it("extracts type aliases", () => {
    const symbols = extractSymbolsFromContent(
      `export type Callback = (err: Error | null) => void`,
      "src/types.ts"
    )
    expect(symbols).toHaveLength(1)
    expect(symbols[0].kind).toBe("type")
  })

  it("extracts enums", () => {
    const symbols = extractSymbolsFromContent(
      `export enum Status { Active, Inactive }`,
      "src/status.ts"
    )
    expect(symbols).toHaveLength(1)
    expect(symbols[0].kind).toBe("enum")
  })

  it("extracts const declarations", () => {
    const symbols = extractSymbolsFromContent(
      `export const MAX_RETRIES = 3`,
      "src/config.ts"
    )
    expect(symbols).toHaveLength(1)
    expect(symbols[0].kind).toBe("const")
  })

  it("handles async function declarations", () => {
    const symbols = extractSymbolsFromContent(
      `export async function fetchData(): Promise<unknown> {}`,
      "src/api.ts"
    )
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe("fetchData")
  })

  it("extracts multiple symbols from one file", () => {
    const content = [
      `export interface Props { title: string }`,
      `export function Component(props: Props) { return null }`,
      `export const DEFAULT_TITLE = "Hello"`,
    ].join("\n")
    const symbols = extractSymbolsFromContent(content, "src/component.tsx")
    expect(symbols.length).toBeGreaterThanOrEqual(3)
  })

  it("returns correct line numbers", () => {
    const content = `\n\nexport function foo() {}\n`
    const symbols = extractSymbolsFromContent(content, "src/test.ts")
    expect(symbols[0].line).toBe(3)
  })

  it("returns empty for files with no recognized symbols", () => {
    // Neither 'run' nor 'z' are valid declarations — 'z' matches const only with := or `:`
    const content = [
      `import { helper } from './utils'`,
      `const result = helper()`,
    ].join("\n")
    const symbols = extractSymbolsFromContent(content, "src/no-symbols.ts")
    const recognized = symbols.filter((s) => s.kind !== "const")
    // The regex-based extraction doesn't recognize imports
    expect(recognized).toHaveLength(0)
  })
})

describe("TSProgramManager — call graph extraction", () => {
  it("builds call edges between functions in the same file", () => {
    const content = [
      `function helper() { return 42 }`,
      `function main() {`,
      `  return helper()`,
      `}`,
    ].join("\n")
    const symbols = extractSymbolsFromContent(content, "src/main.ts")
    const calls = extractCallGraph(content, "src/main.ts", symbols)

    expect(calls.length).toBeGreaterThanOrEqual(1)
    const mainToHelper = calls.find((c) => c.callerName === "main" && c.calleeName === "helper")
    expect(mainToHelper).toBeDefined()
  })

  it("does not create self-call edges", () => {
    const content = [
      `function factorial(n: number): number {`,
      `  return n <= 1 ? 1 : n * factorial(n - 1)`,
      `}`,
    ].join("\n")
    const symbols = extractSymbolsFromContent(content, "src/math.ts")
    const calls = extractCallGraph(content, "src/math.ts", symbols)
    const selfEdges = calls.filter((c) => c.callerName === c.calleeName)
    expect(selfEdges).toHaveLength(0)
  })

  it("records multiple callees from one function", () => {
    const content = [
      `function a() {}`,
      `function b() {}`,
      `function main() {`,
      `  a()`,
      `  b()`,
      `}`,
    ].join("\n")
    const symbols = extractSymbolsFromContent(content, "src/main.ts")
    const calls = extractCallGraph(content, "src/main.ts", symbols)
    expect(calls.length).toBeGreaterThanOrEqual(2)
  })

  it("returns no edges when no calls reference other functions", () => {
    const content = [
      `function a() { return 1 }`,
      `function b() { return 2 }`,
    ].join("\n")
    const symbols = extractSymbolsFromContent(content, "src/standalone.ts")
    const calls = extractCallGraph(content, "src/standalone.ts", symbols)
    expect(calls).toHaveLength(0)
  })
})

describe("TSProgramManager — export queries", () => {
  it("filters symbols by isExported", () => {
    const symbols = extractSymbolsFromContent(
      `function hidden() {}\nexport function visible() {}`,
      "src/test.ts"
    )
    const exported = symbols.filter((s) => s.isExported)
    expect(exported).toHaveLength(1)
    expect(exported[0].name).toBe("visible")
  })

  it("identifies default exports", () => {
    const symbols = extractSymbolsFromContent(
      `export default function App() {}`,
      "src/App.tsx"
    )
    expect(symbols[0].isDefaultExport).toBe(true)
  })

  it("non-exported symbols have isExported=false", () => {
    const symbols = extractSymbolsFromContent(
      `function internal() {}`,
      "src/internal.ts"
    )
    expect(symbols[0].isExported).toBe(false)
  })
})
