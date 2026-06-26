import { fileWatcher, type FileChangeEvent } from "@/lib/file-watcher"
import { workspaceSymbolIndex } from "@/lib/symbol-index"
import { reindexFile, getDependencyGraph } from "@/lib/workspace-intelligence"
import { RepositoryKnowledgeGraph } from "./RepositoryKnowledgeGraph"
import { tsProgramManager } from "@/lib/ts-program-manager"
import { renameFile } from "@/lib/workspace-intelligence"

interface PendingUpdate {
  type: "node" | "edge" | "symbol" | "rename"
  path: string
  timestamp: number
  oldPath?: string
  newPath?: string
}

export class LiveGraphEngine {
  private graph: RepositoryKnowledgeGraph
  private initialized = false
  private pendingUpdates: PendingUpdate[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly FLUSH_INTERVAL_MS = 300
  private readonly STALENESS_TARGET_MS = 1000

  // ── P3.8: Rename tracking ──
  private pendingRenames: Map<string, { oldPath: string; timestamp: number }> = new Map()
  private readonly RENAME_WINDOW_MS = 2000

  constructor() {
    this.graph = RepositoryKnowledgeGraph.getInstance()
  }

  async start(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    await this.graph.initialize()

    fileWatcher.start(
      "",
      (event: FileChangeEvent) => this.handleFileEvent(event)
    )
  }

  stop(): void {
    fileWatcher.stop()
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.pendingUpdates = []
  }

  private handleFileEvent(event: FileChangeEvent): void {
    switch (event.type) {
      case "create": {
        const maybeRename = this.checkPendingRename(event.path)
        if (maybeRename) {
          this.applyAtomicRename(maybeRename, event.path)
        } else {
          this.enqueueUpdate({ type: "node", path: event.path, timestamp: Date.now() })
        }
        break
      }
      case "change":
        this.enqueueUpdate({ type: "edge", path: event.path, timestamp: Date.now() })
        this.enqueueUpdate({ type: "symbol", path: event.path, timestamp: Date.now() })
        break
      case "delete":
        this.pendingRenames.set(event.path, { oldPath: event.path, timestamp: Date.now() })
        this.handleDelete(event.path)
        setTimeout(() => this.pendingRenames.delete(event.path), this.RENAME_WINDOW_MS)
        break
    }
  }

  // ── P3.8: Atomic rename support ──

  private checkPendingRename(newPath: string): string | null {
    const now = Date.now()
    for (const [oldPath, entry] of this.pendingRenames) {
      if (now - entry.timestamp < this.RENAME_WINDOW_MS) {
        const oldBase = oldPath.split(/[/\\]/).pop()?.replace(/\.(ts|tsx|js|jsx)$/, "")
        const newBase = newPath.split(/[/\\]/).pop()?.replace(/\.(ts|tsx|js|jsx)$/, "")
        if (oldBase && newBase && oldBase === newBase) {
          return oldPath
        }
      }
    }
    return null
  }

  private applyAtomicRename(oldPath: string, newPath: string): void {
    const oldNormalized = oldPath.replace(/\\/g, "/")
    const newNormalized = newPath.replace(/\\/g, "/")
    this.graph.atomicRename(oldNormalized, newNormalized)

    renameFile(oldPath, newPath, newPath.split(/[/\\]/).pop() || newPath)
    this.pendingRenames.delete(oldPath)

    this.enqueueUpdate({ type: "symbol", path: newPath, timestamp: Date.now() })
  }

  // ── End P3.8 ──

  private handleDelete(path: string): void {
    this.graph.removeNode(path)
    this.graph.removeEdgesForNode(path)
    tsProgramManager.removeFile(path)

    this.tryFlush()
  }

  private enqueueUpdate(update: PendingUpdate): void {
    const existingIndex = this.pendingUpdates.findIndex(
      u => u.path === update.path && u.type === update.type
    )

    if (existingIndex >= 0) {
      this.pendingUpdates[existingIndex] = update
    } else {
      this.pendingUpdates.push(update)
    }

    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
    }

    const oldest = this.pendingUpdates[0]?.timestamp ?? Date.now()
    const age = Date.now() - oldest

    if (age >= this.STALENESS_TARGET_MS) {
      this.flushNow()
    } else {
      this.flushTimer = setTimeout(
        () => this.flushNow(),
        Math.max(0, this.STALENESS_TARGET_MS - age)
      )
    }
  }

  async flushNow(): Promise<void> {
    if (this.pendingUpdates.length === 0) return

    const updates = [...this.pendingUpdates]
    this.pendingUpdates = []

    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    const uniquePaths = [...new Set(updates.map(u => u.path))]

    await Promise.allSettled(
      uniquePaths.map(path => this.processPath(path))
    )
  }

  private async processPath(path: string): Promise<void> {
    try {
      await reindexFile(path)

      const depGraph = getDependencyGraph()
      if (!depGraph) return

      const node = depGraph.nodes.find(n =>
        path.replace(/\\/g, "/").endsWith(n.path.replace(/\\/g, "/"))
      )

      if (node) {
        this.graph.addNode(path, "file", node.name, {
          path, imports: node.imports, importedBy: node.importedBy,
        })

        for (const imp of node.imports) {
          this.graph.addEdge(path, imp, "imports")
        }
        for (const ib of node.importedBy) {
          this.graph.addEdge(ib, path, "imports")
        }
      }

      const symbols = workspaceSymbolIndex.getSymbolsByFile(path)
      for (const sym of symbols) {
        const nodeType = this.symbolKindToNodeType(sym.kind)
        this.graph.addNode(sym.name, nodeType, sym.name, {
          file: sym.file, line: sym.line, kind: sym.kind,
        })
        this.graph.addEdge(path, sym.name, "contains")

        if (sym.extends) {
          for (const ext of sym.extends) {
            this.graph.addEdge(sym.name, ext, "extends")
          }
        }
        if (sym.implements) {
          for (const imp of sym.implements) {
            this.graph.addEdge(sym.name, imp, "implements")
          }
        }
      }

      const allSymbols = workspaceSymbolIndex.getData().symbols
      const callGraph = workspaceSymbolIndex.getData().callGraph

      for (const call of callGraph) {
        if (call.callerFile === path || call.calleeFile === path) {
          this.graph.addEdge(call.caller, call.callee, "calls")
        }
      }

      if (path.includes(".test.") || path.includes(".spec.") || path.includes("__tests__")) {
        this.graph.addNode(path, "test", path.split("/").pop() || path, {
          testName: path, file: path,
        })
        const sourceFile = this.resolveSourceFromTest(path)
        if (sourceFile) {
          this.graph.addEdge(path, sourceFile, "tests")
          this.graph.addEdge(sourceFile, path, "tested-by")
        }
      }
    } catch (err) {
      console.warn(`[LiveGraphEngine] Failed to process ${path}:`, err)
    }
  }

  private resolveSourceFromTest(testPath: string): string | null {
    const candidates = [
      testPath.replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, ".$2"),
      testPath.replace(/\/__tests__\//, "/").replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, ".$2"),
      testPath.replace(/\/tests\//, "/src/").replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, ".$2"),
    ]
    for (const c of candidates) {
      if (this.graph.findNode(c)) return c
      const depGraph = getDependencyGraph()
      if (depGraph?.nodes.some(n => n.path === c)) return c
    }
    return null
  }

  private symbolKindToNodeType(kind: string): string {
    const map: Record<string, string> = {
      function: "function", class: "class", interface: "type", type: "type",
      enum: "type", const: "symbol", component: "component", hook: "function",
      store: "service", route: "route", method: "function",
    }
    return map[kind] ?? "symbol"
  }

  private tryFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
    }
    this.flushTimer = setTimeout(() => this.flushNow(), this.FLUSH_INTERVAL_MS)
  }
}

export const liveGraphEngine = new LiveGraphEngine()
