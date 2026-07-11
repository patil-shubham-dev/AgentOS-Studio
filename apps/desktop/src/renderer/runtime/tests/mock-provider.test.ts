import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateMockResponse, MockProviderRuntime } from '@/runtime/providers/MockProviderRuntime'
import type { ProviderRequest } from '@/runtime/providers/ProviderRuntime'

describe('MockProviderRuntime', () => {
  describe('generateMockResponse', () => {
    it('returns a greeting response for hello queries', () => {
      const resp = generateMockResponse('hello, can you help me?')
      expect(resp).toContain('coding assistant')
    })

    it('returns an explanation response for explain queries', () => {
      const resp = generateMockResponse('explain this code to me')
      expect(resp).toContain('explain')
    })

    it('returns a test response for test queries', () => {
      const resp = generateMockResponse('write a test for this')
      expect(resp).toContain('test')
    })

    it('returns a fix response for bug queries', () => {
      const resp = generateMockResponse('fix this bug')
      expect(resp).toContain('debug')
    })

    it('returns a search response for search queries', () => {
      const resp = generateMockResponse('search for this function')
      expect(resp).toContain('search')
    })

    it('returns a fallback response for unknown queries', () => {
      const resp = generateMockResponse('some random unknown query')
      expect(resp).toContain('mock provider')
    })
  })

  describe('MockProviderRuntime.chat', () => {
    it('returns a valid ProviderResponse', async () => {
      const mock = new MockProviderRuntime()
      const result = await mock.chat({
        messages: [{ role: 'user', content: 'hello' }],
      })
      expect(result).toHaveProperty('content')
      expect(result).toHaveProperty('model', 'mock-model')
      expect(result).toHaveProperty('tokensIn')
      expect(result).toHaveProperty('tokensOut')
      expect(result).toHaveProperty('duration')
      expect(result.content.length).toBeGreaterThan(0)
    })

    it('responds to the last user message', async () => {
      const mock = new MockProviderRuntime()
      const result = await mock.chat({
        messages: [
          { role: 'user', content: 'first message' },
          { role: 'assistant', content: 'ok' },
          { role: 'user', content: 'explain this function' },
        ],
      })
      expect(result.content).toContain('explain')
    })

    it('returns hasApiKey as true', () => {
      const mock = new MockProviderRuntime()
      expect(mock.hasApiKey()).toBe(true)
    })
  })

  describe('MockProviderRuntime.stream', () => {
    it('yields token chunks and a done event', async () => {
      const mock = new MockProviderRuntime()
      const chunks: any[] = []
      for await (const chunk of mock.stream({
        messages: [{ role: 'user', content: 'hello' }],
      })) {
        chunks.push(chunk)
      }
      const tokens = chunks.filter(c => c.type === 'token')
      const done = chunks.find(c => c.type === 'done')
      expect(tokens.length).toBeGreaterThan(0)
      expect(done).toBeDefined()
      expect(done!.fullText.length).toBeGreaterThan(0)
    })
  })
})
