import { workspaceIndex, type SearchQuery, type SearchResult, type SearchCallback } from "./search-index"
import { workspaceSymbolIndex, type SymbolInfo } from "./symbol-index"
import { DependencyScanner, type DependencyGraph, type DependencyNode } from "./dependency-scanner"
import type { FileEntry } from "@/types"

export interface ProjectMap {
  name: string
  rootPath: string
  totalFiles: number
  totalSymbols: number
  totalEdges: number
  topImported: DependencyNode[]
  topNpmDeps: Array<{ name: string; importCount: number }>
  symbolCountByKind: Record<string, number>
  indexedAt: number
}

export interface ArchitectureLayer {
  name: string
  description: string
  files: string[]
  symbols: SymbolInfo[]
}

export interface ArchitectureMap {
  layers: ArchitectureLayer[]
  entryPoints: SymbolInfo[]
  utilities: SymbolInfo[]
  totalFiles: number
  totalSymbols: number
}

let currentScanner: DependencyScanner | null = null
let pendingUpdate: (() => void) | null = null
let updateTimer: ReturnType<typeof setTimeout> | null = null

function scheduleUpdate(fn: () => void, delay = 300): void {
  if (updateTimer) clearTimeout(updateTimer)
  pendingUpdate = fn
  updateTimer = setTimeout(() => {
    pendingUpdate?.()
    pendingUpdate = null
  }, delay)
}

export async function initializeWorkspaceIntelligence(
  rootPath: string,
  entries: FileEntry[]
): Promise<void> {
  currentScanner = new DependencyScanner(rootPath)

  await Promise.all([
    workspaceIndex.initialize(entries, rootPath),
    workspaceSymbolIndex.initialize(rootPath, entries),
    currentScanner.scan(entries),
  ])
}

export async function reindexFile(
  absPath: string,
  contentProvider?: (path: string) => Promise<string | null>
): Promise<void> {
  await Promise.all([
    workspaceSymbolIndex.reindexFile(absPath, contentProvider),
    currentScanner?.reindexFile(absPath, contentProvider),
  ])
}

export function markFileDirty(path: string): void {
  workspaceIndex.markDirty(path)
}

export function addFile(path: string, name: string, size: number): void {
  workspaceIndex.addFile(path, name, size)
  currentScanner?.addFile(path)
  workspaceSymbolIndex.removeFile(path)
}

export function removeFile(path: string): void {
  workspaceIndex.removeFile(path)
  currentScanner?.removeFile(path)
  workspaceSymbolIndex.removeFile(path)
}

export function renameFile(oldPath: string, newPath: string, newName: string): void {
  workspaceIndex.renameFile(oldPath, newPath, newName)
  currentScanner?.removeFile(oldPath)
  currentScanner?.addFile(newPath)
  workspaceSymbolIndex.removeFile(oldPath)
}

export function scheduleFileUpdate(path: string, fn: () => Promise<void>): void {
  scheduleUpdate(async () => {
    await fn()
    workspaceIndex.clearDirty(path)
  })
}

export async function getProjectMap(rootPath: string): Promise<ProjectMap> {
  const [searchStats, symbolStats] = await Promise.all([
    workspaceIndex.getStats(),
    workspaceSymbolIndex.getStats(),
  ])

  const topImported = currentScanner?.getTopImported(10) ?? []
  const topNpmDeps = currentScanner?.getTopNpmDependencies(15) ?? []

  const symbolCountByKind: Record<string, number> = {}
  for (const sym of workspaceSymbolIndex.getData().symbols) {
    symbolCountByKind[sym.kind] = (symbolCountByKind[sym.kind] ?? 0) + 1
  }

  return {
    name: rootPath.split(/[/\\]/).pop() || "Project",
    rootPath,
    totalFiles: searchStats.totalFiles,
    totalSymbols: symbolStats.totalSymbols,
    totalEdges: workspaceSymbolIndex.getData().callGraph.length,
    topImported,
    topNpmDeps: topNpmDeps.map((d) => ({ name: d.name, importCount: d.importCount })),
    symbolCountByKind,
    indexedAt: symbolStats.indexedAt,
  }
}

export function getArchitectureMap(): ArchitectureMap {
  const allSymbols = workspaceSymbolIndex.getData().symbols

  const entryPoints = allSymbols.filter(
    (s) => s.name === "App" || s.name === "app" || s.name === "main" || s.file.endsWith("main.tsx") || s.file.endsWith("App.tsx")
  )

  const utilities = allSymbols.filter(
    (s) =>
      s.kind === "function" &&
      (s.file.includes("/lib/") || s.file.includes("/utils/"))
  )

  const routeSymbols = allSymbols.filter((s) => s.kind === "route")
  const storeSymbols = allSymbols.filter((s) => s.kind === "store")
  const componentSymbols = allSymbols.filter((s) => s.kind === "component" || s.kind === "hook")

  const componentFiles = [...new Set(componentSymbols.map((s) => s.file))]
  const storeFiles = [...new Set(storeSymbols.map((s) => s.file))]
  const routeFiles = [...new Set(routeSymbols.map((s) => s.file))]
  const libFiles = [...new Set(utilities.map((s) => s.file))]

  const layers: ArchitectureLayer[] = [
    {
      name: "Entry Points",
      description: "Application entry and root components",
      files: [...new Set(entryPoints.map((s) => s.file))],
      symbols: entryPoints,
    },
    {
      name: "Pages / Routes",
      description: "Page-level components and route definitions",
      files: routeFiles,
      symbols: routeSymbols,
    },
    {
      name: "Components",
      description: "Reusable UI components and hooks",
      files: componentFiles,
      symbols: componentSymbols,
    },
    {
      name: "State Management",
      description: "Zustand stores and state logic",
      files: storeFiles,
      symbols: storeSymbols,
    },
    {
      name: "Utilities",
      description: "Library utilities and helper functions",
      files: libFiles,
      symbols: utilities,
    },
  ]

  return {
    layers,
    entryPoints,
    utilities,
    totalFiles: workspaceIndex.getStats().totalFiles,
    totalSymbols: allSymbols.length,
  }
}

export function getDependencyGraph(): DependencyGraph | null {
  return currentScanner?.getGraph() ?? null
}

export function getCallHierarchy(name: string) {
  return workspaceSymbolIndex.getCallHierarchy(name)
}

export function getReferenceGraph(name: string) {
  return workspaceSymbolIndex.findReferences(name)
}

export async function semanticSearch(query: string): Promise<SymbolInfo[]> {
  return workspaceSymbolIndex.fuzzySearchSymbols(query)
}

export async function symbolSearch(
  query: string,
  kind?: string
): Promise<SymbolInfo[]> {
  if (kind && ["function", "class", "interface", "type", "enum", "const", "hook", "store", "component", "route"].includes(kind)) {
    return workspaceSymbolIndex.searchSymbols(query, kind as SymbolInfo["kind"])
  }
  return workspaceSymbolIndex.searchSymbols(query)
}

export function getSearchStats() {
  return workspaceIndex.getStats()
}

export function getSymbolStats() {
  return workspaceSymbolIndex.getStats()
}

export function getIndexedAt(): number {
  return workspaceSymbolIndex.getData().indexedAt
}
