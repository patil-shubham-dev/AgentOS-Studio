import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { useWorkspaceStore } from "@/stores/workspace-store"
import type { FileEntry } from "@/types"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronRight } from "lucide-react"
import { File, Folder, FolderOpen, Search, ArrowRight, Hash, Layers } from "lucide-react"

interface FolderNode {
  name: string
  path: string
  children: FolderNode[]
  files: { name: string; path: string }[]
  depth: number
  expanded: boolean
}

interface ImportEdge {
  from: string
  to: string
  target: string
}

function buildFolderNodes(entries: FileEntry[], depth: number): { children: FolderNode[]; files: { name: string; path: string }[] } {
  const nodes: FolderNode[] = []
  const files: { name: string; path: string }[] = []
  for (const entry of entries) {
    if (entry.is_dir) {
      const sub = buildFolderNodes(entry.children, depth + 1)
      nodes.push({
        name: entry.name,
        path: entry.path,
        children: sub.children,
        files: sub.files,
        depth,
        expanded: false,
      })
    } else {
      files.push({ name: entry.name, path: entry.path })
    }
  }
  return { children: nodes, files }
}

function buildFolderTree(entries: FileEntry[]): FolderNode {
  const { children, files } = buildFolderNodes(entries, 1)
  return { name: "root", path: "", children, files, depth: 0, expanded: false }
}

function parseImports(content: string): string[] {
  const imports: string[] = []
  const patterns = [
    /from\s+['"]([^'"]+)['"]/g,
    /require\(['"]([^'"]+)['"]\)/g,
    /import\s+['"]([^'"]+)['"]/g,
  ]
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(content)) !== null) {
      const target = match[1]
      if (target.startsWith(".") || target.startsWith("/")) {
        imports.push(target)
      }
    }
  }
  return imports
}

function resolveImportPath(importerPath: string, importTarget: string): string | null {
  const normalizedImporter = importerPath.replace(/\\/g, "/")
  const dir = normalizedImporter.substring(0, normalizedImporter.lastIndexOf("/"))
  if (importTarget.startsWith("./")) {
    return (dir + "/" + importTarget.substring(2)).replace(/\/+/g, "/")
  }
  if (importTarget.startsWith("../")) {
    let currentDir = dir
    let target = importTarget
    while (target.startsWith("../")) {
      currentDir = currentDir.substring(0, currentDir.lastIndexOf("/"))
      target = target.substring(3)
    }
    return (currentDir + "/" + target).replace(/\/+/g, "/")
  }
  return null
}

export function ProjectMap() {
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [importsCache, setImportsCache] = useState<Map<string, string[]>>(new Map())
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<"hierarchy" | "dependencies">("hierarchy")
  const scrollRef = useRef<HTMLDivElement>(null)

  const folderTree = useMemo(() => buildFolderTree(fileTree), [fileTree])

  const edges = useMemo(() => {
    const result: ImportEdge[] = []
    for (const [from, targets] of importsCache) {
      for (const target of targets) {
        const resolved = resolveImportPath(from, target)
        if (resolved) {
          result.push({ from, to: resolved, target })
        }
      }
    }
    return result
  }, [importsCache])

  const analyzeImports = useCallback(async () => {
    if (!rootPath || fileTree.length === 0) return
    setLoading(true)
    const cache = new Map<string, string[]>()
    const allFiles: { name: string; path: string }[] = []
    function collect(entries: FileEntry[]) {
      for (const e of entries) {
        if (e.is_dir) collect(e.children)
        else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) allFiles.push({ name: e.name, path: e.path })
      }
    }
    collect(fileTree)
    for (const file of allFiles.slice(0, 200)) {
      try {
        const fullPath = rootPath + "\\" + file.path.replace(/\//g, "\\")
        const { readTextFile } = await import("@tauri-apps/plugin-fs")
        const content = await readTextFile(fullPath)
        const imports = parseImports(content)
        if (imports.length > 0) cache.set(file.path, imports)
      } catch {
        // unreadable
      }
    }
    setImportsCache(cache)
    setLoading(false)
  }, [rootPath, fileTree])

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const renderFolderNode = (node: FolderNode, depth: number) => {
    const expanded = expandedFolders.has(node.path)
    const hasChildren = node.children.length > 0 || node.files.length > 0
    return (
      <div key={node.path}>
        <button
          onClick={() => hasChildren && toggleFolder(node.path)}
          className={cn(
            "flex w-full items-center gap-1.5 px-2 py-1 text-[11px] hover:bg-white/[0.03] transition-colors text-left",
            depth > 0 ? "text-white/40" : "text-white/60 font-medium",
          )}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />
          ) : (
            <span className="w-3 shrink-0" />
          )}
          {expanded ? <FolderOpen className="h-3 w-3 shrink-0 text-amber-400/70" /> : <Folder className="h-3 w-3 shrink-0 text-amber-500/60" />}
          <span className="truncate">{node.name === "root" ? (rootPath?.split(/[/\\]/).pop() || "Project") : node.name}</span>
          <span className="ml-auto text-[9px] text-white/15">{node.children.length + node.files.length}</span>
        </button>
        {expanded && (
          <>
            {node.children.map((child) => renderFolderNode(child, depth + 1))}
            {node.files.map((file) => {
              const edges = importsCache.get(file.path)
              return (
                <button
                  key={file.path}
                  onClick={() => setSelectedFile(selectedFile === file.path ? null : file.path)}
                  className={cn(
                    "flex w-full items-center gap-1.5 px-2 py-0.5 text-[10px] hover:bg-white/[0.03] transition-colors text-left",
                    selectedFile === file.path ? "text-white/70 bg-white/[0.04]" : "text-white/35",
                  )}
                  style={{ paddingLeft: `${22 + depth * 14}px` }}
                >
                  <File className="h-2.5 w-2.5 shrink-0 text-white/20" />
                  <span className="truncate">{file.name}</span>
                  {edges && edges.length > 0 && (
                    <span className="ml-auto text-[8px] text-blue-400/40 shrink-0">{edges.length} dep{edges.length > 1 ? "s" : ""}</span>
                  )}
                </button>
              )
            })}
          </>
        )}
      </div>
    )
  }

  const selectedEdges = useMemo(() => {
    if (!selectedFile) return []
    return edges.filter((e) => e.from === selectedFile || e.to === selectedFile)
  }, [selectedFile, edges])

  if (!rootPath || fileTree.length === 0) return null

  return (
    <div className="flex flex-col">
      {/* View toggle */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/[0.06]">
        <button
          onClick={() => setView("hierarchy")}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors",
            view === "hierarchy" ? "bg-white/[0.06] text-white/60" : "text-white/30 hover:text-white/50",
          )}
        >
          <Layers className="h-3 w-3" />
          Structure
        </button>
        <button
          onClick={() => { setView("dependencies"); if (importsCache.size === 0) analyzeImports() }}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors",
            view === "dependencies" ? "bg-white/[0.06] text-white/60" : "text-white/30 hover:text-white/50",
          )}
        >
          <Hash className="h-3 w-3" />
          Dependencies
        </button>
        {view === "dependencies" && (
          <button
            onClick={analyzeImports}
            disabled={loading}
            className="ml-auto text-[9px] text-blue-400/50 hover:text-blue-400 disabled:text-white/10"
          >
            {loading ? "Scanning..." : "Refresh"}
          </button>
        )}
      </div>

      {/* Content */}
      <div ref={scrollRef} className="overflow-y-auto max-h-[400px]">
        {view === "hierarchy" && (
          <div className="py-1">
            {renderFolderNode(folderTree, 0)}
          </div>
        )}

        {view === "dependencies" && (
          <div className="py-1">
            {importsCache.size === 0 ? (
              <div className="px-3 py-4 text-center">
                <Search className="h-5 w-5 mx-auto mb-1 text-white/10" />
                <p className="text-[11px] text-white/20">No dependencies analyzed</p>
                <button
                  onClick={analyzeImports}
                  className="mt-2 text-[10px] text-blue-400/60 hover:text-blue-400"
                >
                  Analyze imports
                </button>
              </div>
            ) : (
              <div>
                {/* File list with import counts */}
                {Array.from(importsCache.entries())
                  .sort((a, b) => b[1].length - a[1].length)
                  .slice(0, 30)
                  .map(([path, deps]) => (
                    <div key={path}>
                      <button
                        onClick={() => setSelectedFile(selectedFile === path ? null : path)}
                        className={cn(
                          "flex w-full items-center gap-1.5 px-3 py-0.5 text-[10px] hover:bg-white/[0.03] transition-colors text-left",
                          selectedFile === path ? "text-white/70 bg-white/[0.04]" : "text-white/35",
                        )}
                      >
                        <File className="h-2.5 w-2.5 shrink-0 text-white/20" />
                        <span className="truncate">{path.split("/").pop()}</span>
                        <span className="ml-auto text-[8px] text-blue-400/40">{deps.length} dep{deps.length > 1 ? "s" : ""}</span>
                      </button>
                      {selectedFile === path && (
                        <div className="ml-6 pl-2 border-l border-white/[0.06] py-0.5 space-y-0.5">
                          {deps.map((dep, i) => (
                            <div key={i} className="flex items-center gap-1 text-[9px] text-white/25">
                              <ArrowRight className="h-2 w-2 shrink-0" />
                              <span className="truncate font-mono">{dep}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                <div className="px-3 py-1 text-[9px] text-white/15">
                  {importsCache.size} files with imports — showing top 30
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
