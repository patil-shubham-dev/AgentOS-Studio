import type { FileEntry } from "@/types"

const eapi =
  typeof window !== "undefined" && (window as any).electronAPI
    ? (window as any).electronAPI
    : null

function isElectron(): boolean {
  return !!eapi
}

let _webRootHandle: FileSystemDirectoryHandle | null = null
let _webRootPath: string | null = null

async function hasTauri(): Promise<boolean> {
  try {
    const { invoke } = await import("@/lib/electron-api")
    return typeof invoke === "function"
  } catch {
    return false
  }
}

type DirHandle = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<
    [string, FileSystemDirectoryHandle | FileSystemFileHandle]
  >
}

async function* walkDirectory(
  dir: FileSystemDirectoryHandle,
  parentPath: string
): AsyncGenerator<FileEntry> {
  for await (const [name, handle] of (dir as DirHandle).entries()) {
    const entryPath = parentPath ? `${parentPath}\\${name}` : name
    if (handle.kind === "directory") {
      const children: FileEntry[] = []
      for await (const child of walkDirectory(
        handle as FileSystemDirectoryHandle,
        entryPath
      )) {
        children.push(child)
      }
      yield { name, path: entryPath, is_dir: true, children }
    } else {
      yield { name, path: entryPath, is_dir: false, children: [] }
    }
  }
}

async function loadWebFileTree(): Promise<FileEntry[]> {
  if (!_webRootHandle) return []
  const entries: FileEntry[] = []
  for await (const entry of walkDirectory(_webRootHandle, "")) {
    entries.push(entry)
  }
  return entries
}

async function resolveWebHandle(
  pathSegments: string[]
): Promise<FileSystemDirectoryHandle | FileSystemFileHandle | null> {
  if (!_webRootHandle) return null
  let current: FileSystemDirectoryHandle | FileSystemFileHandle = _webRootHandle
  for (let i = 0; i < pathSegments.length; i++) {
    const seg = pathSegments[i]
    if (current.kind !== "directory") return null
    const dir = current as FileSystemDirectoryHandle
    if (i === pathSegments.length - 1) {
      try {
        return await dir.getFileHandle(seg)
      } catch {
        try {
          return await dir.getDirectoryHandle(seg)
        } catch {
          return null
        }
      }
    } else {
      try {
        current = await dir.getDirectoryHandle(seg)
      } catch {
        return null
      }
    }
  }
  return current
}

async function readWebFile(path: string): Promise<string> {
  const segs = path.split(/[/\\]+/).filter(Boolean)
  const fileHandle = await resolveWebHandle(segs)
  if (!fileHandle || fileHandle.kind !== "file")
    throw new Error(`File not found: ${path}`)
  const file = await (fileHandle as FileSystemFileHandle).getFile()
  return await file.text()
}

async function getWebDirHandle(
  path: string
): Promise<FileSystemDirectoryHandle | null> {
  const segs = path.split(/[/\\]+/).filter(Boolean)
  if (segs.length === 0) return _webRootHandle
  let current = _webRootHandle
  if (!current) return null
  for (const seg of segs) {
    try {
      current = await current.getDirectoryHandle(seg)
    } catch {
      return null
    }
  }
  return current
}

export function setWebRootHandle(
  handle: FileSystemDirectoryHandle | null,
  path: string | null
): void {
  _webRootHandle = handle
  _webRootPath = path
}

export function getWebRootHandle(): FileSystemDirectoryHandle | null {
  return _webRootHandle
}

export function getWebRootPath(): string | null {
  return _webRootPath
}

export async function listDirectory(dirPath: string): Promise<FileEntry[]> {
  if (isElectron()) {
    return (await eapi.workspaceListDirectory(dirPath)) as FileEntry[]
  }
  try {
    const { invoke } = await import("@/lib/electron-api")
    return await invoke<FileEntry[]>("list_directory", { path: dirPath })
  } catch {
    console.warn("[filesystem] Tauri not available, trying web")
    const segs = dirPath.split(/[/\\]+/).filter(Boolean)
    let dir = _webRootHandle
    if (!dir) return []
    for (const seg of segs) {
      try { dir = await dir.getDirectoryHandle(seg) } catch { console.warn("[filesystem] Failed to get directory handle:", seg); return [] }
    }
    const entries: FileEntry[] = []
    for await (const [name, handle] of (dir as unknown as DirHandle).entries()) {
      if (name.startsWith('.')) continue
      entries.push({
        name,
        path: `${dirPath}\\${name}`,
        is_dir: handle.kind === "directory",
        children: [],
      })
    }
    return entries.sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }
}

export async function loadFileTree(rootPath: string): Promise<FileEntry[]> {
  if (isElectron()) {
    return (await eapi.workspaceGetTree(rootPath)) as FileEntry[]
  }
  try {
    const { invoke } = await import("@/lib/electron-api")
    return await invoke<FileEntry[]>("list_directory", { path: rootPath })
  } catch {
    console.warn("[filesystem] Tauri not available, falling back to web")
    return await loadWebFileTree()
  }
}

export async function readFile(filePath: string): Promise<string> {
  if (isElectron()) {
    return await eapi.workspaceReadFile(filePath)
  }
  try {
    const { readTextFile } = await import("@/lib/electron-api")
    return await readTextFile(filePath)
  } catch {
    return await readWebFile(filePath)
  }
}

export async function writeFile(
  filePath: string,
  content: string
): Promise<void> {
  if (isElectron()) {
    await eapi.workspaceWriteFile(filePath, content)
    return
  }
  try {
    const { writeTextFile } = await import("@/lib/electron-api")
    await writeTextFile(filePath, content)
  } catch {
    const segs = filePath.split(/[/\\]+/).filter(Boolean)
    const fileName = segs.pop()
    if (!fileName) throw new Error("Invalid path")
    const parentDir = await getWebDirHandle(segs.join("\\"))
    if (!parentDir) throw new Error("Parent directory not found")
    const handle = await parentDir.getFileHandle(fileName, { create: true })
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
  }
}

export async function createFile(
  absolutePath: string,
  content = ""
): Promise<void> {
  if (isElectron()) {
    const dirParts = absolutePath.replace(/\\/g, "/").split("/")
    const fileName = dirParts.pop()
    const dirPath = dirParts.join("\\")
    const result = await eapi.workspaceCreateFile(dirPath, fileName)
    if (!result) throw new Error(`Failed to create file: ${absolutePath}`)
    if (content) {
      await eapi.workspaceWriteFile(absolutePath, content)
    }
    return
  }
  try {
    const { writeTextFile } = await import("@/lib/electron-api")
    await writeTextFile(absolutePath, content)
  } catch (err: unknown) {
    if (await hasTauri()) {
      throw new Error(
        `Failed to create file: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
  const segs = absolutePath.split(/[/\\]+/).filter(Boolean)
  const fileName = segs.pop()
  if (!fileName) throw new Error("Invalid path")
  const parentDir = await getWebDirHandle(segs.join("\\"))
  if (!parentDir) throw new Error("Parent directory not found")
  const handle = await parentDir.getFileHandle(fileName, { create: true })
  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
}

export async function createFolder(absolutePath: string): Promise<void> {
  if (isElectron()) {
    const dirParts = absolutePath.replace(/\\/g, "/").split("/")
    const folderName = dirParts.pop()
    const parentPath = dirParts.join("\\")
    const result = await eapi.workspaceCreateDirectory(parentPath, folderName)
    if (!result) throw new Error(`Failed to create folder: ${absolutePath}`)
    return
  }
  try {
    const { mkdir } = await import("@/lib/electron-api")
    await mkdir(absolutePath)
  } catch (err: unknown) {
    if (await hasTauri()) {
      throw new Error(
        `Failed to create folder: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
  const segs = absolutePath.split(/[/\\]+/).filter(Boolean)
  const folderName = segs.pop()
  if (!folderName) throw new Error("Invalid path")
  const parentDir = await getWebDirHandle(segs.join("\\"))
  if (!parentDir) throw new Error("Parent directory not found")
  await parentDir.getDirectoryHandle(folderName, { create: true })
}

export async function deleteEntry(absolutePath: string): Promise<void> {
  if (isElectron()) {
    await eapi.workspaceDelete(absolutePath)
    return
  }
  try {
    const { remove } = await import("@/lib/electron-api")
    await remove(absolutePath, { recursive: true })
  } catch (err: unknown) {
    if (await hasTauri()) {
      throw new Error(
        `Failed to delete: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
  const segs = absolutePath.split(/[/\\]+/).filter(Boolean)
  const entryName = segs.pop()
  if (!entryName) throw new Error("Invalid path")
  const parentDir = await getWebDirHandle(segs.join("\\"))
  if (!parentDir) throw new Error("Parent directory not found")
  await parentDir.removeEntry(entryName, { recursive: true })
}

export async function renameEntry(
  oldPath: string,
  newPath: string
): Promise<void> {
  if (isElectron()) {
    await eapi.workspaceRename(oldPath, newPath)
    return
  }
  try {
    const { rename } = await import("@/lib/electron-api")
    await rename(oldPath, newPath)
  } catch (err: unknown) {
    if (await hasTauri()) {
      throw new Error(
        `Failed to rename: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
  const content = await readFile(oldPath)
  await createFile(newPath, content)
  await deleteEntry(oldPath)
}

export function getRelativePath(absPath: string, rootPath: string): string {
  const normalized = absPath.replace(/\\/g, "/")
  const root = rootPath.replace(/\\/g, "/").replace(/\/$/, "")
  if (normalized.startsWith(root + "/")) {
    return normalized.slice(root.length + 1)
  }
  return normalized.split("/").pop() || normalized
}

const treeCache = new WeakMap<FileEntry[], { paths: string[]; dirs: Set<string> }>()

function buildTreeCache(
  entries: FileEntry[],
  rootPath: string
): { paths: string[]; dirs: Set<string> } {
  const cached = treeCache.get(entries)
  if (cached) return cached

  const paths: string[] = []
  const dirs = new Set<string>()
  const root = rootPath.replace(/\\/g, "/").replace(/\/$/, "")
  function walk(list: FileEntry[]) {
    for (const e of list) {
      const rel = e.path.replace(/\\/g, "/")
      const p = rel.startsWith(root + "/")
        ? rel.slice(root.length + 1)
        : e.name
      const trail = `${p}${e.is_dir ? "/" : ""}`
      paths.push(trail)
      if (e.is_dir) {
        dirs.add(trail)
        if (e.children.length > 0) walk(e.children)
      }
    }
  }
  walk(entries)

  const result = { paths, dirs }
  treeCache.set(entries, result)
  return result
}

export function buildPathsFromTree(
  entries: FileEntry[],
  rootPath: string
): string[] {
  return buildTreeCache(entries, rootPath).paths
}

export function buildDirSetFromTree(
  entries: FileEntry[],
  rootPath: string
): Set<string> {
  return buildTreeCache(entries, rootPath).dirs
}

export function filterPaths(
  paths: string[],
  query: string,
  dirs: Set<string>
): string[] {
  const lower = query.toLowerCase()
  const matched = new Set<string>()
  for (const p of paths) {
    const name = p.split("/").pop() || p
    if (name.toLowerCase().includes(lower)) {
      matched.add(p)
      const parts = p.split("/")
      for (let i = 0; i < parts.length; i++) {
        const ancestor = parts.slice(0, i).join("/")
        if (ancestor) matched.add(ancestor)
      }
    }
  }
  return paths.filter((p) => matched.has(p))
}

export function fuzzyFilterPaths(
  paths: string[],
  query: string,
  dirs: Set<string>
): string[] {
  if (!query) return paths
  const lower = query.toLowerCase()
  const matched = new Set<string>()
  function fuzzyMatch(text: string, pattern: string): boolean {
    let pi = 0
    for (let ti = 0; ti < text.length && pi < pattern.length; ti++) {
      if (text[ti] === pattern[pi]) pi++
    }
    return pi === pattern.length
  }
  for (const p of paths) {
    const name = p.split("/").pop() || p
    if (fuzzyMatch(name.toLowerCase(), lower)) {
      matched.add(p)
      const parts = p.split("/")
      for (let i = 0; i < parts.length; i++) {
        const ancestor = parts.slice(0, i).join("/")
        if (ancestor) matched.add(ancestor)
      }
    }
  }
  return paths.filter((p) => matched.has(p))
}
