import type { FileChangeEvent } from "@/types"

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

// ── Public API ──

export async function pickWorkspaceFolder(): Promise<string | null> {
  // Electron first
  if (isElectron()) {
    return await eapi.workspaceOpenFolder()
  }
  // Tauri second
  try {
    const { dialogOpen } = await import("@/lib/electron-api")
    const selected = await dialogOpen({ directory: true, multiple: false, title: "Select Workspace Folder" })
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

export async function startWatching(rootPath: string): Promise<void> {
  if (isElectron()) {
    await eapi.workspaceStartWatcher(rootPath)
    return
  }
  try {
    const { invoke } = await import("@/lib/electron-api")
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
    const { listen } = await import("@/lib/electron-api")
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
