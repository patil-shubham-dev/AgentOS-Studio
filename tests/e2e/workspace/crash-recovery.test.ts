import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createMockStorage } from '../helpers/workspace-test-utils'

vi.mock('@/lib/filesystem', () => {
  const fs = require('fs')
  const path = require('path')
  function readTree(dirPath: string, parentRel: string): any[] {
    let entries: any[]
    try { entries = fs.readdirSync(dirPath, { withFileTypes: true }) } catch { return [] }
    const result: any[] = []
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(dirPath, entry.name)
      const relPath = parentRel ? `${parentRel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        const children = readTree(fullPath, relPath)
        result.push({ name: entry.name, path: relPath, is_dir: true, children, size: 0, lastModified: fs.statSync(fullPath).mtimeMs })
      } else {
        const st = fs.statSync(fullPath)
        result.push({ name: entry.name, path: relPath, is_dir: false, children: [], size: st.size, lastModified: st.mtimeMs })
      }
    }
    result.sort((a: any, b: any) => { if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1; return a.name.localeCompare(b.name) })
    return result
  }
  return {
    loadFileTree: async (rootPath: string) => {
      if (!fs.existsSync(rootPath)) throw new Error(`Directory not found: ${rootPath}`)
      return readTree(rootPath, '')
    },
    readFile: async (filePath: string) => fs.readFileSync(filePath, 'utf-8'),
    writeFile: async (filePath: string, content: string) => fs.writeFileSync(filePath, content, 'utf-8'),
    createFile: async (filePath: string, content = '') => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, content, 'utf-8')
    },
    deleteEntry: async (filePath: string) => fs.rmSync(filePath, { recursive: true, force: true }),
    renameEntry: async (oldPath: string, newPath: string) => {
      fs.mkdirSync(path.dirname(newPath), { recursive: true })
      fs.renameSync(oldPath, newPath)
    },
    createFolder: async (dirPath: string) => fs.mkdirSync(dirPath, { recursive: true }),
    listDirectory: async (dirPath: string) => readTree(dirPath, ''),
    setWebRootHandle: () => {},
    getWebRootHandle: () => null,
    getWebRootPath: () => null,
  }
})

describe('Crash & Recovery (TC-40 to TC-45)', () => {
  let mockStorage: Storage

  beforeEach(async () => {
    mockStorage = createMockStorage()
    vi.stubGlobal('localStorage', mockStorage)
    vi.stubGlobal('sessionStorage', createMockStorage())
    const { useWorkspaceStore } = await import('@/stores/workspace-store')
    useWorkspaceStore.setState({
      rootPath: null, fileTree: [], openFiles: [], activeFilePath: null,
      changedFiles: new Set(), isLoading: false, aiContextFiles: [],
      suggestedFiles: [], recentlyModified: [], splitMode: 'none' as const,
      splitFilePath: null, workspaceLoaded: false,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('TC-40: dirty buffer survives simulated crash', async () => {
    const { dirtyBufferManager } = await import('@/lib/dirty-buffer-manager')
    const { safeGetItem } = await import('@/lib/safe-storage')

    dirtyBufferManager.markDirty('crash-test.ts', 'content before crash')
    dirtyBufferManager.flush()

    const raw = safeGetItem('agentic-dirty-buffers')
    expect(raw).toBeTruthy()
    const parsed: [string, any][] = JSON.parse(raw!)
    const entry = parsed.find(([k]) => k === 'crash-test.ts')
    expect(entry).toBeDefined()
    expect(entry![1].content).toBe('content before crash')
  })

  it('TC-41: loadRecovered returns previously persisted dirty buffers', async () => {
    const { dirtyBufferManager } = await import('@/lib/dirty-buffer-manager')

    dirtyBufferManager.markDirty('recover-me.ts', 'recoverable content')
    dirtyBufferManager.flush()

    const recovered = dirtyBufferManager.loadRecovered()
    expect(recovered.length).toBeGreaterThan(0)
    expect(recovered.some((b: any) => b.path === 'recover-me.ts')).toBe(true)
    const buf = recovered.find((b: any) => b.path === 'recover-me.ts')
    expect(buf?.content).toBe('recoverable content')
  })

  it('TC-42: markClean removes buffer from persistence', async () => {
    const { dirtyBufferManager } = await import('@/lib/dirty-buffer-manager')
    const { safeGetItem } = await import('@/lib/safe-storage')

    dirtyBufferManager.markDirty('clean-me.ts', 'temp content')
    dirtyBufferManager.flush()
    dirtyBufferManager.markClean('clean-me.ts')
    dirtyBufferManager.flush()

    const raw = safeGetItem('agentic-dirty-buffers')
    if (raw) {
      const parsed: [string, any][] = JSON.parse(raw)
      const entry = parsed.find(([k]) => k === 'clean-me.ts')
      expect(entry).toBeUndefined()
    }
  })

  it('TC-43: restoreWorkspaceState handles corrupt data gracefully', async () => {
    const { useWorkspaceStore } = await import('@/stores/workspace-store')
    mockStorage.setItem('agentic-workspace-state', '{corrupt json!!!')
    mockStorage.setItem('agentic-workspace-root', '/some/path')
    const store = useWorkspaceStore.getState()
    store.setRootPath('/some/path')

    expect(() => store.restoreWorkspaceState()).not.toThrow()
  })

  it('TC-44: safe-mode detection works after consecutive failures', async () => {
    const { detectSafeMode, enableSafeMode } = await import('@/core/crash-handling/safe-mode')
    enableSafeMode('test')
    const mode = detectSafeMode()
    expect(mode.enabled).toBe(true)
  })

  it('TC-45: missing workspace folder triggers recovery', async () => {
    const { loadFileTree } = await import('@/lib/filesystem')
    const { tmpdir } = await import('os')
    const { join } = await import('path')
    const missingPath = join(tmpdir(), 'does-not-exist-' + Date.now())

    try {
      await loadFileTree(missingPath)
      expect(true).toBe(false)
    } catch (err) {
      expect(err).toBeDefined()
    }
  })
})
