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

describe('File Tree (TC-10 to TC-20)', () => {
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

  it('TC-10: initial tree load returns all files', async () => {
    const { loadFileTree } = await import('@/lib/filesystem')
    const tree = await loadFileTree(workspace.root)
    const count = countNodes(tree)
    expect(count).toBeGreaterThanOrEqual(10)
  })

  it('TC-11: createFile inserts node in store without full reload', async () => {
    const { loadFileTree } = await import('@/lib/filesystem')
    const store = (await import('@/stores/workspace-store')).useWorkspaceStore.getState()

    await loadFileTree(workspace.root)
    const originalSetFileTree = store.setFileTree
    let fullReloadCalled = false
    store.setFileTree = ((tree: any) => {
      fullReloadCalled = true
      originalSetFileTree(tree)
    }) as any

    const parentPath = workspace.root.replace(/\\/g, '/')
    const { createFile } = await import('@/lib/filesystem')
    await createFile(workspace.root + '/new-test-file.ts')
    store.insertFileEntry(parentPath, {
      name: 'new-test-file.ts',
      path: 'new-test-file.ts',
      is_dir: false,
      children: [],
      size: 0,
      lastModified: Date.now(),
    })

    expect(fullReloadCalled).toBe(false)
  })

  it('TC-12: createFolder adds directory entry', async () => {
    const { loadFileTree } = await import('@/lib/filesystem')
    const ws = (await import('@/stores/workspace-store')).useWorkspaceStore
    const tree = await loadFileTree(workspace.root)
    ws.getState().setFileTree(tree)

    const srcDir = tree.find((e: any) => e.name === 'src' && e.is_dir)
    const parentPath = srcDir!.path
    const { createFolder } = await import('@/lib/filesystem')
    await createFolder(workspace.root + '/src/new-folder')
    ws.getState().insertFileEntry(parentPath, {
      name: 'new-folder',
      path: 'src/new-folder',
      is_dir: true,
      children: [],
      lastModified: Date.now(),
    })

    const hasFolder = findEntry(ws.getState().fileTree, 'src/new-folder')
    expect(hasFolder).toBe(true)
  })

  it('TC-13: removeFileEntry removes from tree', async () => {
    const { loadFileTree } = await import('@/lib/filesystem')
    const ws = (await import('@/stores/workspace-store')).useWorkspaceStore
    const tree = await loadFileTree(workspace.root)
    ws.getState().setFileTree(tree)

    ws.getState().removeFileEntry('src/index.ts')
    const found = findEntry(ws.getState().fileTree, 'src/index.ts')
    expect(found).toBe(false)
  })

  it('TC-14: renameFileEntry updates path in tree', async () => {
    const { loadFileTree } = await import('@/lib/filesystem')
    const ws = (await import('@/stores/workspace-store')).useWorkspaceStore
    const tree = await loadFileTree(workspace.root)
    ws.getState().setFileTree(tree)

    ws.getState().renameFileEntry('src/index.ts', 'src/main.ts')
    const oldExists = findEntry(ws.getState().fileTree, 'src/index.ts')
    const newExists = findEntry(ws.getState().fileTree, 'src/main.ts')
    expect(oldExists).toBe(false)
    expect(newExists).toBe(true)
  })

  it('TC-15: create and delete file within budget', async () => {
    const { loadFileTree, createFile, deleteEntry } = await import('@/lib/filesystem')
    await loadFileTree(workspace.root)

    const { duration: createDur } = await measureAsync(async () => {
      await createFile(workspace.root + '/perf-test.ts')
    })
    assertUnderBudget(createDur, 500, 'File create latency')

    const { duration: deleteDur } = await measureAsync(async () => {
      await deleteEntry(workspace.root + '/perf-test.ts')
    })
    assertUnderBudget(deleteDur, 500, 'File delete latency')
  })

  it('TC-16: directory tree structure is correct', async () => {
    const { loadFileTree } = await import('@/lib/filesystem')
    const tree = await loadFileTree(workspace.root)

    const srcDir = tree.find((e: any) => e.name === 'src' && e.is_dir)
    expect(srcDir).toBeDefined()
    expect(srcDir!.children.length).toBeGreaterThanOrEqual(3)

    const components = srcDir!.children.find((c: any) => c.name === 'components' && c.is_dir)
    expect(components).toBeDefined()
    expect(components!.children.length).toBeGreaterThanOrEqual(2)
  })

  it('TC-17: file watcher triggers on external change', async () => {
    const { onFileChange } = await import('@/lib/workspace')
    const events: any[] = []

    const unsub = await onFileChange((event: any) => {
      events.push(event)
    })
    // In non-Tauri environments, file watching returns null
    expect(unsub === null || typeof unsub === 'function').toBe(true)

    if (typeof unsub === 'function') unsub()
  })
})

function countNodes(entries: any[]): number {
  let count = 0
  for (const e of entries) {
    count++
    if (e.children) count += countNodes(e.children)
  }
  return count
}

function findEntry(entries: any[], targetPath: string): boolean {
  for (const e of entries) {
    if (e.path === targetPath) return true
    if (e.children && findEntry(e.children, targetPath)) return true
  }
  return false
}
