import { describe, it, expect, vi } from 'vitest'
import { createTestWorkspace, type TestWorkspace } from '../fixtures/create-test-workspace'
import { promises as fs } from 'fs'
import { join } from 'path'

export interface WorkspaceTestContext {
  workspace: TestWorkspace
}

export function withTestWorkspace() {
  let ctx: WorkspaceTestContext

  const setup = () => {
    ctx = { workspace: createTestWorkspace() }
  }

  const teardown = () => {
    ctx.workspace.cleanup()
  }

  const getContext = () => ctx

  return { setup, teardown, getContext }
}

// Assertion helpers for file operations
export async function assertFileExists(filePath: string): Promise<void> {
  try {
    await fs.access(filePath)
  } catch {
    throw new Error(`Expected file to exist: ${filePath}`)
  }
}

export async function assertFileNotExists(filePath: string): Promise<void> {
  try {
    await fs.access(filePath)
    throw new Error(`Expected file to not exist: ${filePath}`)
  } catch (err: any) {
    if (err.message?.startsWith('Expected file')) throw err
  }
}

export async function assertFileContent(filePath: string, expected: string): Promise<void> {
  const content = await fs.readFile(filePath, 'utf-8')
  expect(content).toBe(expected)
}

export async function assertFileContains(filePath: string, substr: string): Promise<void> {
  const content = await fs.readFile(filePath, 'utf-8')
  expect(content).toContain(substr)
}

// Performance budget helpers
export function assertUnderBudget(actualMs: number, budgetMs: number, label: string): void {
  expect(actualMs, `${label}: ${actualMs}ms exceeded budget of ${budgetMs}ms`).toBeLessThanOrEqual(budgetMs)
}

export function measureAsync<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const start = performance.now()
  return fn().then(result => ({ result, duration: Math.round(performance.now() - start) }))
}

// Session storage simulation for tests
export function createMockStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => store.clear(),
    get length() { return store.size },
    key: (index: number) => [...store.keys()][index] ?? null,
  }
}
