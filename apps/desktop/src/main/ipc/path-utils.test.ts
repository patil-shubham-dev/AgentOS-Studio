import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
  },
}))

const {
  addGitAllowedPath,
  assertGitRepoPath,
  assertPathAllowed,
  clearGitAllowedPaths,
  filterDeniedPaths,
  isPathAllowed,
  setAllowedWorkspacePath,
} = await import('./path-utils')

describe('path-utils workspace containment', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'agenticos-workspace-'))
    clearGitAllowedPaths()
    setAllowedWorkspacePath(null)
  })

  it('allows files inside the configured workspace', () => {
    const file = join(root, 'src', 'index.ts')
    mkdirSync(join(root, 'src'))
    writeFileSync(file, 'export {}')

    setAllowedWorkspacePath(root)

    expect(isPathAllowed(file)).toBe(true)
  })

  it('denies all paths when no workspace is set', () => {
    expect(isPathAllowed(join(root, 'file.ts'))).toBe(false)
    expect(isPathAllowed('C:\\')).toBe(false)
    expect(isPathAllowed('/etc/passwd')).toBe(false)
  })

  it('denies sibling prefix paths outside the configured workspace', () => {
    const sibling = `${root}-evil`
    mkdirSync(sibling)
    const file = join(sibling, 'index.ts')
    writeFileSync(file, 'export {}')

    setAllowedWorkspacePath(root)

    expect(isPathAllowed(file)).toBe(false)
  })

  it('allows path traversal with .. within workspace boundaries', () => {
    const nested = join(root, 'a', 'b', 'c')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(nested, 'target.ts'), 'export {}')

    setAllowedWorkspacePath(root)

    const traversal = join(root, 'a', 'x', '..', 'b', 'c', 'target.ts')
    expect(isPathAllowed(traversal)).toBe(true)
  })

  it('denies path traversal with .. that escapes workspace', () => {
    const sibling = join(tmpdir(), 'outside-file.txt')
    writeFileSync(sibling, 'pwned')

    setAllowedWorkspacePath(root)

    const escaped = join(root, 'subdir', '..', '..', 'outside-file.txt')
    expect(isPathAllowed(escaped)).toBe(false)
  })

  it('denies access to sensitive .env files inside workspace', () => {
    setAllowedWorkspacePath(root)
    writeFileSync(join(root, '.env'), 'SECRET=123')
    expect(isPathAllowed(join(root, '.env'))).toBe(false)
  })

  it('denies access to sensitive .ssh directory inside workspace', () => {
    setAllowedWorkspacePath(root)
    mkdirSync(join(root, '.ssh'))
    writeFileSync(join(root, '.ssh', 'id_ed25519'), 'private-key')
    expect(isPathAllowed(join(root, '.ssh', 'id_ed25519'))).toBe(false)
  })

  it('denies access to certificate files inside workspace', () => {
    setAllowedWorkspacePath(root)
    writeFileSync(join(root, 'server.key'), 'key-material')
    expect(isPathAllowed(join(root, 'server.key'))).toBe(false)
  })

  it('denies access to credential JSON inside workspace', () => {
    setAllowedWorkspacePath(root)
    writeFileSync(join(root, 'service-account.json'), '{}')
    expect(isPathAllowed(join(root, 'service-account.json'))).toBe(false)
  })

  it('denies access to database files inside workspace', () => {
    setAllowedWorkspacePath(root)
    writeFileSync(join(root, 'data.db'), '')
    expect(isPathAllowed(join(root, 'data.db'))).toBe(false)
  })

  it('denies access to token files inside workspace', () => {
    setAllowedWorkspacePath(root)
    writeFileSync(join(root, '.token'), 'abc123')
    expect(isPathAllowed(join(root, '.token'))).toBe(false)
  })

  it('assertPathAllowed throws masked ENOENT for denied paths', () => {
    setAllowedWorkspacePath(root)
    expect(() => assertPathAllowed(join(root, '.env'))).toThrow()
  })

  it('assertPathAllowed masked error has ENOENT code and -2 errno', () => {
    setAllowedWorkspacePath(root)
    try {
      assertPathAllowed(join(root, '.env'))
      expect(true).toBe(false) // should not reach here
    } catch (err: any) {
      expect(err.code).toBe('ENOENT')
      expect(err.errno).toBe(-2)
      expect(err.message).toContain('no such file or directory')
    }
  })

  it('filterDeniedPaths removes sensitive entries', () => {
    setAllowedWorkspacePath(root)
    const entries = [
      { name: 'src', path: join(root, 'src') },
      { name: '.env', path: join(root, '.env') },
      { name: 'package.json', path: join(root, 'package.json') },
    ]
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'package.json'), '{}')
    writeFileSync(join(root, '.env'), 'SECRET=1')
    const filtered = filterDeniedPaths(entries)
    expect(filtered).toHaveLength(2)
    expect(filtered.find(e => e.name === '.env')).toBeUndefined()
  })

  it('denies sibling prefix paths for git allowed repositories', () => {
    const sibling = `${root}-evil`
    mkdirSync(sibling)
    addGitAllowedPath(root)

    expect(() => assertGitRepoPath(sibling)).toThrow()
  })

  it('allows git repo paths that are within allowed directories', () => {
    addGitAllowedPath(root)
    expect(() => assertGitRepoPath(root)).not.toThrow()
    expect(() => assertGitRepoPath(join(root, 'subdir'))).not.toThrow()
  })

  it('isPathAllowed returns false when workspace path is set to null', () => {
    setAllowedWorkspacePath(null)
    expect(isPathAllowed(root)).toBe(false)
  })

  it('allows nonexistent paths within workspace (containment check, not existence)', () => {
    setAllowedWorkspacePath(root)
    expect(isPathAllowed(join(root, 'nonexistent', 'file.ts'))).toBe(true)
  })

  it('isPathAllowed returns false when workspace path itself does not exist', () => {
    setAllowedWorkspacePath(join(tmpdir(), 'nonexistent-workspace'))
    const realDir = mkdtempSync(join(tmpdir(), 'real-dir-'))
    const file = join(realDir, 'test.ts')
    writeFileSync(file, '')
    expect(isPathAllowed(file)).toBe(false)
  })
})
