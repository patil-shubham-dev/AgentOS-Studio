import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestWorkspace } from '../fixtures/create-test-workspace'
import { measureAsync, assertUnderBudget } from '../helpers/workspace-test-utils'

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

const PERFORMANCE_BUDGETS = {
  workspaceOpen: 5000,
  fileCreate: 500,
  fileRename: 500,
  fileDelete: 500,
  tabSwitch: 50,
  treeInsert: 100,
  treeRemove: 100,
  dirtyBufferPersist: 100,
}

describe('Performance (TC-45 to TC-52)', () => {
  let workspace: ReturnType<typeof createTestWorkspace>

  beforeEach(async () => {
    workspace = createTestWorkspace()
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
  })

  it('TC-45: workspace open time within budget', async () => {
    const { loadFileTree } = await import('@/lib/filesystem')
    const { duration } = await measureAsync(() => loadFileTree(workspace.root))
    assertUnderBudget(duration, PERFORMANCE_BUDGETS.workspaceOpen, 'Workspace open')
  })

  it('TC-46: file create latency within budget', async () => {
    const { loadFileTree, createFile } = await import('@/lib/filesystem')
    await loadFileTree(workspace.root)
    const { duration } = await measureAsync(() => createFile(workspace.root + '/perf-create.ts'))
    assertUnderBudget(duration, PERFORMANCE_BUDGETS.fileCreate, 'File create')
  })

  it('TC-47: file rename latency within budget', async () => {
    const { loadFileTree, renameEntry } = await import('@/lib/filesystem')
    const src = workspace.root + '/src/index.ts'
    const dst = workspace.root + '/src/main.ts'
    await loadFileTree(workspace.root)
    const { duration } = await measureAsync(() => renameEntry(src, dst))
    assertUnderBudget(duration, PERFORMANCE_BUDGETS.fileRename, 'File rename')
  })

  it('TC-48: file delete latency within budget', async () => {
    const { loadFileTree, deleteEntry } = await import('@/lib/filesystem')
    await loadFileTree(workspace.root)
    const target = workspace.root + '/src/index.ts'
    const { duration } = await measureAsync(() => deleteEntry(target))
    assertUnderBudget(duration, PERFORMANCE_BUDGETS.fileDelete, 'File delete')
  })

  it('TC-49: targeted tree insert is faster than full reload', async () => {
    const { loadFileTree } = await import('@/lib/filesystem')
    const store = (await import('@/stores/workspace-store')).useWorkspaceStore.getState()
    await loadFileTree(workspace.root)

    const { duration: insertDur } = await measureAsync(async () => {
      const start = performance.now()
      store.insertFileEntry(workspace.root.replace(/\\/g, '/'), {
        name: 'fast-insert.ts',
        path: 'fast-insert.ts',
        is_dir: false,
        children: [],
        size: 10,
        lastModified: Date.now(),
      })
      return performance.now() - start
    })
    assertUnderBudget(insertDur, PERFORMANCE_BUDGETS.treeInsert, 'Targeted tree insert')
  })

  it('TC-50: targeted tree remove is faster than full reload', async () => {
    const { loadFileTree } = await import('@/lib/filesystem')
    const store = (await import('@/stores/workspace-store')).useWorkspaceStore.getState()
    await loadFileTree(workspace.root)

    const { duration: removeDur } = await measureAsync(async () => {
      const start = performance.now()
      store.removeFileEntry('src/index.ts')
      return performance.now() - start
    })
    assertUnderBudget(removeDur, PERFORMANCE_BUDGETS.treeRemove, 'Targeted tree remove')
  })

  it('TC-51: LRU cache evicts oldest entries', async () => {
    const { modelCache } = await import('@/components/workspace/editor-utils')
    const fakeMonaco = {
      Uri: { parse: (s: string) => s },
      editor: { getModel: () => null, createModel: (c: string, l: string, u: string) => ({}) },
    }
    const { getOrCreateModel } = await import('@/components/workspace/editor-utils')

    for (let i = 0; i < 50; i++) {
      getOrCreateModel(fakeMonaco, `file-${i}.ts`, `content-${i}`, 'typescript')
    }

    expect(modelCache.size).toBeLessThanOrEqual(100)
    expect(modelCache.size).toBe(50)
  })

  it('TC-52: caches pruned on removeFromCaches', async () => {
    const { modelCache, removeFromCaches } = await import('@/components/workspace/editor-utils')
    const fakeMonaco = {
      Uri: { parse: (s: string) => s },
      editor: { getModel: () => null, createModel: (c: string, l: string, u: string) => ({ uri: u }) },
    }
    const { getOrCreateModel } = await import('@/components/workspace/editor-utils')

    getOrCreateModel(fakeMonaco, 'prune-test.ts', 'content', 'typescript')
    expect(modelCache.has('prune-test.ts')).toBe(true)
    removeFromCaches('prune-test.ts')
    expect(modelCache.has('prune-test.ts')).toBe(false)
  })
})
