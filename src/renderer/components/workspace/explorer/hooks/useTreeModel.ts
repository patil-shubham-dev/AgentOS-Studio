import { useRef, useEffect, useCallback } from "react"
import { FileTree } from "@pierre/trees"
import type { FileTreeOptions, FileTreeRenameEvent, FileTreeDropResult, GitStatusEntry, FileTreeRowDecorationContext, FileTreeRowDecoration } from "@pierre/trees"
import { useWorkspaceStore } from "@/stores/workspace-store"
import type { FileEntry } from "@/types"
import {
  loadFileTree,
  buildPathsFromTree,
  buildDirSetFromTree,
  renameEntry,
  listDirectory,
} from "@/lib/filesystem"

const INITIAL_LOAD_DEPTH = 2

function buildRelativePath(fullPath: string, rootPath: string): string {
  const normFull = fullPath.replace(/\\/g, "/")
  const normRoot = rootPath.replace(/\\/g, "/").replace(/\/$/, "")
  if (normFull.startsWith(normRoot + "/")) {
    return normFull.slice(normRoot.length + 1)
  }
  return normFull.split("/").pop() || normFull
}

export function useTreeModel(
  searchQuery: string,
  onSelectionChange?: (paths: readonly string[]) => void,
  gitStatus?: readonly GitStatusEntry[],
  agentFileBadges?: { path: string; label: string; color: string }[]
) {
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const fileTree = useWorkspaceStore((s) => s.fileTree)

  const modelRef = useRef<FileTree | null>(null)
  const prevFileTreeRef = useRef<FileEntry[]>(fileTree)
  const loadedDirsRef = useRef<Set<string>>(new Set())
  const loadingDirsRef = useRef<Set<string>>(new Set())
  const badgeMapRef = useRef<Map<string, { label: string; color: string }>>(new Map())
  const expandedPathsRef = useRef<Set<string>>(new Set())

  // Build path map from agent badges
  if (agentFileBadges && rootPath) {
    const newMap = new Map<string, { label: string; color: string }>()
    for (const b of agentFileBadges) {
      const rel = buildRelativePath(b.path, rootPath)
      newMap.set(rel, { label: b.label, color: b.color })
    }
    badgeMapRef.current = newMap
  }

  const decorationRenderer = useCallback(
    (context: FileTreeRowDecorationContext): FileTreeRowDecoration | null => {
      const badge = badgeMapRef.current.get(context.item.path)
      if (badge) {
        return { text: badge.label, title: badge.label }
      }
      return null
    },
    []
  )

  const fullPaths = buildPathsFromTree(fileTree, rootPath || "")
  const dirSet = buildDirSetFromTree(fileTree, rootPath || "")
  const dirs = [...dirSet]

  const loadChildrenForDir = useCallback(async (relPath: string) => {
    if (!rootPath) return
    if (loadingDirsRef.current.has(relPath)) return
    loadingDirsRef.current.add(relPath)

    const absPath = relPath.endsWith("/")
      ? `${rootPath}/${relPath.slice(0, -1)}`
      : `${rootPath}/${relPath}`
    const normAbs = absPath.replace(/\\/g, "/").replace(/\/$/, "")

    try {
      const children = await listDirectory(normAbs)
      const model = modelRef.current
      if (!model) return

      const childPaths: string[] = []
      for (const child of children) {
        const rel = buildRelativePath(child.path, rootPath)
        const trail = `${rel}${child.is_dir ? "/" : ""}`
        childPaths.push(trail)
      }

      model.batch(childPaths.map((p) => ({ path: p, type: "add" as const })))
      loadedDirsRef.current.add(relPath)
    } catch (err) {
      console.error(`[TreeModel] Failed to load ${relPath}:`, err)
    } finally {
      loadingDirsRef.current.delete(relPath)
    }
  }, [rootPath])

  const checkExpandedAndLoad = useCallback(() => {
    const model = modelRef.current
    if (!model || !rootPath) return

    const newExpanded = new Set<string>()
    for (const dirPath of dirs) {
      const item = model.getItem(dirPath)
      if (item && 'isExpanded' in item && item.isExpanded()) {
        newExpanded.add(dirPath)
      }
    }

    const prev = expandedPathsRef.current
    for (const dirPath of newExpanded) {
      if (!prev.has(dirPath) && !loadedDirsRef.current.has(dirPath) && !loadingDirsRef.current.has(dirPath)) {
        loadChildrenForDir(dirPath)
      }
    }
    expandedPathsRef.current = newExpanded
  }, [rootPath, dirs, loadChildrenForDir])

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleLoadCheck = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      checkExpandedAndLoad()
    }, 150)
  }, [checkExpandedAndLoad])

  const handleRename = useCallback(async (event: FileTreeRenameEvent) => {
    const root = useWorkspaceStore.getState().rootPath
    if (!root) return
    const absSource = `${root}/${event.sourcePath}`
    const absDest = `${root}/${event.destinationPath}`
    try {
      await renameEntry(absSource, absDest)
      const rp = useWorkspaceStore.getState().rootPath
      if (rp) {
        const tree = await loadFileTree(rp)
        useWorkspaceStore.getState().setFileTree(tree)
      }
    } catch (err) {
      modelRef.current?.move(event.destinationPath, event.sourcePath)
      console.error("[Explorer] Rename failed on filesystem, tree reverted:", err)
    }
  }, [])

  const handleDropComplete = useCallback(async (event: FileTreeDropResult) => {
    const root = useWorkspaceStore.getState().rootPath
    if (!root || event.target.kind === "root") return
    const targetDir = event.target.directoryPath || ""
    const moved: { source: string; dest: string }[] = []
    try {
      for (const sourceRel of event.draggedPaths) {
        const fileName = sourceRel.split("/").pop() || sourceRel
        const destRel = targetDir ? `${targetDir}/${fileName}` : fileName
        const absSource = `${root}/${sourceRel}`
        const absDest = `${root}/${destRel}`
        await renameEntry(absSource, absDest)
        moved.push({ source: sourceRel, dest: destRel })
      }
      const rp = useWorkspaceStore.getState().rootPath
      if (rp) {
        const tree = await loadFileTree(rp)
        useWorkspaceStore.getState().setFileTree(tree)
      }
    } catch {
      for (const m of moved) {
        try {
          await renameEntry(`${root}/${m.dest}`, `${root}/${m.source}`)
        } catch {}
      }
      console.error("[Explorer] Drop failed —", moved.length, "files rolled back")
    }
  }, [])

  if (modelRef.current === null) {
    const treeOptions: FileTreeOptions = {
      paths: fullPaths,
      initialExpansion: "open",
      density: "compact",
      fileTreeSearchMode: "hide-non-matches",
      search: false,
      initialExpandedPaths: dirs.slice(0, 500),
      icons: { set: "complete", colored: true },
      onSelectionChange: onSelectionChange ?? (() => {}),
      renaming: { onRename: handleRename },
      dragAndDrop: { onDropComplete: handleDropComplete },
      renderRowDecoration: decorationRenderer,
    }
    modelRef.current = new FileTree(treeOptions)
    modelRef.current.subscribe(() => {
      scheduleLoadCheck()
    })
  }

  useEffect(() => {
    const model = modelRef.current
    if (!model) return
    const changed = prevFileTreeRef.current !== fileTree
    if (changed) {
      prevFileTreeRef.current = fileTree
      model.resetPaths(fullPaths, {
        initialExpandedPaths: dirs.slice(0, 500),
      })
      loadedDirsRef.current.clear()
      if (searchQuery.length >= 1) {
        model.setSearch(searchQuery)
      }
    }
  }, [fileTree, fullPaths, dirs, searchQuery])

  useEffect(() => {
    const model = modelRef.current
    if (!model) return
    model.setSearch(searchQuery.length >= 1 ? searchQuery : null)
  }, [searchQuery])

  useEffect(() => {
    const model = modelRef.current
    if (!model) return
    model.setGitStatus(gitStatus)
  }, [gitStatus, fileTree])

  useEffect(() => {
    const model = modelRef.current
    if (!model) return
    model.setIcons({ set: "complete", colored: true })
    scheduleLoadCheck()
  }, [agentFileBadges, scheduleLoadCheck])

  useEffect(() => {
    const model = modelRef.current
    return () => {
      if (model) {
        model.cleanUp()
        modelRef.current = null
      }
    }
  }, [])

  const loadTreeCallback = useCallback(async () => {
    if (!rootPath) return
    useWorkspaceStore.getState().setLoading(true)
    try {
      const tree = await loadFileTree(rootPath)
      useWorkspaceStore.getState().setFileTree(tree)
    } catch (err) {
      console.error("[Explorer] Failed to load file tree:", err)
      useWorkspaceStore.getState().setLoading(false)
    }
  }, [rootPath])

  const refreshTree = useCallback(async () => {
    await loadTreeCallback()
  }, [loadTreeCallback])

  const collapseAll = useCallback(() => {
    const model = modelRef.current
    if (!model) return
    model.resetPaths(fullPaths, {
      initialExpandedPaths: [],
    })
    if (searchQuery.length >= 1) {
      model.setSearch(searchQuery)
    }
  }, [fullPaths, searchQuery])

  const expandAll = useCallback(() => {
    const model = modelRef.current
    if (!model) return
    model.resetPaths(fullPaths, {
      initialExpandedPaths: dirs,
    })
    if (searchQuery.length >= 1) {
      model.setSearch(searchQuery)
    }
  }, [fullPaths, dirs, searchQuery])

  const startRenaming = useCallback((relativePath: string) => {
    modelRef.current?.startRenaming(relativePath)
  }, [])

  return {
    model: modelRef.current,
    loadTree: loadTreeCallback,
    refreshTree,
    collapseAll,
    expandAll,
    startRenaming,
  }
}
