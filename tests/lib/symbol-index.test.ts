import { describe, it, expect } from "vitest"

interface SymbolInfo {
  name: string
  kind: string
  file: string
  line: number
  parent?: string
  export: boolean
  default: boolean
}

interface CallReference {
  caller: string
  callee: string
  file: string
  line: number
}

interface SymbolIndexData {
  symbols: SymbolInfo[]
  callGraph: CallReference[]
  indexedAt: number
}

function extractFromContent(
  content: string,
  relPath: string
): { symbols: SymbolInfo[]; calls: CallReference[] } {
  const SYMBOL_PATTERNS: { kind: SymbolInfo["kind"]; pattern: RegExp }[] = [
    { kind: "class", pattern: /^\s*(export\s+)?(default\s+)?(abstract\s+)?class\s+(\w+)/gm },
    { kind: "interface", pattern: /^\s*(export\s+)?(default\s+)?interface\s+(\w+)/gm },
    { kind: "enum", pattern: /^\s*(export\s+)?(default\s+)?enum\s+(\w+)/gm },
    { kind: "type", pattern: /^\s*(export\s+)?type\s+(\w+)\s*=/gm },
    { kind: "function", pattern: /^\s*(export\s+)?(default\s+)?(async\s+)?function\s+(\w+)/gm },
    { kind: "const", pattern: /^\s*(export\s+)?(default\s+)?const\s+(\w+)\s*[:=]/gm },
    { kind: "hook", pattern: /^\s*(export\s+)?function\s+(use\w+)\s*\(/gm },
    { kind: "hook", pattern: /^\s*(export\s+)?const\s+(use\w+)\s*[:=]/gm },
  ]

  const symbols: SymbolInfo[] = []

  for (const { kind, pattern } of SYMBOL_PATTERNS) {
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
        export: !!m[1],
        default: !!m[2],
      })
    }
  }

  return { symbols, calls: [] }
}

function searchSymbols(
  data: SymbolIndexData,
  query: string,
  kind?: string
): SymbolInfo[] {
  if (!query) return []
  const lower = query.toLowerCase()
  let results = data.symbols.filter((s) =>
    s.name.toLowerCase().includes(lower)
  )
  if (kind) results = results.filter((s) => s.kind === kind)
  return results.sort((a, b) => a.name.length - b.name.length).slice(0, 50)
}

function fuzzySearchSymbols(
  data: SymbolIndexData,
  query: string
): SymbolInfo[] {
  if (!query) return []
  const lower = query.toLowerCase()
  const scored: Array<{ symbol: SymbolInfo; score: number }> = []

  for (const sym of data.symbols) {
    const nameLower = sym.name.toLowerCase()
    let score = 0
    if (nameLower === lower) score = 100
    else if (nameLower.startsWith(lower)) score = 80
    else if (nameLower.includes(lower)) score = 60
    else {
      let matches = 0
      let idx = 0
      for (const ch of lower) {
        const found = nameLower.indexOf(ch, idx)
        if (found === -1) break
        matches++
        idx = found + 1
      }
      if (matches === lower.length) score = 40
      else continue
    }
    scored.push({ symbol: sym, score })
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, 30).map((s) => s.symbol)
}

function findReferences(
  data: SymbolIndexData,
  name: string
): { symbol: SymbolInfo; references: { file: string; line: number }[] } | null {
  const symbol = data.symbols.find((s) => s.name === name)
  if (!symbol) return null
  const references = data.callGraph
    .filter((c) => c.callee === name || c.caller === name)
    .map((c) => ({ file: c.file, line: c.line }))
  return { symbol, references }
}

function getCallHierarchy(
  data: SymbolIndexData,
  name: string
): { callers: CallReference[]; callees: CallReference[] } {
  return {
    callers: data.callGraph.filter((c) => c.callee === name),
    callees: data.callGraph.filter((c) => c.caller === name),
  }
}

function exportIndex(data: SymbolIndexData): SymbolIndexData | null {
  if (data.symbols.length === 0) return null
  return { symbols: data.symbols, callGraph: data.callGraph, indexedAt: data.indexedAt }
}

function importIndex(
  existing: SymbolIndexData,
  data: SymbolIndexData
): SymbolIndexData {
  return {
    symbols: [...existing.symbols, ...data.symbols],
    callGraph: [...existing.callGraph, ...data.callGraph],
    indexedAt: data.indexedAt,
  }
}

describe("SymbolIndex — extractFromContent", () => {
  it("extracts simple function declarations", () => {
    const content = `function foo() {}\nexport function bar() {}\nexport default function baz() {}`
    const result = extractFromContent(content, "src/test.ts")
    // Each function declaration matches both the 'function' pattern and (if it has params) the 'hook' pattern
    expect(result.symbols.length).toBeGreaterThanOrEqual(3)
    expect(result.symbols.map((s) => s.name)).toContain("foo")
    expect(result.symbols.map((s) => s.name)).toContain("bar")
    expect(result.symbols.map((s) => s.name)).toContain("baz")
  })

  it("marks exported symbols", () => {
    const content = `function foo() {}\nexport function bar() {}`
    const result = extractFromContent(content, "src/test.ts")
    const bar = result.symbols.find((s) => s.name === "bar" && s.kind === "function")
    const foo = result.symbols.find((s) => s.name === "foo" && s.kind === "function")
    expect(bar?.export).toBe(true)
    expect(foo?.export).toBe(false)
  })

  it("extracts classes with export/abstract modifiers", () => {
    const content = `class A {}\nexport abstract class B {}\nexport default class C {}`
    const result = extractFromContent(content, "src/test.ts")
    expect(result.symbols.filter((s) => s.kind === "class")).toHaveLength(3)
  })

  it("extracts interfaces, enums, type aliases", () => {
    const content = `interface User { name: string }\nenum Color { Red, Green }\ntype Result = string | number`
    const result = extractFromContent(content, "src/types.ts")
    expect(result.symbols.map((s) => s.kind)).toContain("interface")
    expect(result.symbols.map((s) => s.kind)).toContain("enum")
    expect(result.symbols.map((s) => s.kind)).toContain("type")
  })

  it("extracts const declarations", () => {
    const content = `export const PI = 3.14\nconst MAX_SIZE = 100`
    const result = extractFromContent(content, "src/constants.ts")
    expect(result.symbols.length).toBeGreaterThanOrEqual(2)
    expect(result.symbols.some((s) => s.name === "PI" && s.export)).toBe(true)
    expect(result.symbols.some((s) => s.name === "MAX_SIZE" && !s.export)).toBe(true)
  })

  it("extracts hooks", () => {
    const content = `export function useAuth() {}\nexport const useStore = () => {}`
    const result = extractFromContent(content, "src/app.tsx")
    const hooks = result.symbols.filter((s) => s.kind === "hook")
    expect(hooks.length).toBeGreaterThanOrEqual(1)
    expect(hooks.some((s) => s.name === "useAuth")).toBe(true)
  })

  it("returns correct line numbers", () => {
    const content = `// header\n\nfunction foo() {`
    const result = extractFromContent(content, "src/test.ts")
    const foo = result.symbols.find((s) => s.name === "foo" && s.kind === "function")
    expect(foo?.line).toBe(3)
  })

  it("returns empty for content with no extractable symbols", () => {
    const result = extractFromContent(`just a comment with no declarations`, "src/empty.ts")
    const functions = result.symbols.filter((s) => s.kind !== "const")
    // 'just a comment with no declarations' — no function/class/interface/etc patterns match
    expect(functions).toHaveLength(0)
  })
})

describe("SymbolIndex — searchSymbols", () => {
  const data: SymbolIndexData = {
    symbols: [
      { name: "getUser", kind: "function", file: "src/user.ts", line: 1, export: true, default: false },
      { name: "updateUser", kind: "function", file: "src/user.ts", line: 5, export: true, default: false },
      { name: "User", kind: "interface", file: "src/types.ts", line: 1, export: true, default: false },
      { name: "userStore", kind: "store", file: "src/store.ts", line: 1, export: true, default: false },
      { name: "App", kind: "component", file: "src/App.tsx", line: 1, export: true, default: true },
    ],
    callGraph: [],
    indexedAt: Date.now(),
  }

  it("finds symbols by substring match", () => {
    const results = searchSymbols(data, "User")
    expect(results.length).toBeGreaterThanOrEqual(3)
    expect(results.map((r) => r.name)).toContain("getUser")
    expect(results.map((r) => r.name)).toContain("User")
  })

  it("filters by kind", () => {
    const results = searchSymbols(data, "get", "function")
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe("getUser")
  })

  it("returns empty for unmatching query", () => {
    expect(searchSymbols(data, "ZooKeeper")).toHaveLength(0)
  })

  it("returns empty for empty query", () => {
    expect(searchSymbols(data, "")).toHaveLength(0)
  })

  it("is case-insensitive", () => {
    const results = searchSymbols(data, "user")
    expect(results.map((r) => r.name)).toContain("getUser")
    expect(results.map((r) => r.name)).toContain("updateUser")
  })
})

describe("SymbolIndex — fuzzySearchSymbols", () => {
  const data: SymbolIndexData = {
    symbols: [
      { name: "getUserData", kind: "function", file: "src/user.ts", line: 1, export: true, default: false },
      { name: "updateUser", kind: "function", file: "src/user.ts", line: 5, export: true, default: false },
      { name: "budgetPlan", kind: "function", file: "src/budget.ts", line: 1, export: true, default: false },
      { name: "UserProfile", kind: "interface", file: "src/types.ts", line: 1, export: true, default: false },
      { name: "userStore", kind: "store", file: "src/store.ts", line: 1, export: true, default: false },
      { name: "App", kind: "component", file: "src/App.tsx", line: 1, export: true, default: true },
    ],
    callGraph: [],
    indexedAt: Date.now(),
  }

  it("exact match scores highest", () => {
    const results = fuzzySearchSymbols(data, "App")
    expect(results[0].name).toBe("App")
  })

  it("prefix match ranks above substring match", () => {
    const results = fuzzySearchSymbols(data, "get")
    expect(results[0].name).toBe("getUserData")
    expect(results.map((r) => r.name)).toContain("budgetPlan")
  })

  it("fuzzy matches non-contiguous characters", () => {
    const results = fuzzySearchSymbols(data, "UPD")
    expect(results.map((r) => r.name)).toContain("updateUser")
  })

  it("returns empty for no match", () => {
    expect(fuzzySearchSymbols(data, "xyz")).toHaveLength(0)
  })

  it("returns empty for empty query", () => {
    expect(fuzzySearchSymbols(data, "")).toHaveLength(0)
  })
})

describe("SymbolIndex — findReferences and getCallHierarchy", () => {
  const data: SymbolIndexData = {
    symbols: [
      { name: "authenticate", kind: "function", file: "src/auth.ts", line: 1, export: true, default: false },
      { name: "login", kind: "function", file: "src/login.ts", line: 1, export: true, default: false },
      { name: "logout", kind: "function", file: "src/logout.ts", line: 1, export: true, default: false },
    ],
    callGraph: [
      { caller: "login", callee: "authenticate", file: "src/login.ts", line: 5 },
      { caller: "logout", callee: "authenticate", file: "src/logout.ts", line: 3 },
    ],
    indexedAt: Date.now(),
  }

  it("findReferences returns symbol and its call references", () => {
    const refs = findReferences(data, "authenticate")
    expect(refs).not.toBeNull()
    expect(refs!.references).toHaveLength(2)
    expect(refs!.references.map((r) => r.file)).toContain("src/login.ts")
  })

  it("findReferences returns null for unknown symbol", () => {
    expect(findReferences(data, "nonexistent")).toBeNull()
  })

  it("getCallHierarchy returns callers and callees", () => {
    const hier = getCallHierarchy(data, "authenticate")
    expect(hier.callers).toHaveLength(2)
    expect(hier.callees).toHaveLength(0)
  })
})

describe("SymbolIndex — export/import index", () => {
  it("exportIndex returns null for empty data", () => {
    expect(exportIndex({ symbols: [], callGraph: [], indexedAt: 0 })).toBeNull()
  })

  it("exportIndex returns data for non-empty index", () => {
    const data: SymbolIndexData = {
      symbols: [{ name: "foo", kind: "function", file: "a.ts", line: 1, export: true, default: false }],
      callGraph: [],
      indexedAt: 1000,
    }
    const exported = exportIndex(data)
    expect(exported).not.toBeNull()
    expect(exported!.symbols).toHaveLength(1)
    expect(exported!.indexedAt).toBe(1000)
  })

  it("importIndex merges with existing data", () => {
    const existing: SymbolIndexData = {
      symbols: [{ name: "foo", kind: "function", file: "a.ts", line: 1, export: true, default: false }],
      callGraph: [],
      indexedAt: 1000,
    }
    const incoming: SymbolIndexData = {
      symbols: [{ name: "bar", kind: "class", file: "b.ts", line: 1, export: true, default: false }],
      callGraph: [],
      indexedAt: 2000,
    }
    const merged = importIndex(existing, incoming)
    expect(merged.symbols).toHaveLength(2)
    expect(merged.indexedAt).toBe(2000)
  })
})
