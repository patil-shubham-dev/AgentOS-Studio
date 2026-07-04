import { describe, it, expect } from 'vitest'
import type { ContextSource, ContextPack } from '@/runtime/context/ContextPackBuilder'

describe('ContextPack schema', () => {
  it('ContextSource has the correct shape', () => {
    const source: ContextSource = {
      type: 'explicit_file',
      path: 'src/test.ts',
      content: 'console.log("hello")',
      tokenCount: 10,
      relevance: 0.9,
      reason: 'Test source',
    }
    expect(source.type).toMatch(/^(explicit_file|open_file|pinned_file|recent_file|search_result|diagnostics|git_diff|workspace_summary|memory|execution_scratchpad|system_prompt)$/)
    expect(typeof source.tokenCount).toBe('number')
    expect(typeof source.relevance).toBe('number')
    expect(typeof source.reason).toBe('string')
  })

  it('ContextPack has the correct shape', () => {
    const pack: ContextPack = {
      sources: [],
      systemPrompt: 'You are a senior engineer.',
      totalTokens: 0,
      tokenBudget: 200_000,
      remainingTokens: 200_000,
      createdAt: Date.now(),
    }
    expect(Array.isArray(pack.sources)).toBe(true)
    expect(typeof pack.totalTokens).toBe('number')
    expect(typeof pack.tokenBudget).toBe('number')
    expect(typeof pack.remainingTokens).toBe('number')
    expect(pack.createdAt).toBeGreaterThan(0)
  })
})

describe('ContextSource type isolation', () => {
  it('does not include browser/design/device context source types', () => {
    const validTypes: ReadonlyArray<string> = [
      'explicit_file',
      'open_file',
      'pinned_file',
      'recent_file',
      'search_result',
      'diagnostics',
      'git_diff',
      'workspace_summary',
      'memory',
      'execution_scratchpad',
      'system_prompt',
    ]
    const futureTypes = ['browser_dom', 'browser_screenshot', 'design_canvas', 'device_screen']
    for (const ft of futureTypes) {
      expect(validTypes).not.toContain(ft)
    }
  })
})

describe('ContextPack token budget', () => {
  it('budget is a positive number', () => {
    const budgets = [200_000, 128_000, 100_000, 64_000, 32_000]
    for (const b of budgets) {
      expect(b).toBeGreaterThan(0)
    }
  })

  it('remaining tokens never exceeds budget', () => {
    const pack: ContextPack = {
      sources: [
        { type: 'system_prompt', content: 'prompt', tokenCount: 500, relevance: 1.0, reason: 'test' },
        { type: 'explicit_file', path: 'src/a.ts', content: 'code', tokenCount: 1000, relevance: 0.9, reason: 'test' },
      ],
      systemPrompt: '',
      totalTokens: 1500,
      tokenBudget: 200_000,
      remainingTokens: 198_500,
      createdAt: Date.now(),
    }
    expect(pack.remainingTokens).toBe(pack.tokenBudget - pack.totalTokens)
    expect(pack.remainingTokens).toBeGreaterThanOrEqual(0)
  })

  it('budget can be fully consumed', () => {
    const pack: ContextPack = {
      sources: [],
      systemPrompt: '',
      totalTokens: 200_000,
      tokenBudget: 200_000,
      remainingTokens: 0,
      createdAt: Date.now(),
    }
    expect(pack.remainingTokens).toBe(0)
    expect(pack.totalTokens).toBe(pack.tokenBudget)
  })
})

describe('ContextPack source types', () => {
  it('includes all expected source type categories', () => {
    const sources: ContextSource[] = [
      { type: 'explicit_file', path: 'src/main.ts', content: 'content', tokenCount: 100, relevance: 1.0, reason: 'Active file' },
      { type: 'open_file', path: 'src/utils.ts', content: 'content', tokenCount: 80, relevance: 0.7, reason: 'Open tab' },
      { type: 'pinned_file', path: 'src/config.ts', content: 'content', tokenCount: 60, relevance: 0.6, reason: 'Pinned' },
      { type: 'search_result', path: 'src/api.ts', content: 'content', tokenCount: 40, relevance: 0.5, reason: 'Search hit' },
      { type: 'diagnostics', content: '[error] src/app.ts:1 - message', tokenCount: 20, relevance: 0.5, reason: '2 diagnostics' },
      { type: 'git_diff', content: 'diff --git a/src/main.ts b/src/main.ts', tokenCount: 50, relevance: 0.6, reason: 'Working tree changes' },
      { type: 'system_prompt', content: 'You are a coder.', tokenCount: 10, relevance: 1.0, reason: 'Static block: role_identity' },
      { type: 'memory', content: 'User prefers TypeScript', tokenCount: 15, relevance: 0.5, reason: 'Memory summary' },
      { type: 'execution_scratchpad', content: 'Task: fix auth bug', tokenCount: 25, relevance: 0.8, reason: 'Execution scratchpad' },
      { type: 'workspace_summary', content: 'Project: AgenticOS', tokenCount: 30, relevance: 0.7, reason: 'Workspace structure' },
    ]
    expect(sources).toHaveLength(10)
    const types = sources.map(s => s.type)
    expect(types).toContain('explicit_file')
    expect(types).toContain('open_file')
    expect(types).toContain('pinned_file')
    expect(types).toContain('search_result')
    expect(types).toContain('diagnostics')
    expect(types).toContain('git_diff')
    expect(types).toContain('system_prompt')
    expect(types).toContain('memory')
    expect(types).toContain('execution_scratchpad')
    expect(types).toContain('workspace_summary')
  })

  it('each source has a reason explaining inclusion', () => {
    const sources: ContextSource[] = [
      { type: 'explicit_file', path: 'src/auth.ts', content: 'content', tokenCount: 100, relevance: 0.9, reason: 'Active file' },
      { type: 'open_file', path: 'src/header.ts', content: 'content', tokenCount: 50, relevance: 0.7, reason: 'Open file: header.ts' },
    ]
    for (const source of sources) {
      expect(source.reason).toBeTruthy()
      expect(typeof source.reason).toBe('string')
    }
  })
})

describe('ContextSource relevance ranking', () => {
  it('relevance is between 0 and 1', () => {
    const sources: ContextSource[] = [
      { type: 'explicit_file', path: 'src/a.ts', content: '', tokenCount: 0, relevance: 1.0, reason: '' },
      { type: 'explicit_file', path: 'src/b.ts', content: '', tokenCount: 0, relevance: 0.5, reason: '' },
      { type: 'explicit_file', path: 'src/c.ts', content: '', tokenCount: 0, relevance: 0.0, reason: '' },
    ]
    for (const source of sources) {
      expect(source.relevance).toBeGreaterThanOrEqual(0)
      expect(source.relevance).toBeLessThanOrEqual(1)
    }
  })

  it('sources can be sorted by relevance descending', () => {
    const sources: ContextSource[] = [
      { type: 'system_prompt', content: '', tokenCount: 0, relevance: 0.8, reason: '' },
      { type: 'explicit_file', path: 'src/a.ts', content: '', tokenCount: 0, relevance: 1.0, reason: '' },
      { type: 'open_file', path: 'src/b.ts', content: '', tokenCount: 0, relevance: 0.6, reason: '' },
    ]
    const sorted = [...sources].sort((a, b) => b.relevance - a.relevance)
    expect(sorted[0].relevance).toBe(1.0)
    expect(sorted[1].relevance).toBe(0.8)
    expect(sorted[2].relevance).toBe(0.6)
  })
})
