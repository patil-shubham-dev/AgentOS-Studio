import type { FileEntry, FileChangeEvent } from "@/types"

// ── Electron bridge ──
const eapi = (typeof window !== 'undefined' && (window as any).electronAPI) ? (window as any).electronAPI : null

function isElectron(): boolean {
  return !!eapi
}

// ── Web-mode root handle (File System Access API) ──
let _webRootHandle: FileSystemDirectoryHandle | null = null
let _webRootPath: string | null = null

export function sanitizeFilename(name: string): string {
  const invalidChars = /[<>:"/\\|?*]/g
  const trimmed = name.trim().replace(invalidChars, "_")
  if (!trimmed || trimmed === "." || trimmed === "..") return ""
  return trimmed
}

// ── Tauri helpers (legacy) ──

async function hasTauri(): Promise<boolean> {
  try {
    const { invoke } = await import("@tauri-apps/api/core")
    return typeof invoke === "function"
  } catch { return false }
}

// ── Web-mode helpers ──

async function requestWebDirectory(): Promise<{ handle: FileSystemDirectoryHandle; path: string } | null> {
  try {
    if (!("showDirectoryPicker" in window)) return null
    const win = window as Window & { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }
    const handle = await win.showDirectoryPicker()
    const path = handle.name
    _webRootHandle = handle
    _webRootPath = path
    return { handle, path }
  } catch { return null }
}

type DirHandle = FileSystemDirectoryHandle & { entries: () => AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]> }

async function* walkDirectory(dir: FileSystemDirectoryHandle, parentPath: string): AsyncGenerator<FileEntry> {
  for await (const [name, handle] of (dir as DirHandle).entries()) {
    const entryPath = parentPath ? `${parentPath}\\${name}` : name
    if (handle.kind === "directory") {
      const children: FileEntry[] = []
      for await (const child of walkDirectory(handle as FileSystemDirectoryHandle, entryPath)) {
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

async function resolveWebHandle(pathSegments: string[]): Promise<FileSystemDirectoryHandle | FileSystemFileHandle | null> {
  if (!_webRootHandle) return null
  let current: FileSystemDirectoryHandle | FileSystemFileHandle = _webRootHandle
  for (let i = 0; i < pathSegments.length; i++) {
    const seg = pathSegments[i]
    if (current.kind !== "directory") return null
    const dir = current as FileSystemDirectoryHandle
    if (i === pathSegments.length - 1) {
      try { return await dir.getFileHandle(seg) }
      catch { try { return await dir.getDirectoryHandle(seg) } catch { return null } }
    } else {
      try { current = await dir.getDirectoryHandle(seg) } catch { return null }
    }
  }
  return current
}

async function readWebFile(path: string): Promise<string> {
  const segs = path.split(/[/\\]+/).filter(Boolean)
  const fileHandle = await resolveWebHandle(segs)
  if (!fileHandle || fileHandle.kind !== "file") throw new Error(`File not found: ${path}`)
  const file = await (fileHandle as FileSystemFileHandle).getFile()
  return await file.text()
}

async function getWebDirHandle(path: string): Promise<FileSystemDirectoryHandle | null> {
  const segs = path.split(/[/\\]+/).filter(Boolean)
  if (segs.length === 0) return _webRootHandle
  let current = _webRootHandle
  if (!current) return null
  for (const seg of segs) {
    try { current = await current.getDirectoryHandle(seg) } catch { return null }
  }
  return current
}

// ── Public API ──

export async function pickWorkspaceFolder(): Promise<string | null> {
  // Electron first
  if (isElectron()) {
    return await eapi.workspaceOpenFolder()
  }
  // Tauri second
  try {
    const { open } = await import("@tauri-apps/plugin-dialog")
    const selected = await open({ directory: true, multiple: false, title: "Select Workspace Folder" })
    if (selected) {
      _webRootHandle = null
      _webRootPath = null
      return selected as string
    }
    return null
  } catch {
    const result = await requestWebDirectory()
    return result?.path ?? null
  }
}

export async function loadFileTree(rootPath: string): Promise<FileEntry[]> {
  // Electron first
  if (isElectron()) {
    return await eapi.workspaceGetTree(rootPath)
  }
  // Tauri second
  try {
    const { invoke } = await import("@tauri-apps/api/core")
    return await invoke<FileEntry[]>("list_directory", { path: rootPath })
  } catch {
    return await loadWebFileTree()
  }
}

export async function readFile(filePath: string): Promise<string> {
  if (isElectron()) {
    return await eapi.workspaceReadFile(filePath)
  }
  try {
    const { readTextFile } = await import("@tauri-apps/plugin-fs")
    return await readTextFile(filePath)
  } catch {
    return await readWebFile(filePath)
  }
}

export async function createFile(absolutePath: string, content = ""): Promise<void> {
  if (isElectron()) {
    const dirParts = absolutePath.replace(/\\/g, '/').split('/')
    const fileName = dirParts.pop()
    const dirPath = dirParts.join('\\')
    const result = await eapi.workspaceCreateFile(dirPath, fileName)
    if (!result) throw new Error(`Failed to create file: ${absolutePath}`)
    if (content) {
      await eapi.workspaceWriteFile(absolutePath, content)
    }
    return
  }
  try {
    const { writeTextFile } = await import("@tauri-apps/plugin-fs")
    await writeTextFile(absolutePath, content)
    return
  } catch (err: unknown) {
    if (await hasTauri()) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to create file: ${msg}`)
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
    const dirParts = absolutePath.replace(/\\/g, '/').split('/')
    const folderName = dirParts.pop()
    const parentPath = dirParts.join('\\')
    const result = await eapi.workspaceCreateDirectory(parentPath, folderName)
    if (!result) throw new Error(`Failed to create folder: ${absolutePath}`)
    return
  }
  try {
    const { mkdir } = await import("@tauri-apps/plugin-fs")
    await mkdir(absolutePath)
    return
  } catch (err: unknown) {
    if (await hasTauri()) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to create folder: ${msg}`)
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
    const { remove } = await import("@tauri-apps/plugin-fs")
    await remove(absolutePath, { recursive: true })
    return
  } catch (err: unknown) {
    if (await hasTauri()) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to delete entry: ${msg}`)
    }
  }
  const segs = absolutePath.split(/[/\\]+/).filter(Boolean)
  const entryName = segs.pop()
  if (!entryName) throw new Error("Invalid path")
  const parentDir = await getWebDirHandle(segs.join("\\"))
  if (!parentDir) throw new Error("Parent directory not found")
  await parentDir.removeEntry(entryName, { recursive: true })
}

export async function renameEntry(oldPath: string, newPath: string): Promise<void> {
  if (isElectron()) {
    await eapi.workspaceRename(oldPath, newPath)
    return
  }
  try {
    const { rename } = await import("@tauri-apps/plugin-fs")
    await rename(oldPath, newPath)
    return
  } catch (err: unknown) {
    if (await hasTauri()) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to rename: ${msg}`)
    }
  }
  const content = await readFile(oldPath)
  await createFile(newPath, content)
  await deleteEntry(oldPath)
}

export async function startWatching(rootPath: string): Promise<void> {
  if (isElectron()) {
    await eapi.workspaceStartWatcher(rootPath)
    return
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("watch_directory", { path: rootPath })
  } catch { /* web mode: watching not supported */ }
}

export async function onFileChange(callback: (event: FileChangeEvent) => void): Promise<(() => void) | null> {
  // In Electron, file changes are received via the preload 'on' channel
  if (isElectron()) {
    const unsub = eapi.on('file-changed', (payload: any) => {
      callback({ path: payload.path ?? payload, type: payload.type ?? 'modified' })
    })
    return unsub
  }
  try {
    const { listen } = await import("@tauri-apps/api/event")
    const unlisten = await listen<FileChangeEvent>("file-changed", (event) => {
      callback(event.payload)
    })
    return unlisten
  } catch { return null }
}

// ── Recent workspaces ──
export async function getRecentWorkspaces(): Promise<Array<{ path: string; name: string; lastOpened: number; pinned: boolean }>> {
  if (isElectron()) {
    return await eapi.workspaceGetRecent()
  }
  try { return JSON.parse(localStorage.getItem('recent-workspaces') || '[]') }
  catch { return [] }
}

export async function addRecentWorkspace(folderPath: string): Promise<void> {
  if (isElectron()) {
    await eapi.workspaceAddRecent(folderPath)
    return
  }
  try {
    const recent = JSON.parse(localStorage.getItem('recent-workspaces') || '[]')
    recent.unshift({ path: folderPath, name: folderPath.split(/[/\\]+/).pop(), lastOpened: Date.now(), pinned: false })
    localStorage.setItem('recent-workspaces', JSON.stringify(recent.slice(0, 20)))
  } catch {}
}

// ── Web-only: get root handle for tree population ──
export function getWebRootHandle(): FileSystemDirectoryHandle | null {
  return _webRootHandle
}

export function getWebRootPath(): string | null {
  return _webRootPath
}
