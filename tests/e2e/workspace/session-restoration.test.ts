import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestWorkspace } from '../fixtures/create-test-workspace'
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

describe('Session Restoration (TC-05 to TC-09)', () => {
  let workspace: ReturnType<typeof createTestWorkspace>
  let mockStorage: Storage

  beforeEach(async () => {
    workspace = createTestWorkspace()
    mockStorage = createMockStorage()
    vi.stubGlobal('localStorage', mockStorage)
    const { useWorkspaceStore } = await import('@/stores/workspace-store')
    useWorkspaceStore.setState({
      rootPath: null, fileTree: [], openFiles: [], activeFilePath: null,
      changedFiles: new Set(), isLoading: false, aiContextFiles: [],
      suggestedFiles: [], recentlyModified: [], splitMode: 'none' as const,
      splitFilePath: null, workspaceLoaded: false,
    })
  })

  afterEach(() => {
    workspace.cleanup()
    vi.unstubAllGlobals()
  })

  it('TC-05: persistWorkspaceState saves open files correctly', async () => {
    const { useWorkspaceStore } = await import('@/stores/workspace-store')
    const { loadFileTree } = await import('@/lib/filesystem')

    const store = useWorkspaceStore.getState()
    store.setRootPath(workspace.root)
    const tree = await loadFileTree(workspace.root)

    const firstFile = tree.find((e: any) => !e.is_dir)
    if (firstFile) {
      store.openFile({ path: firstFile.path, name: firstFile.name, content: '', isDirty: false })
    }
    store.persistWorkspaceState()

    const saved = JSON.parse(mockStorage.getItem('agentic-workspace-state') || '{}')
    expect(saved.openFiles).toBeDefined()
  })

  it('TC-06: persistWorkspaceState saves cursor position', async () => {
    const { useWorkspaceStore } = await import('@/stores/workspace-store')
    const store = useWorkspaceStore.getState()
    store.setRootPath(workspace.root)
    store.setCursorPosition(42, 15)
    store.persistWorkspaceState()

    const saved = JSON.parse(mockStorage.getItem('agentic-workspace-state') || '{}')
    expect(saved.cursorLine).toBe(42)
    expect(saved.cursorColumn).toBe(15)
  })

  it('TC-07: persistWorkspaceState saves visible range', async () => {
    const { useWorkspaceStore } = await import('@/stores/workspace-store')
    const store = useWorkspaceStore.getState()
    store.setRootPath(workspace.root)
    useWorkspaceStore.setState({ visibleRangeStart: 100, visibleRangeEnd: 150 })
    store.persistWorkspaceState()

    const saved = JSON.parse(mockStorage.getItem('agentic-workspace-state') || '{}')
    expect(saved.visibleRangeStart).toBe(100)
    expect(saved.visibleRangeEnd).toBe(150)
  })

  it('TC-08: restoreWorkspaceState restores previously persisted state', async () => {
    const { useWorkspaceStore } = await import('@/stores/workspace-store')
    const store = useWorkspaceStore.getState()

    store.setRootPath(workspace.root)
    mockStorage.setItem('agentic-workspace-root', workspace.root)

    store.openFile({ path: 'src/index.ts', name: 'index.ts', content: '', isDirty: false })
    store.setCursorPosition(10, 5)
    store.persistWorkspaceState()

    useWorkspaceStore.setState({ openFiles: [], activeFilePath: null, cursorLine: 1, cursorColumn: 1 })
    store.restoreWorkspaceState()

    const state = useWorkspaceStore.getState()
    expect(state.openFiles.length).toBeGreaterThan(0)
    expect(state.cursorLine).toBe(10)
    expect(state.cursorColumn).toBe(5)
  })

  it('TC-09: restores split editor state when persisted', async () => {
    const { useWorkspaceStore } = await import('@/stores/workspace-store')
    const store = useWorkspaceStore.getState()

    store.setRootPath(workspace.root)
    mockStorage.setItem('agentic-workspace-root', workspace.root)
    useWorkspaceStore.setState({ splitMode: 'vertical', splitFilePath: 'src/index.ts' })
    store.persistWorkspaceState()

    useWorkspaceStore.setState({ openFiles: [], activeFilePath: null, splitMode: 'none', splitFilePath: null })
    store.restoreWorkspaceState()

    const state = useWorkspaceStore.getState()
    expect(state.splitMode).toBe('vertical')
    expect(state.splitFilePath).toBe('src/index.ts')
  })
})
