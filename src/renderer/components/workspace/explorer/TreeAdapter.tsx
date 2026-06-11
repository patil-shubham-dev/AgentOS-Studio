import { useCallback, useRef, useMemo, useEffect } from "react"
import { FileTree, useFileTree, useFileTreeSelection } from "@pierre/trees/react"
import type { FileTreeOptions } from "@pierre/trees"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { readFile } from "@/lib/workspace"
import type { FileEntry } from "@/types"

function buildPaths(entries: FileEntry[], rootPath: string): string[] {
  const paths: string[] = []
  const root = rootPath.replace(/\\/g, "/").replace(/\/$/, "")
  function walk(list: FileEntry[]) {
    for (const e of list) {
      const rel = e.path.replace(/\\/g, "/")
      const p = rel.startsWith(root + "/") ? rel.slice(root.length + 1) : e.name
      paths.push(p)
      if (e.is_dir && e.children.length > 0) walk(e.children)
    }
  }
  walk(entries)
  return paths
}

function buildDirSet(entries: FileEntry[], rootPath: string): Set<string> {
  const dirs = new Set<string>()
  const root = rootPath.replace(/\\/g, "/").replace(/\/$/, "")
  function walk(list: FileEntry[]) {
    for (const e of list) {
      const rel = e.path.replace(/\\/g, "/")
      const p = rel.startsWith(root + "/") ? rel.slice(root.length + 1) : e.name
      if (e.is_dir) {
        dirs.add(p)
        if (e.children.length > 0) walk(e.children)
      }
    }
  }
  walk(entries)
  return dirs
}

interface WorkspaceTreeProps {
  onOpenSearchFile?: (path: string) => void
}

export function WorkspaceTree({ onOpenSearchFile }: WorkspaceTreeProps) {
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const openFile = useWorkspaceStore((s) => s.openFile)

  const paths = useMemo(() => {
    if (!rootPath || fileTree.length === 0) return []
    const p = buildPaths(fileTree, rootPath)
    return p
  }, [fileTree, rootPath])

  const dirSet = useMemo(() => {
    if (!rootPath || fileTree.length === 0) return new Set<string>()
    return buildDirSet(fileTree, rootPath)
  }, [fileTree, rootPath])

  const dirs = useMemo(() => [...dirSet], [dirSet])

  const openFileRef = useRef(openFile)
  openFileRef.current = openFile
  const dirSetRef = useRef(dirSet)
  dirSetRef.current = dirSet
  const rootPathRef = useRef(rootPath)
  rootPathRef.current = rootPath

  console.log(`[TRACE:WorkspaceTree] Render: ${fileTree.length} roots, rootPath=${rootPath}, ${paths.length} paths, ${dirs.length} dirs`)
  if (fileTree.length > 0) {
    console.log("[TRACE:WorkspaceTree] first root:", JSON.stringify(fileTree[0]).slice(0, 200))
    console.log("[TRACE:WorkspaceTree] first root is_dir:", fileTree[0].is_dir)
  }

  const handleSelectionChange = useCallback((selectedPaths: readonly string[]) => {
    const path = selectedPaths[0]
    if (!path) return
    if (dirSetRef.current.has(path)) return
    const rp = rootPathRef.current
    if (!rp) return
    const absolutePath = `${rp}\\${path.replace(/\//g, "\\")}`
    ;(async () => {
      try {
        const content = await readFile(absolutePath)
        const name = path.split("/").pop() || path
        openFileRef.current({ path, name, content, isDirty: false })
      } catch {
        openFileRef.current({ path, name: path.split("/").pop() || path, content: "", isDirty: false })
      }
    })()
  }, [])

  const treeOptions: FileTreeOptions = useMemo(() => ({
    paths,
    initialExpansion: "open",
    density: "compact",
    search: false,
    renaming: false,
    dragAndDrop: false,
    initialExpandedPaths: dirs.slice(0, 200),
    onSelectionChange: handleSelectionChange,
  }), [paths, handleSelectionChange, dirs])

  const { model } = useFileTree(treeOptions)

  if (!rootPath || fileTree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-center px-4 text-xs text-white/30">
        <p>No files loaded</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden">
      <FileTree
        model={model}
        className="h-full"
        style={{ height: "100%" }}
      />
    </div>
  )
}
