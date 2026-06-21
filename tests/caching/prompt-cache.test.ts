import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { PromptCacheManager } from '@/runtime/caching/PromptCacheManager'

describe('PromptCacheManager', () => {
  let cache: PromptCacheManager

  beforeEach(() => {
    // Reset singleton between tests by calling getInstance with a fixed short TTL
    // The singleton persists, but we can call reset() to clear stats
    cache = PromptCacheManager.getInstance()
    cache.reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Basic Cache Operations ──

  describe('basic cache operations', () => {
    it('stores and retrieves a cached prompt', () => {
      const key = cache.makeKey({
        model: 'gpt-4o',
        role: 'coder',
        systemPromptHash: 'abc',
        toolDefinitionsHash: 'def',
        projectConfigHash: 'ghi',
        memorySummaryHash: 'jkl',
      })
      cache.set(key, 'You are a helpful coding assistant.')
      const result = cache.get(key)
      expect(result).toBe('You are a helpful coding assistant.')
    })

    it('returns null for a cache miss', () => {
      const key = cache.makeKey({ model: 'unknown', role: 'coder' })
      const result = cache.get(key)
      expect(result).toBeNull()
    })

    it('returns null for expired entries (TTL)', () => {
      vi.useFakeTimers()
      const key = cache.makeKey({
        model: 'claude-sonnet-4',
        role: 'manager',
        systemPromptHash: 'xyz',
      })
      cache.set(key, 'You are a manager agent.')

      // Advance past the default 5-minute TTL
      vi.advanceTimersByTime(5 * 60 * 1000 + 1)

      const result = cache.get(key)
      expect(result).toBeNull()
      vi.useRealTimers()
    })

    it('increments hit count on successful retrieval', () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      cache.set(key, 'prompt')
      cache.get(key)
      cache.get(key)
      const stats = cache.getStats()
      expect(stats.hits).toBe(2)
    })

    it('increments miss count on failed retrieval', () => {
      const key = cache.makeKey({ model: 'nonexistent', role: 'coder' })
      cache.get(key)
      cache.get(key)
      const stats = cache.getStats()
      expect(stats.misses).toBe(2)
    })

    it('tracks estimated tokens saved', () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      const prompt = 'A'.repeat(400) // ~100 tokens
      cache.set(key, prompt)
      cache.get(key) // Should save ~100 tokens
      const stats = cache.getStats()
      expect(stats.totalTokensSaved).toBeGreaterThan(50)
      expect(stats.totalTokensSaved).toBeLessThan(150)
    })
  })

  // ── Cache Key Serialization ──

  describe('cache key serialization', () => {
    it('produces deterministic keys for identical inputs', () => {
      const key1 = cache.makeKey({
        model: 'gpt-4o',
        role: 'coder',
        systemPromptHash: 'abc123',
      })
      const key2 = cache.makeKey({
        model: 'gpt-4o',
        role: 'coder',
        systemPromptHash: 'abc123',
      })
      expect(cache.serializeKey(key1)).toBe(cache.serializeKey(key2))
    })

    it('produces different keys for different models', () => {
      const key1 = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      const key2 = cache.makeKey({ model: 'claude-sonnet-4', role: 'coder' })
      expect(cache.serializeKey(key1)).not.toBe(cache.serializeKey(key2))
    })

    it('produces different keys for different roles', () => {
      const key1 = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      const key2 = cache.makeKey({ model: 'gpt-4o', role: 'manager' })
      expect(cache.serializeKey(key1)).not.toBe(cache.serializeKey(key2))
    })

    it('produces different keys when hashes differ', () => {
      const key1 = cache.makeKey({ model: 'gpt-4o', role: 'coder', systemPromptHash: 'abc' })
      const key2 = cache.makeKey({ model: 'gpt-4o', role: 'coder', systemPromptHash: 'def' })
      expect(cache.serializeKey(key1)).not.toBe(cache.serializeKey(key2))
    })
  })

  // ── Hashing ──

  describe('hashing', () => {
    it('produces consistent hashes for identical input', () => {
      const hash1 = cache.hash('hello world')
      const hash2 = cache.hash('hello world')
      expect(hash1).toBe(hash2)
    })

    it('produces different hashes for different input', () => {
      const hash1 = cache.hash('hello world')
      const hash2 = cache.hash('hello world!')
      expect(hash1).not.toBe(hash2)
    })

    it('returns empty string for empty input', () => {
      expect(cache.hash('')).toBe('')
    })

    it('handles Unicode strings', () => {
      const hash = cache.hash('héllo wörld 🔥')
      expect(hash).toBeTruthy()
      expect(hash).not.toBe('')
    })

    it('produces consistent hashes for long strings', () => {
      const long = 'x'.repeat(10000)
      const hash1 = cache.hash(long)
      const hash2 = cache.hash(long)
      expect(hash1).toBe(hash2)
    })
  })

  // ── computeKey Convenience Method ──

  describe('computeKey', () => {
    it('creates a valid cache key from raw text inputs', () => {
      const key = cache.computeKey(
        'gpt-4o',
        'coder',
        'You are a coding assistant.',
        'tool definitions here',
        'project config here',
        'memory summary here',
      )
      expect(key.model).toBe('gpt-4o')
      expect(key.role).toBe('coder')
      expect(key.systemPromptHash).toBeTruthy()
      expect(key.toolDefinitionsHash).toBeTruthy()
      expect(key.projectConfigHash).toBeTruthy()
      expect(key.memorySummaryHash).toBeTruthy()
    })

    it('produces same key for same inputs', () => {
      const base = 'You are a helpful assistant.'
      const key1 = cache.computeKey('gpt-4o', 'coder', base)
      const key2 = cache.computeKey('gpt-4o', 'coder', base)
      expect(cache.serializeKey(key1)).toBe(cache.serializeKey(key2))
    })

    it('produces different keys when system prompt changes', () => {
      const key1 = cache.computeKey('gpt-4o', 'coder', 'Old prompt')
      const key2 = cache.computeKey('gpt-4o', 'coder', 'New prompt')
      expect(cache.serializeKey(key1)).not.toBe(cache.serializeKey(key2))
    })
  })

  // ── Cache Invalidation ──

  describe('invalidation', () => {
    it('clears all entries on invalidate("all")', () => {
      const k1 = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      const k2 = cache.makeKey({ model: 'claude-3', role: 'manager' })
      cache.set(k1, 'prompt1')
      cache.set(k2, 'prompt2')

      cache.invalidate('all')

      expect(cache.get(k1)).toBeNull()
      expect(cache.get(k2)).toBeNull()
      expect(cache.getStats().entries).toBe(0)
    })

    it('clears all entries on model change (invalidates everything)', () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      cache.set(key, 'prompt')
      cache.invalidate('model')
      expect(cache.get(key)).toBeNull()
    })

    it('clears all entries on tools change', () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      cache.set(key, 'prompt')
      cache.invalidate('tools')
      expect(cache.get(key)).toBeNull()
    })

    it('clears all entries on config change', () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      cache.set(key, 'prompt')
      cache.invalidate('config')
      expect(cache.get(key)).toBeNull()
    })

    it('clears all entries on memory change', () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      cache.set(key, 'prompt')
      cache.invalidate('memory')
      expect(cache.get(key)).toBeNull()
    })
  })

  // ── LRU Eviction ──

  describe('eviction', () => {
    it('evicts lowest-hit entries when cache is full', () => {
      // The cache has MAX_CACHE_ENTRIES = 100
      // Fill it with 100 entries and see that the 101st evicts one
      const keys: ReturnType<typeof cache.makeKey>[] = []
      for (let i = 0; i < 100; i++) {
        const key = cache.makeKey({
          model: `model-${i}`,
          role: 'coder',
          systemPromptHash: `hash-${i}`,
        })
        keys.push(key)
        cache.set(key, `prompt-${i}`)
      }

      // All 100 should be in cache
      expect(cache.getStats().entries).toBe(100)

      // Add one more — should evict the least recently used (all have 0 hits, so oldest)
      const overflowKey = cache.makeKey({ model: 'overflow', role: 'coder', systemPromptHash: 'overflow' })
      cache.set(overflowKey, 'overflow prompt')

      // Should still be at max 100
      expect(cache.getStats().entries).toBe(100)

      // The oldest entry (model-0) should have been evicted
      expect(cache.get(keys[0])).toBeNull()
    })

    it('keeps recently accessed entries after eviction', () => {
      const keys: ReturnType<typeof cache.makeKey>[] = []
      for (let i = 0; i < 101; i++) {
        const key = cache.makeKey({
          model: `model-${i}`,
          role: 'coder',
          systemPromptHash: `hash-${i}`,
        })
        keys.push(key)
        cache.set(key, `prompt-${i}`)
        // Access the first few entries multiple times to increase their hit count
        if (i < 5) {
          cache.get(key) // hit 1
          cache.get(key) // hit 2
        }
      }

      // The entries with 0 hits (indices 5+) should be evicted first
      // model-5 is the oldest with 0 hits, so it should be gone
      expect(cache.get(keys[5])).toBeNull()

      // Entries with 2 hits should still be present
      expect(cache.get(keys[0])).toBe('prompt-0')
    })

    it('does not evict entries below MAX_CACHE_ENTRIES', () => {
      for (let i = 0; i < 50; i++) {
        const key = cache.makeKey({
          model: `model-${i}`,
          role: 'coder',
          systemPromptHash: `hash-${i}`,
        })
        cache.set(key, `prompt-${i}`)
      }
      expect(cache.getStats().entries).toBe(50)
    })
  })

  // ── Token Limit Guard ──

  describe('token limit guard', () => {
    it('refuses to cache prompts exceeding MAX_ENTRY_TOKENS', () => {
      // MAX_ENTRY_TOKENS = 200_000, so a prompt of 1_000_000 chars (~250k tokens) should be rejected
      const hugePrompt = 'A'.repeat(1_000_000)
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      cache.set(key, hugePrompt)
      expect(cache.get(key)).toBeNull()
    })

    it('caches prompts within the token limit', () => {
      const reasonablePrompt = 'A'.repeat(400_000) // ~100k tokens, under 200k limit
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      cache.set(key, reasonablePrompt)
      expect(cache.get(key)).toBe(reasonablePrompt)
    })
  })

  // ── Stats Reporting ──

  describe('stats reporting', () => {
    it('reports correct hit rate', () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      cache.set(key, 'prompt')

      // 2 hits
      cache.get(key)
      cache.get(key)
      // 3 misses
      cache.get(cache.makeKey({ model: 'x', role: 'y' }))
      cache.get(cache.makeKey({ model: 'x', role: 'z' }))
      cache.get(cache.makeKey({ model: 'a', role: 'b' }))

      const stats = cache.getStats()
      // Hit rate should be 2/5 = 40%
      expect(stats.hitRate).toBe(40)
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(3)
    })

    it('reports memory estimate in bytes', () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      cache.set(key, 'Hello world') // 11 chars → ~22 bytes UTF-16

      const stats = cache.getStats()
      expect(stats.memoryEstimateBytes).toBeGreaterThan(0)
      expect(stats.entries).toBe(1)
    })

    it('reports 0 hit rate when no lookups have occurred', () => {
      const stats = cache.getStats()
      expect(stats.hitRate).toBe(0)
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
    })
  })

  // ── Reset ──

  describe('reset', () => {
    it('clears all entries and resets stats', () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      cache.set(key, 'prompt')
      cache.get(key) // hit

      cache.reset()

      // Check internal state (entries) before any new lookups
      const statsAfterReset = cache.getStats()
      expect(statsAfterReset.hits).toBe(0)
      expect(statsAfterReset.misses).toBe(0)
      expect(statsAfterReset.totalTokensSaved).toBe(0)
      expect(statsAfterReset.entries).toBe(0)

      // Confirm get() returns null (this adds a miss)
      expect(cache.get(key)).toBeNull()
      const statsAfterGet = cache.getStats()
      expect(statsAfterGet.misses).toBe(1)
    })
  })

  // ── makeKey Defaults ──

  describe('makeKey defaults', () => {
    it('fills missing fields with "unknown" or empty string', () => {
      const key = cache.makeKey({})
      expect(key.model).toBe('unknown')
      expect(key.role).toBe('unknown')
      expect(key.systemPromptHash).toBe('')
      expect(key.toolDefinitionsHash).toBe('')
    })

    it('allows partial key specification', () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      expect(key.model).toBe('gpt-4o')
      expect(key.role).toBe('coder')
      expect(key.systemPromptHash).toBe('')
    })
  })

  // ── Edge Cases ──

  describe('edge cases', () => {
    it('handles empty prompt text', () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      cache.set(key, '')
      const result = cache.get(key)
      expect(result).toBe('')
    })

    it('handles prompts with special characters', () => {
      const prompt = 'function hello() { return "world"; }'
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      cache.set(key, prompt)
      expect(cache.get(key)).toBe(prompt)
    })

    it('handles nullish key fields via makeKey defaults', () => {
      const key = cache.makeKey({ model: undefined as unknown as string, role: 'coder' })
      expect(key.model).toBe('unknown')
    })
  })

  // ── Singleton ──

  describe('singleton behavior', () => {
    it('getInstance always returns the same instance', () => {
      const instance1 = PromptCacheManager.getInstance()
      const instance2 = PromptCacheManager.getInstance()
      expect(instance1).toBe(instance2)
    })
  })
})
