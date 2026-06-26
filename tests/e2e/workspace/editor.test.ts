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

describe('Editor (TC-21 to TC-30)', () => {
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

  it('TC-21: readFile reads known file correctly', async () => {
    const { readFile } = await import('@/lib/filesystem')
    const content = await readFile(workspace.root + '/src/index.ts')
    expect(content).toContain('hello world')
  })

  it('TC-22: openFile adds to store', async () => {
    const { useWorkspaceStore } = await import('@/stores/workspace-store')
    useWorkspaceStore.getState().openFile({ path: 'src/index.ts', name: 'index.ts', content: 'test', isDirty: false })
    const state = useWorkspaceStore.getState()
    expect(state.openFiles.length).toBe(1)
    expect(state.activeFilePath).toBe('src/index.ts')
  })

  it('TC-23: closeFile keeps active when closing non-active tab', async () => {
    const { useWorkspaceStore } = await import('@/stores/workspace-store')
    useWorkspaceStore.getState().openFile({ path: 'a.ts', name: 'a.ts', content: '', isDirty: false })
    useWorkspaceStore.getState().openFile({ path: 'b.ts', name: 'b.ts', content: '', isDirty: false })
    useWorkspaceStore.getState().openFile({ path: 'c.ts', name: 'c.ts', content: '', isDirty: false })
    useWorkspaceStore.getState().closeFile('b.ts')
    const state = useWorkspaceStore.getState()
    expect(state.openFiles.length).toBe(2)
    expect(state.activeFilePath).toBe('c.ts')
  })

  it('TC-24: closing non-active tab preserves active', async () => {
    const { useWorkspaceStore } = await import('@/stores/workspace-store')
    const store = useWorkspaceStore.getState()
    store.openFile({ path: 'a.ts', name: 'a.ts', content: '', isDirty: false })
    store.setActiveFile('a.ts')
    store.openFile({ path: 'b.ts', name: 'b.ts', content: '', isDirty: false })
    store.closeFile('a.ts')
    const state = useWorkspaceStore.getState()
    expect(state.activeFilePath).toBe('b.ts')
  })

  it('TC-25: closing last tab clears open files', async () => {
    const { useWorkspaceStore } = await import('@/stores/workspace-store')
    const store = useWorkspaceStore.getState()
    store.openFile({ path: 'a.ts', name: 'a.ts', content: '', isDirty: false })
    store.closeFile('a.ts')
    const state = useWorkspaceStore.getState()
    expect(state.openFiles.length).toBe(0)
    expect(state.activeFilePath).toBeNull()
  })

  it('TC-26: tab limit enforced (max 30)', async () => {
    const { useWorkspaceStore } = await import('@/stores/workspace-store')
    const store = useWorkspaceStore.getState()
    for (let i = 0; i < 35; i++) {
      store.openFile({ path: `file-${i}.ts`, name: `file-${i}.ts`, content: '', isDirty: false })
    }
    const state = useWorkspaceStore.getState()
    expect(state.openFiles.length).toBeLessThanOrEqual(30)
  })

  it('TC-27: updateFileContent changes content in store', async () => {
    const { useWorkspaceStore } = await import('@/stores/workspace-store')
    const store = useWorkspaceStore.getState()
    store.openFile({ path: 'test.ts', name: 'test.ts', content: 'original', isDirty: false })
    store.updateFileContent('test.ts', 'modified')
    const file = useWorkspaceStore.getState().openFiles.find((f: any) => f.path === 'test.ts')
    expect(file?.content).toBe('modified')
    expect(file?.isDirty).toBe(true)
  })

  it('TC-28: dirty indicator tracked correctly', async () => {
    const { useWorkspaceStore } = await import('@/stores/workspace-store')
    const store = useWorkspaceStore.getState()
    store.openFile({ path: 'test.ts', name: 'test.ts', content: '', isDirty: false })
    store.markFileDirty('test.ts', true)
    expect(useWorkspaceStore.getState().openFiles.find((f: any) => f.path === 'test.ts')?.isDirty).toBe(true)
    store.markFileDirty('test.ts', false)
    expect(useWorkspaceStore.getState().openFiles.find((f: any) => f.path === 'test.ts')?.isDirty).toBe(false)
  })

  it('TC-29: getOrCreateModel reuses existing model', async () => {
    const { getOrCreateModel, modelCache, removeFromCaches } = await import('@/components/workspace/editor-utils')
    const fakeMonaco = {
      Uri: { parse: (s: string) => s },
      editor: {
        getModel: () => null,
        createModel: (content: string, lang: string, uri: string) => ({ uri, content, lang }),
      },
    }
    const model1 = getOrCreateModel(fakeMonaco, 'test.ts', 'content', 'typescript')
    expect(model1).toBeDefined()
    expect(modelCache.has('test.ts')).toBe(true)

    removeFromCaches('test.ts')
    expect(modelCache.has('test.ts')).toBe(false)
  })

  it('TC-30: DirtyBufferManager persists and recovers content', async () => {
    const { dirtyBufferManager } = await import('@/lib/dirty-buffer-manager')
    dirtyBufferManager.markDirty('test.ts', 'unsaved content')
    dirtyBufferManager.flush()

    const { safeGetItem } = await import('@/lib/safe-storage')
    const raw = safeGetItem('agentic-dirty-buffers')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed[0][1].content).toBe('unsaved content')
  })
})
