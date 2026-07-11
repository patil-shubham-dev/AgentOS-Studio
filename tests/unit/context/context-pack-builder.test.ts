import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ContextPackBuilder } from '@/runtime/context/ContextPackBuilder'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { useDiagnosticsStore } from '@/stores/diagnostics-store'

vi.mock('@/runtime/context/ContextManager', () => {
  const mockAssembleSystemPrompt = vi.fn().mockResolvedValue({
    systemPrompt: 'You are a senior engineer.',
    staticBlocks: [],
    dynamicBlocks: [],
    tokenEstimate: 50,
    contextWindowSize: 200_000,
    budgetRemaining: 199_950,
  })
  return {
    ContextManager: {
      getInstance: vi.fn(() => ({
        assembleSystemPrompt: mockAssembleSystemPrompt,
      })),
    },
  }
})

vi.mock('@/lib/git', () => ({
  gitDiff: vi.fn().mockResolvedValue(''),
}))

vi.mock('@/stores/context-pack-slot', () => ({
  useContextPackSlot: {
    getState: () => ({
      setCurrentPack: vi.fn(),
    }),
  },
}))

describe('ContextPackBuilder file reading', () => {
  let tmpDir: string
  let builder: ContextPackBuilder

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cpb-test-'))
    vi.clearAllMocks()
    useWorkspaceStore.setState({
      rootPath: tmpDir,
      openFiles: [],
    })
    useDiagnosticsStore.setState({ diagnostics: [] })
    builder = new ContextPackBuilder()
  })

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('reads real file content from disk for relevant files', async () => {
    const filePath = 'src/main.ts'
    const fullPath = join(tmpDir, filePath)
    mkdirSync(join(tmpDir, 'src'), { recursive: true })
    writeFileSync(fullPath, 'console.log("hello from disk");', 'utf-8')

    const pack = await builder.build({
      role: 'coder',
      userMessage: 'test',
      relevantFiles: [{ path: filePath, relevance: 0.9, reason: 'relevant file', score: 0.9 }],
    })

    const fileSource = pack.sources.find(s => s.path === filePath)
    expect(fileSource).toBeDefined()
    expect(fileSource!.content).toContain('hello from disk')
    expect(fileSource!.type).toBe('explicit_file')
  })

  it('reads the active file from disk', async () => {
    const filePath = 'src/active.ts'
    const fullPath = join(tmpDir, filePath)
    mkdirSync(join(tmpDir, 'src'), { recursive: true })
    writeFileSync(fullPath, 'export const active = true;', 'utf-8')

    const pack = await builder.build({
      role: 'coder',
      userMessage: 'test',
      activeFilePath: filePath,
    })

    const activeSource = pack.sources.find(s => s.path === filePath)
    expect(activeSource).toBeDefined()
    expect(activeSource!.content).toContain('export const active = true')
    expect(activeSource!.relevance).toBe(1.0)
  })

  it('skips files that do not exist on disk', async () => {
    const pack = await builder.build({
      role: 'coder',
      userMessage: 'test',
      relevantFiles: [{ path: 'nonexistent.ts', relevance: 0.5, reason: 'missing', score: 0.5 }],
    })

    const missingSource = pack.sources.find(s => s.path === 'nonexistent.ts')
    expect(missingSource).toBeUndefined()
  })

  it('reads files with absolute Windows paths', async () => {
    const absDir = mkdtempSync(join(tmpdir(), 'cpb-abs-'))
    const filePath = join(absDir, 'abs-file.ts')
    writeFileSync(filePath, '// absolute path file', 'utf-8')

    useWorkspaceStore.setState({ rootPath: absDir })

    const pack = await builder.build({
      role: 'coder',
      userMessage: 'test',
      relevantFiles: [{ path: 'abs-file.ts', relevance: 0.8, reason: 'abs test', score: 0.8 }],
    })

    const source = pack.sources.find(s => s.path === 'abs-file.ts')
    expect(source).toBeDefined()
    expect(source!.content).toContain('absolute path file')

    rmSync(absDir, { recursive: true, force: true })
  })

  it('uses dirty buffer content instead of disk when file is open and dirty', async () => {
    const filePath = 'src/dirty.ts'
    const fullPath = join(tmpDir, filePath)
    mkdirSync(join(tmpDir, 'src'), { recursive: true })
    writeFileSync(fullPath, 'disk content', 'utf-8')

    useWorkspaceStore.setState({
      openFiles: [{ path: filePath, name: 'dirty.ts', content: 'unsaved content', isDirty: true, language: 'typescript' }],
    })

    const pack = await builder.build({
      role: 'coder',
      userMessage: 'test',
      relevantFiles: [{ path: filePath, relevance: 0.9, reason: 'dirty file', score: 0.9 }],
    })

    const source = pack.sources.find(s => s.path === filePath)
    expect(source).toBeDefined()
    expect(source!.content).toContain('unsaved content')
    expect(source!.content).not.toContain('disk content')
    expect(source!.type).toBe('open_file')
  })

  it('handles multiple files with mixed relevance ordering', async () => {
    const files = ['low.ts', 'medium.ts', 'high.ts']
    const content = ['low content', 'medium content', 'high content']
    const relevances = [0.3, 0.6, 0.9]

    for (let i = 0; i < files.length; i++) {
      writeFileSync(join(tmpDir, files[i]), content[i], 'utf-8')
    }

    const pack = await builder.build({
      role: 'coder',
      userMessage: 'test',
      relevantFiles: files.map((f, i) => ({
        path: f,
        relevance: relevances[i],
        reason: `file ${f}`,
        score: relevances[i],
      })),
    })

    expect(pack.sources.filter(s => s.path).length).toBe(files.length)
    const sorted = pack.sources.filter(s => files.includes(s.path!))
    expect(sorted[0].relevance).toBeGreaterThanOrEqual(sorted[1].relevance)
    expect(sorted[1].relevance).toBeGreaterThanOrEqual(sorted[2].relevance)
  })

  it('includes diagnostics when present in store', async () => {
    useDiagnosticsStore.setState({
      diagnostics: [
        { filePath: 'src/error.ts', line: 1, column: 5, message: 'Type error', severity: 'error', code: 'TS2324' },
      ],
    })

    const pack = await builder.build({
      role: 'coder',
      userMessage: 'test',
    })

    const diagSource = pack.sources.find(s => s.type === 'diagnostics')
    expect(diagSource).toBeDefined()
    expect(diagSource!.content).toContain('Type error')
  })

  it('produces a valid ContextPack with correct shape', async () => {
    writeFileSync(join(tmpDir, 'shape.ts'), '// shape test', 'utf-8')

    const pack = await builder.build({
      role: 'coder',
      userMessage: 'test',
      relevantFiles: [{ path: 'shape.ts', relevance: 0.7, reason: 'shape test', score: 0.7 }],
    })

    expect(pack).toHaveProperty('sources')
    expect(pack).toHaveProperty('systemPrompt')
    expect(pack).toHaveProperty('totalTokens')
    expect(pack).toHaveProperty('tokenBudget')
    expect(pack).toHaveProperty('remainingTokens')
    expect(pack).toHaveProperty('createdAt')
    expect(Array.isArray(pack.sources)).toBe(true)
    expect(pack.tokenBudget).toBeGreaterThan(0)
    expect(pack.remainingTokens).toBeGreaterThanOrEqual(0)
    expect(pack.createdAt).toBeGreaterThan(0)
  })
})
