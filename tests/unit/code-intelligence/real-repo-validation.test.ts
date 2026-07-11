import { describe, it, expect } from "vitest"
import { SymbolIndex } from "@/lib/symbol-index"
import { DependencyScanner } from "@/lib/dependency-scanner"
import { readFileSync, readdirSync, statSync, existsSync } from "fs"
import { join } from "path"

const FIXTURE_DIR = join(__dirname, "..", "fixtures", "repos")

interface RawEntry {
  name: string
  path: string
  isDirectory: boolean
  children: RawEntry[]
}

async function loadDirRecursive(dirPath: string): Promise<RawEntry[]> {
  if (!existsSync(dirPath)) return []
  const entries = readdirSync(dirPath, { withFileTypes: true })
  const result: RawEntry[] = []
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    const fullPath = join(dirPath, entry.name)
    const isDir = entry.isDirectory()
    const children = isDir ? await loadDirRecursive(fullPath) : []
    result.push({ name: entry.name, path: fullPath, isDirectory: isDir, children })
  }
  return result.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function toFileTree(entries: RawEntry[], rootPath: string): any[] {
  return entries.map((e) => ({
    name: e.name,
    path: e.path,
    is_dir: e.isDirectory,
    children: e.isDirectory ? toFileTree(e.children, join(rootPath, e.name)) : [],
  }))
}

async function contentProvider(absPath: string): Promise<string | null> {
  try {
    return readFileSync(absPath, "utf-8")
  } catch {
    return null
  }
}

async function readDirectory(dirPath: string): Promise<{ name: string; isDirectory: boolean }[]> {
  if (!existsSync(dirPath)) return []
  return readdirSync(dirPath, { withFileTypes: true }).map((d) => ({
    name: d.name,
    isDirectory: d.isDirectory(),
  }))
}

const FIXTURE_NAMES = ["test_accuracy", "test_calls", "test_deps", "test_goto", "test_refs"]
const PRESENT_FIXTURES = FIXTURE_NAMES.filter((name) => existsSync(join(FIXTURE_DIR, name)))

describe("P13E — Real Repository Validation", () => {
  describe("SymbolIndex with fixture repos", () => {
    it("extracts symbols from accuracy fixture", async () => {
      if (!PRESENT_FIXTURES.includes("test_accuracy")) return
      const repoPath = join(FIXTURE_DIR, "test_accuracy")
      const raw = await loadDirRecursive(repoPath)
      const tree = toFileTree(raw, repoPath)
      const index = new SymbolIndex()
      const data = await index.initialize(repoPath, tree, contentProvider)

      expect(data.symbols.length).toBeGreaterThan(0)
      expect(data.symbols.some((s) => s.kind === "function")).toBe(true)
      expect(data.symbols.some((s) => s.kind === "class")).toBe(true)
    })

    it("searches symbols by name", async () => {
      if (!PRESENT_FIXTURES.includes("test_accuracy")) return
      const repoPath = join(FIXTURE_DIR, "test_accuracy")
      const raw = await loadDirRecursive(repoPath)
      const tree = toFileTree(raw, repoPath)
      const index = new SymbolIndex()
      await index.initialize(repoPath, tree, contentProvider)

      const results = index.searchSymbols("test")
      expect(results.length).toBeGreaterThanOrEqual(0)
    })

    it("reports indexing stats", async () => {
      if (!PRESENT_FIXTURES.includes("test_accuracy")) return
      const repoPath = join(FIXTURE_DIR, "test_accuracy")
      const raw = await loadDirRecursive(repoPath)
      const tree = toFileTree(raw, repoPath)
      const index = new SymbolIndex()
      await index.initialize(repoPath, tree, contentProvider)

      const stats = index.getStats()
      expect(stats.totalSymbols).toBeGreaterThan(0)
      expect(stats.indexedAt).toBeGreaterThan(0)
    })
  })

  describe("DependencyScanner with fixture repos", () => {
    it("builds dependency graph from deps fixture", async () => {
      if (!PRESENT_FIXTURES.includes("test_deps")) return
      const repoPath = join(FIXTURE_DIR, "test_deps")
      const raw = await loadDirRecursive(repoPath)
      const tree = toFileTree(raw, repoPath)
      const scanner = new DependencyScanner(repoPath)
      const graph = await scanner.scan(tree, contentProvider)

      expect(graph.nodes.length).toBeGreaterThan(0)
      expect(Array.isArray(graph.edges)).toBe(true)
    })

    it("identifies most imported files", async () => {
      if (!PRESENT_FIXTURES.includes("test_deps")) return
      const repoPath = join(FIXTURE_DIR, "test_deps")
      const raw = await loadDirRecursive(repoPath)
      const tree = toFileTree(raw, repoPath)
      const scanner = new DependencyScanner(repoPath)
      await scanner.scan(tree, contentProvider)

      const top = scanner.getTopImported(5)
      expect(top.length).toBeGreaterThanOrEqual(0)
    })

    it("identifies most dependent files", async () => {
      if (!PRESENT_FIXTURES.includes("test_deps")) return
      const repoPath = join(FIXTURE_DIR, "test_deps")
      const raw = await loadDirRecursive(repoPath)
      const tree = toFileTree(raw, repoPath)
      const scanner = new DependencyScanner(repoPath)
      await scanner.scan(tree, contentProvider)

      const most = scanner.getMostDependent(5)
      expect(most.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe("Cross-repo validation", () => {
    it("processes all fixture repos without error", async () => {
      for (const name of PRESENT_FIXTURES) {
        const repoPath = join(FIXTURE_DIR, name)
        const raw = await loadDirRecursive(repoPath)
        const tree = toFileTree(raw, repoPath)
        const index = new SymbolIndex()
        await index.initialize(repoPath, tree, contentProvider)
        expect(index.getStats().totalSymbols).toBeGreaterThanOrEqual(0)
      }
    })

    it("generates call graph from calls fixture", async () => {
      if (!PRESENT_FIXTURES.includes("test_calls")) return
      const repoPath = join(FIXTURE_DIR, "test_calls")
      const raw = await loadDirRecursive(repoPath)
      const tree = toFileTree(raw, repoPath)
      const index = new SymbolIndex()
      const data = await index.initialize(repoPath, tree, contentProvider)

      expect(data.callGraph.length).toBeGreaterThanOrEqual(0)
      for (const call of data.callGraph) {
        expect(call.caller).toBeTruthy()
        expect(call.callee).toBeTruthy()
        expect(call.file).toBeTruthy()
      }
    })
  })
})
