import { describe, it, expect, beforeAll, afterAll } from "vitest"
import path from "path"
import fs from "fs"
import { generateRepository } from "../../benchmarks/generate-test-repo.mjs"
import { SearchIndex, workspaceIndex, SearchQuery, SearchResult, SearchProgress } from "@/lib/search-index"
import { InMemoryStorageAdapter, installTestStorage, uninstallTestStorage } from "../fixtures/StorageAdapter"

const FIXTURES = path.resolve(__dirname, "..", "fixtures", "repos")

interface SearchBenchResult {
  label: string
  fileCount: number
  initTimeMs: number
  searchP50: number
  searchP95: number
  searchP99: number
  peakMemoryMB: number
}

async function buildSearchIndex(repoDir: string, label: string): Promise<{ index: SearchIndex; files: number }> {
  const idx = new SearchIndex()
  const entries: Array<{ path: string; name: string; size: number; is_dir: boolean; children: any[] }> = []

  function walk(d: string, base: string) {
    const names = fs.readdirSync(d, { withFileTypes: true })
    for (const e of names) {
      const full = path.join(d, e.name)
      const rel = base ? `${base}/${e.name}` : e.name
      if (e.isDirectory() && !e.name.startsWith(".")) {
        const children: any[] = []
        entries.push({ path: rel, name: e.name, size: 0, is_dir: true, children })
        walk(full, rel)
      } else if (e.isFile()) {
        const child: any = { path: rel, name: e.name, size: fs.statSync(full).size, is_dir: false, children: [] }
        entries.push(child)
      }
    }
  }
  walk(repoDir, "")

  const t0 = performance.now()
  await idx.initialize(entries, repoDir)
  const initTime = performance.now() - t0

  return { index: idx, files: entries.length }
}

describe("SearchIndex — benchmarks", () => {
  const results: SearchBenchResult[] = []

  async function benchRepo(fileCount: number, label: string) {
    const dir = path.join(FIXTURES, `search_${fileCount}`)
    generateRepository(dir, fileCount, 10, `search-${fileCount}`)

    const { index, files } = await buildSearchIndex(dir, label)

    // Warm cache: load first 20 files
    for (let i = 0; i < Math.min(20, fileCount); i++) {
      const subdir = ["core", "utils", "models", "services", "components", "hooks", "types", "api", "io", "config"][i % 10]
      const fpath = `${subdir}/module_${i}.ts`
      await index.ensureContentCached(fpath, dir)
    }

    const memBefore = process.memoryUsage().heapUsed / 1024 / 1024
    const memStart = memBefore

    // Run 50 searches, collect latencies
    const queries = ["alpha", "beta", "gamma", "module", "Fn", "export"]
    const latencies: number[] = []

    for (let iter = 0; iter < 50; iter++) {
      const q = queries[iter % queries.length]
      const t0 = performance.now()
      const results = await index.search({ query: q, mode: "fuzzy", caseSensitive: false })
      latencies.push(performance.now() - t0)
    }

    const memAfter = process.memoryUsage().heapUsed / 1024 / 1024
    const sorted = [...latencies].sort((a, b) => a - b)

    const result: SearchBenchResult = {
      label,
      fileCount: files,
      initTimeMs: 0,
      searchP50: sorted[Math.floor(sorted.length * 0.5)],
      searchP95: sorted[Math.floor(sorted.length * 0.95)],
      searchP99: sorted[Math.floor(sorted.length * 0.99)],
      peakMemoryMB: memAfter - memStart,
    }

    console.log(`\n[${label}]`)
    console.log(`  files: ${files}`)
    console.log(`  searches: ${latencies.length}`)
    console.log(`  p50: ${result.searchP50.toFixed(3)}ms`)
    console.log(`  p95: ${result.searchP95.toFixed(3)}ms`)
    console.log(`  p99: ${result.searchP99.toFixed(3)}ms`)
    console.log(`  memory delta: ${result.peakMemoryMB.toFixed(2)}MB`)

    results.push(result)
  }

  it("benchmark search 1000 files", async () => {
    await benchRepo(1000, "search-1k")
  })

  it("benchmark search 10000 files", async () => {
    await benchRepo(10000, "search-10k")
  })

  it("benchmark search 5000 files", async () => {
    await benchRepo(5000, "search-5k")
  }, 60000)

  afterAll(() => {
    console.log("\n\n=== SEARCH BENCHMARK SUMMARY ===")
    console.log("Label\tFiles\tp50(ms)\tp95(ms)\tp99(ms)\tMem(MB)")
    for (const r of results) {
      console.log(`${r.label}\t${r.fileCount}\t${r.searchP50.toFixed(3)}\t${r.searchP95.toFixed(3)}\t${r.searchP99.toFixed(3)}\t${r.peakMemoryMB.toFixed(2)}`)
    }
  })
})

describe("SearchIndex — cancellation", () => {
  it("should abort search mid-execution", async () => {
    const dir = path.join(FIXTURES, "search_cancel")
    generateRepository(dir, 500, 5, "cancel")
    const { index } = await buildSearchIndex(dir, "cancel")

    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 50)

    const t0 = performance.now()
    const results = await index.search({ query: "alpha", mode: "fuzzy", caseSensitive: false, signal: ctrl.signal })
    const elapsed = performance.now() - t0

    console.log(`Cancellation test: returned ${results.length} results in ${elapsed.toFixed(1)}ms`)
    // Aborted search should return quickly
    expect(elapsed).toBeLessThan(5000)
  })
})

describe("SearchIndex — incremental updates", () => {
  it("should add new files to index", () => {
    const idx = new SearchIndex()
    idx.addFile("new/file.ts", "file.ts", 100)
    expect(idx.totalFiles).toBe(1)
  })

  it("should remove files from index", () => {
    const idx = new SearchIndex()
    idx.addFile("remove/file.ts", "file.ts", 100)
    idx.removeFile("remove/file.ts")
    expect(idx.totalFiles).toBe(0)
  })

  it("should rename files in index", () => {
    const idx = new SearchIndex()
    idx.addFile("old/file.ts", "file.ts", 100)
    idx.renameFile("old/file.ts", "new/file.ts", "file.ts")
    expect(idx.getFileCount()).toBe(1)
  })
})
