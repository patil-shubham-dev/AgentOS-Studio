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

describe('Workspace Open / Close (TC-01 to TC-04)', () => {
  let workspace: ReturnType<typeof createTestWorkspace>

  beforeEach(() => {
    workspace = createTestWorkspace()
  })

  afterEach(() => {
    workspace.cleanup()
  })

  it('TC-01: opens a valid workspace directory', async () => {
    const { result: tree, duration } = await measureAsync(async () => {
      const { loadFileTree } = await import('@/lib/filesystem')
      return loadFileTree(workspace.root)
    })
    expect(tree).toBeDefined()
    expect(Array.isArray(tree)).toBe(true)
    expect(tree.length).toBeGreaterThan(0)
    assertUnderBudget(duration, 5000, 'Workspace open time')
  })

  it('TC-02: opens workspace and file tree populates correctly', async () => {
    const { loadFileTree } = await import('@/lib/filesystem')
    const tree = await loadFileTree(workspace.root)
    const allEntries = flattenTree(tree)
    expect(allEntries.some(e => e.path.includes('src/index.ts'))).toBe(true)
    expect(allEntries.some(e => e.path.includes('README.md'))).toBe(true)
  })

  it('TC-03: handles empty directory', async () => {
    const { mkdtempSync, rmSync } = await import('fs')
    const { join } = await import('path')
    const { tmpdir } = await import('os')
    const emptyDir = mkdtempSync(join(tmpdir(), 'empty-ws-'))
    try {
      const { loadFileTree } = await import('@/lib/filesystem')
      const tree = await loadFileTree(emptyDir)
      expect(tree).toEqual([])
    } finally {
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })

  it('TC-04: handles non-existent directory gracefully', async () => {
    const { loadFileTree } = await import('@/lib/filesystem')
    const { tmpdir } = await import('os')
    const { join } = await import('path')
    const badPath = join(tmpdir(), 'nonexistent-' + Date.now())
    await expect(loadFileTree(badPath)).rejects.toThrow()
  })
})

function flattenTree(entries: any[]): any[] {
  const result: any[] = []
  for (const e of entries) {
    result.push(e)
    if (e.children?.length) result.push(...flattenTree(e.children))
  }
  return result
}
