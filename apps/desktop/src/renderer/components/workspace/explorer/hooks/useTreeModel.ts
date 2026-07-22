import { useRef, useCallback } from "react"
import { useFileTree } from "@pierre/trees/react"
import type { FileTreeRenameEvent, FileTreeDropResult, FileTreeRowDecorationContext, FileTreeRowDecoration } from "@pierre/trees"
import { loadFileTree, buildPathsFromTree, buildDirSetFromTree, renameEntry } from "@/lib/filesystem"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useToastStore } from "@/stores/toast-store"

const AGENT_BADGE_STYLES: Record<string, { text: string; label: string }> = {
  editing: { text: "Editing", label: "AI is modifying this file" },
  reading: { text: "Reading", label: "AI is reading this file" },
  reviewing: { text: "QA", label: "AI is reviewing this file" },
  referencing: { text: "Ref", label: "AI is referencing this file" },
  relevant: { text: "Rel", label: "Task-relevant file" },
  error: { text: "Error", label: "Error in this file" },
}

export function useTreeModel(
  searchQuery: string,
  onSelectionChange?: (paths: readonly string[]) => void,
  fileActivities?: { path: string; activity: string }[],
) {
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const fileTree = useWorkspaceStore((s) => s.fileTree)

  const badgeMapRef = useRef<Map<string, string>>(new Map())
  const prevFileTreeRef = useRef(fileTree)

  // Sync file activities into badge map
  const prevActivitiesRef = useRef(fileActivities)
  if (fileActivities !== prevActivitiesRef.current) {
    prevActivitiesRef.current = fileActivities
    badgeMapRef.current = new Map(
      (fileActivities ?? []).map((fa) => [fa.path, fa.activity])
    )
  }

  const decorationRenderer = useCallback(
    (context: FileTreeRowDecorationContext): FileTreeRowDecoration | null => {
      const activity = badgeMapRef.current.get(context.item.path)
      if (activity) {
        const style = AGENT_BADGE_STYLES[activity]
        if (style) return { text: style.text, title: style.label }
      }
      return null
    },
    [],
  )

  const fullPaths = buildPathsFromTree(fileTree, rootPath || "")
  const dirSet = buildDirSetFromTree(fileTree, rootPath || "")
  const dirs = [...dirSet]

  const handleRename = useCallback(async (event: FileTreeRenameEvent) => {
    const root = useWorkspaceStore.getState().rootPath
    if (!root) return
    try {
      await renameEntry(`${root}/${event.sourcePath}`, `${root}/${event.destinationPath}`)
      const rp = useWorkspaceStore.getState().rootPath
      if (rp) {
        const tree = await loadFileTree(rp)
        useWorkspaceStore.getState().setFileTree(tree)
      }
    } catch (err) {
      console.error("[Explorer] Rename failed:", err)
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
        await renameEntry(`${root}/${sourceRel}`, `${root}/${destRel}`)
        moved.push({ source: sourceRel, dest: destRel })
      }
      const rp = useWorkspaceStore.getState().rootPath
      if (rp) {
        const tree = await loadFileTree(rp)
        useWorkspaceStore.getState().setFileTree(tree)
      }
    } catch {
      for (const m of moved) {
        try { await renameEntry(`${root}/${m.dest}`, `${root}/${m.source}`) } catch { /* noop */ }
      }
      useToastStore.getState().addToast("Move failed — files rolled back", "error", 3000)
    }
  }, [])

  const { model } = useFileTree({
    paths: fullPaths,
    initialExpansion: "open",
    initialExpandedPaths: dirs.slice(0, 500),
    density: "compact",
    fileTreeSearchMode: "hide-non-matches",
    search: false,
    icons: { set: "complete", colored: true },
    renaming: { onRename: handleRename },
    dragAndDrop: { onDropComplete: handleDropComplete },
    renderRowDecoration: decorationRenderer,
    onSelectionChange: onSelectionChange ?? (() => {}),
  })

  if (fileTree !== prevFileTreeRef.current) {
    prevFileTreeRef.current = fileTree
    model.resetPaths(fullPaths, { initialExpandedPaths: dirs.slice(0, 500) })
  }

  if (searchQuery) {
    model.setSearch(searchQuery)
  } else if (model.getSearchValue()) {
    model.setSearch(null)
  }

  const loadTree = useCallback(async () => {
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
    await loadTree()
  }, [loadTree])

  const collapseAll = useCallback(() => {
    model.resetPaths(fullPaths, { initialExpandedPaths: [] })
  }, [fullPaths])

  const expandAll = useCallback(() => {
    model.resetPaths(fullPaths, { initialExpandedPaths: dirs })
  }, [fullPaths, dirs])

  const startRenaming = useCallback((path: string) => {
    model.startRenaming(path)
  }, [])

  return { model, loadTree, refreshTree, collapseAll, expandAll, startRenaming }
}
