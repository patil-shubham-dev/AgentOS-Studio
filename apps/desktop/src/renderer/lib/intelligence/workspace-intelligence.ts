import { workspaceIndex, type SearchQuery, type SearchResult, type SearchCallback } from "@/lib/search/search-index"
import { workspaceSymbolIndex, type SymbolInfo } from "./symbol-index"
import { DependencyScanner, type DependencyGraph, type DependencyNode, type CircularDependency } from "./dependency-scanner"
import { semanticSearch as semanticSearchEngine, type SemanticSearchResult } from "@/lib/search/semantic-search"
import { tsProgramManager, type TSSymbolInfo } from "@/lib/ts-program-manager"
import { ArchitectureDetector, type ArchitectureSummary, type DetectedProject } from "./architecture-detector"
import { indexPersistence } from "@/lib/search/index-persistence"
import { fileWatcher, type FileChangeEvent } from "@/lib/filesystem/file-watcher"
import { typeGraph, type TypeNode, type WhatBreaksResult } from "./type-graph"
import { ImpactAnalyzer } from "./impact-analyzer"
import type { ImpactAnalysis } from "./impact-analyzer"
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
let currentArchitectureDetector: ArchitectureDetector | null = null
let pendingUpdate: (() => void) | null = null
const impactAnalyzer = new ImpactAnalyzer(typeGraph, () => currentScanner?.getGraph() ?? null)
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
  currentArchitectureDetector = new ArchitectureDetector()

  // Try loading persisted indexes first for fast startup
  const loaded = await indexPersistence.loadAll()

  if (loaded.symbolIndex && loaded.semanticIndex) {
    console.log("[WorkspaceIntelligence] Loaded persisted indexes")
  } else {
    console.log("[WorkspaceIntelligence] Building indexes from scratch...")
  }

  await Promise.all([
    workspaceIndex.initialize(entries, rootPath),
    workspaceSymbolIndex.initialize(rootPath, entries),
    currentScanner.scan(entries),
    buildSemanticIndex(entries, rootPath),
  ])

  // Build type graph from TS symbols
  if (tsProgramManager.isReady) {
    const symbols = tsProgramManager.getAllSymbols()
    typeGraph.build(symbols)
  }

  // Start file watching for incremental updates
  fileWatcher.start(rootPath, (event: FileChangeEvent) => {
    if (event.type === "delete") {
      workspaceSymbolIndex.removeFile(event.path)
      currentScanner?.removeFile(event.path)
    }
  })

  // Save indexes after initial build
  await indexPersistence.saveAll()
  console.log("[WorkspaceIntelligence] Indexes persisted")

  // Detect architecture
  const filePaths = collectFilePaths(entries)
  currentArchitectureDetector.detect(rootPath, filePaths)
}

function collectFilePaths(entries: FileEntry[]): string[] {
  const paths: string[] = []
  function walk(list: FileEntry[]) {
    for (const e of list) {
      if (!e.is_dir) paths.push(e.path)
      if (e.is_dir && e.children.length > 0) walk(e.children)
    }
  }
  walk(entries)
  return paths
}

async function buildSemanticIndex(entries: FileEntry[], rootPath: string): Promise<void> {
  await semanticSearchEngine.buildIndex(entries, rootPath)
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

export async function semanticSearch(query: string): Promise<SemanticSearchResult[]> {
  return semanticSearchEngine.search(query, 30)
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

// ── P3 ADDITIONS ──

export function getArchitectureSummary(): ArchitectureSummary | null {
  return currentArchitectureDetector?.getArchitecture(
    "",
    []
  ) ?? null
}

export function getDetectedProject(): DetectedProject | null {
  if (!currentArchitectureDetector) return null
  return null // will be populated on next detect call
}

export function getCircularDependencies(): CircularDependency[] {
  return currentScanner?.detectCircularDependencies() ?? []
}

export function resolveExport(
  importName: string,
  fromFile: string
): string | null {
  return tsProgramManager.resolveImport(importName, fromFile)
}

export function getExportMap(filePath: string): Record<string, string> {
  return currentScanner?.resolveExports(filePath) ?? {}
}

export function getTSSymbols(): TSSymbolInfo[] {
  return tsProgramManager.getAllSymbols()
}

export function getTSSymbolsInFile(filePath: string): TSSymbolInfo[] {
  return tsProgramManager.getSymbolsInFile(filePath)
}

export async function saveIndexes(): Promise<boolean> {
  const result = await indexPersistence.saveAll()
  return result.symbolIndex || result.semanticIndex
}

export async function loadIndexes(): Promise<boolean> {
  const result = await indexPersistence.loadAll()
  return result.symbolIndex || result.semanticIndex
}

export async function getIndexSize(): Promise<number> {
  return indexPersistence.getApproximateSize()
}

export function getFileWatcher(): typeof fileWatcher {
  return fileWatcher
}

export function isTSPMReady(): boolean {
  return tsProgramManager.isReady
}

export function getTypeGraph(): typeof typeGraph {
  return typeGraph
}

export function getTypeContextForFiles(filePaths: string[], maxTypes = 10): string {
  return typeGraph.getTypeContextForFiles(filePaths, maxTypes)
}

export function getWhereUsed(typeName: string): string[] {
  return typeGraph.whereUsed(typeName)
}

export function getWhoDependsOn(filePath: string): string[] {
  return typeGraph.whoDependsOn(filePath)
}

export function getWhatBreaks(filePath: string, changedType: string): WhatBreaksResult {
  return typeGraph.whatBreaks(filePath, changedType)
}

export function getTypesInFile(filePath: string): TypeNode[] {
  return typeGraph.getTypesInFile(filePath)
}

export function getAllTypes(): TypeNode[] {
  return typeGraph.getAllTypes()
}

export function analyzeImpact(targetFile: string): ImpactAnalysis {
  return impactAnalyzer.analyze(targetFile)
}

export function formatImpactForLLM(analysis: ImpactAnalysis): string {
  return impactAnalyzer.formatForLLM(analysis)
}

// ── Project config integration ──

let currentProjectConfig: {
  architecture: string
  languages: string[]
  frameworks: string[]
  conventions: string[]
} | null = null

/**
 * Feed structured project config from AGENTIC.md into workspace intelligence.
 * This enriches context scoring, dependency scanning, and symbol indexing
 * with project-specific knowledge about architecture, stack, and conventions.
 */
export function applyProjectConfig(config: {
  architecture: { type: string; workspaces: string[]; entryPoints: string[] }
  stack: { languages: string[]; frameworks: string[]; buildTool: string | null; testFramework: string | null }
  conventions: { isTypeScript: boolean; isStrictMode: boolean; styling: string; customRules: string[] }
}): void {
  currentProjectConfig = {
    architecture: config.architecture.type,
    languages: config.stack.languages,
    frameworks: config.stack.frameworks,
    conventions: [
      config.conventions.isTypeScript ? `TypeScript ${config.conventions.isStrictMode ? "(strict)" : ""}` : "",
      `Styling: ${config.conventions.styling}`,
      ...config.conventions.customRules,
    ].filter(Boolean),
  }
  // Update architecture detector with known entry points
  if (currentArchitectureDetector && config.architecture.entryPoints.length > 0) {
    // ArchitectureDetector doesn't support injection, but results
    // will be enriched via getProjectConfigForScoring()
  }
  console.log("[WorkspaceIntelligence] Applied project config:", currentProjectConfig)
}

/**
 * Get project config for context scoring and relevance matching.
 * Returns a formatted string that can influence file relevance scoring.
 */
export function getProjectConfigForScoring(): string | null {
  if (!currentProjectConfig) return null
  const parts: string[] = []
  parts.push(`Architecture: ${currentProjectConfig.architecture}`)
  if (currentProjectConfig.languages.length > 0) {
    parts.push(`Languages: ${currentProjectConfig.languages.join(", ")}`)
  }
  if (currentProjectConfig.frameworks.length > 0) {
    parts.push(`Frameworks: ${currentProjectConfig.frameworks.join(", ")}`)
  }
  if (currentProjectConfig.conventions.length > 0) {
    parts.push(`Conventions: ${currentProjectConfig.conventions.join("; ")}`)
  }
  return parts.join("\n")
}

export { tsProgramManager, ArchitectureDetector, indexPersistence, fileWatcher, typeGraph }
export type { ArchitectureSummary, DetectedProject, CircularDependency, TSSymbolInfo, TypeNode, WhatBreaksResult, ImpactAnalysis }
