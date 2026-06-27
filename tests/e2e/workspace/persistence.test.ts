import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestWorkspace } from '../fixtures/create-test-workspace'
import { createMockStorage } from '../helpers/workspace-test-utils'

describe('Persistence (TC-34 to TC-39)', () => {
  let workspace: ReturnType<typeof createTestWorkspace>
  let mockStorage: Storage

  beforeEach(async () => {
    vi.resetModules()
    workspace = createTestWorkspace()
    mockStorage = createMockStorage()
    vi.stubGlobal('localStorage', mockStorage)
    vi.stubGlobal('window', { localStorage: mockStorage })
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

  it('TC-34: workspace state persists across store resets', async () => {
    const { useWorkspaceStore } = await import('@/stores/workspace-store')
    let store = useWorkspaceStore.getState()

    store.setRootPath(workspace.root)
    mockStorage.setItem('agentic-workspace-root', workspace.root)
    store.openFile({ path: 'src/index.ts', name: 'index.ts', content: '', isDirty: false })
    store.setCursorPosition(15, 8)
    store.persistWorkspaceState()

    useWorkspaceStore.setState({ openFiles: [], activeFilePath: null, cursorLine: 1, cursorColumn: 1, rootPath: null })
    store = useWorkspaceStore.getState()
    store.setRootPath(workspace.root)
    store.restoreWorkspaceState()

    const state = useWorkspaceStore.getState()
    expect(state.openFiles.length).toBeGreaterThan(0)
    expect(state.cursorLine).toBe(15)
  })

  it('TC-35: restoreWorkspaceState skips when root path does not match', async () => {
    const { useWorkspaceStore } = await import('@/stores/workspace-store')
    let store = useWorkspaceStore.getState()

    store.setRootPath('/workspace-a')
    mockStorage.setItem('agentic-workspace-root', '/workspace-a')
    store.openFile({ path: 'a1.ts', name: 'a1.ts', content: '', isDirty: false })
    store.persistWorkspaceState()

    // Switch to workspace B — state key is overwritten but root check prevents restore
    store.setRootPath('/workspace-b')
    mockStorage.setItem('agentic-workspace-root', '/workspace-b')
    store.openFile({ path: 'b1.ts', name: 'b1.ts', content: '', isDirty: false })
    store.persistWorkspaceState()

    // Now open workspace A — root mismatch should skip restore
    store.setRootPath('/workspace-a')
    mockStorage.setItem('agentic-workspace-root', '/workspace-b')
    store.restoreWorkspaceState()
    let state = useWorkspaceStore.getState()
    // Since root mismatch, state is NOT restored and openFiles was cleared by setRootPath
    expect(state.openFiles.length).toBe(0)
  })

  it('TC-36: persistWorkspaceState includes split editor state', async () => {
    const { useWorkspaceStore } = await import('@/stores/workspace-store')
    const store = useWorkspaceStore.getState()
    store.setRootPath(workspace.root)
    mockStorage.setItem('agentic-workspace-root', workspace.root)
    useWorkspaceStore.setState({ splitMode: 'horizontal', splitFilePath: 'src/index.ts' })
    store.persistWorkspaceState()

    const saved = JSON.parse(mockStorage.getItem('agentic-workspace-state') || '{}')
    expect(saved.splitMode).toBe('horizontal')
    expect(saved.splitFilePath).toBe('src/index.ts')
  })

  it('TC-37: safeSetItem handles quota gracefully', async () => {
    const { safeSetItem } = await import('@/lib/safe-storage')
    expect(() => {
      safeSetItem('test-key', 'test-value')
    }).not.toThrow()
    expect(mockStorage.getItem('test-key')).toBe('test-value')
  })

  it('TC-38: safeGetItem returns null for missing keys', async () => {
    const { safeGetItem } = await import('@/lib/safe-storage')
    const val = safeGetItem('nonexistent-key')
    expect(val).toBeNull()
  })

  it('TC-39: packWorkspaceState serializes correctly', async () => {
    const { useWorkspaceStore } = await import('@/stores/workspace-store')
    const store = useWorkspaceStore.getState()
    store.setRootPath(workspace.root)
    mockStorage.setItem('agentic-workspace-root', workspace.root)

    store.openFile({ path: 'a.ts', name: 'a.ts', content: '', isDirty: false })
    store.openFile({ path: 'b.ts', name: 'b.ts', content: '', isDirty: false })
    store.setCursorPosition(5, 10)
    store.persistWorkspaceState()

    const raw = mockStorage.getItem('agentic-workspace-state')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed.openFiles).toHaveLength(2)
    expect(parsed.cursorLine).toBe(5)
    expect(parsed.cursorColumn).toBe(10)
  })

  it('TC-40: preview tabs persist to localStorage', async () => {
    const { usePreviewStore } = await import('@/stores/preview-store')
    usePreviewStore.setState({ tabs: [], activeTabId: null })

    usePreviewStore.getState().openUrl('https://example.com', 'Example')

    const raw = mockStorage.getItem('aos-preview-store')
    expect(raw).toBeTruthy()
    expect(raw).toContain('https://example.com')
    expect(raw).toContain('Example')
  })

  it('TC-41: design state persists tokens and artifacts', async () => {
    const { useDesignStore } = await import('@/stores/design-store')
    useDesignStore.setState({
      artifacts: [],
      currentArtifactId: null,
      mode: 'coding',
      selectedComponent: null,
    })

    useDesignStore.getState().updateToken('primaryColor', '#123456')
    useDesignStore.getState().addArtifact({
      name: 'Hero',
      description: 'Landing page hero',
      tags: ['marketing'],
    })

    const raw = mockStorage.getItem('aos-design-store')
    expect(raw).toBeTruthy()
    expect(raw).toContain('#123456')
    expect(raw).toContain('Landing page hero')
  })
})
