import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { PromptCacheManager } from '@/runtime/caching/PromptCacheManager'

describe('PromptCacheManager', () => {
  let cache: PromptCacheManager

  beforeEach(async () => {
    cache = PromptCacheManager.getInstance()
    await cache.reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('basic cache operations', () => {
    it('stores and retrieves a cached prompt', async () => {
      const key = cache.makeKey({
        model: 'gpt-4o',
        role: 'coder',
        systemPromptHash: 'abc',
        toolDefinitionsHash: 'def',
        projectConfigHash: 'ghi',
        memorySummaryHash: 'jkl',
      })
      await cache.set(key, 'You are a helpful coding assistant.')
      const result = await cache.get(key)
      expect(result).toBe('You are a helpful coding assistant.')
    })

    it('returns null for a cache miss', async () => {
      const key = cache.makeKey({ model: 'unknown', role: 'coder' })
      const result = await cache.get(key)
      expect(result).toBeNull()
    })

    it('returns null for expired entries (TTL)', async () => {
      vi.useFakeTimers()
      const key = cache.makeKey({
        model: 'claude-sonnet-4',
        role: 'manager',
        systemPromptHash: 'xyz',
      })
      await cache.set(key, 'You are a manager agent.')

      // Default TTL is 24 hours (l2DefaultTTL in DEFAULT_CACHE_POLICY)
      vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1)

      const result = await cache.get(key)
      expect(result).toBeNull()
      vi.useRealTimers()
    })

    it('increments hit count on successful retrieval', async () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      await cache.set(key, 'prompt')
      await cache.get(key)
      await cache.get(key)
      const stats = cache.getStats()
      expect(stats.hits).toBe(2)
    })

    it('increments miss count on failed retrieval', async () => {
      const key = cache.makeKey({ model: 'nonexistent', role: 'coder' })
      await cache.get(key)
      await cache.get(key)
      const stats = cache.getStats()
      expect(stats.misses).toBe(2)
    })

    it('tracks estimated tokens saved', async () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      const prompt = 'A'.repeat(400)
      await cache.set(key, prompt)
      await cache.get(key)
      const stats = cache.getStats()
      expect(stats.totalTokensSaved).toBeGreaterThan(50)
      expect(stats.totalTokensSaved).toBeLessThan(150)
    })
  })

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

  describe('invalidation', () => {
    it('clears all entries on invalidate("all")', async () => {
      const k1 = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      const k2 = cache.makeKey({ model: 'claude-3', role: 'manager' })
      await cache.set(k1, 'prompt1')
      await cache.set(k2, 'prompt2')

      await cache.invalidate('all')

      expect(await cache.get(k1)).toBeNull()
      expect(await cache.get(k2)).toBeNull()
      expect(cache.getStats().entries).toBe(0)
    })

    it('clears all entries on model change (invalidates everything)', async () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      await cache.set(key, 'prompt')
      await cache.invalidate('model')
      expect(await cache.get(key)).toBeNull()
    })

    it('clears all entries on tools change', async () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      await cache.set(key, 'prompt')
      await cache.invalidate('tools')
      expect(await cache.get(key)).toBeNull()
    })

    it('clears all entries on config change', async () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      await cache.set(key, 'prompt')
      await cache.invalidate('config')
      expect(await cache.get(key)).toBeNull()
    })

    it('clears all entries on memory change', async () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      await cache.set(key, 'prompt')
      await cache.invalidate('memory')
      expect(await cache.get(key)).toBeNull()
    })
  })

  describe('eviction', () => {
    it('evicts entries when cache exceeds max entries', async () => {
      const keys: ReturnType<typeof cache.makeKey>[] = []
      for (let i = 0; i < 500; i++) {
        const key = cache.makeKey({
          model: `model-${i}`,
          role: 'coder',
          systemPromptHash: `hash-${i}`,
        })
        keys.push(key)
        await cache.set(key, `prompt-${i}`)
      }

      // After 500 inserts, cache should be at capacity
      expect(cache.getStats().entries).toBe(500)

      // Adding one more triggers eviction
      const overflowKey = cache.makeKey({ model: 'overflow', role: 'coder', systemPromptHash: 'overflow' })
      await cache.set(overflowKey, 'overflow prompt')

      // Entries should be ≤ 500 after eviction
      expect(cache.getStats().entries).toBeLessThanOrEqual(500)
    })

    it('keeps recently accessed entries after eviction', async () => {
      const keys: ReturnType<typeof cache.makeKey>[] = []
      // Fill to near capacity (490 entries)
      for (let i = 0; i < 490; i++) {
        const key = cache.makeKey({
          model: `model-${i}`,
          role: 'coder',
          systemPromptHash: `hash-${i}`,
        })
        keys.push(key)
        await cache.set(key, `prompt-${i}`)
      }

      // Access the first few entries to make them recently used
      for (let i = 0; i < 20; i++) {
        await cache.get(keys[i])
      }

      // Fill remaining capacity and overflow to trigger eviction
      for (let i = 490; i < 510; i++) {
        const key = cache.makeKey({
          model: `model-${i}`,
          role: 'coder',
          systemPromptHash: `hash-${i}`,
        })
        keys.push(key)
        await cache.set(key, `prompt-${i}`)
      }

      const stats = cache.getStats()
      expect(stats.entries).toBeLessThanOrEqual(500)

      // Recently accessed entries should survive
      expect(await cache.get(keys[0])).toBe('prompt-0')
      expect(await cache.get(keys[19])).toBe('prompt-19')
    })

    it('does not evict entries below MAX_CACHE_ENTRIES', async () => {
      for (let i = 0; i < 50; i++) {
        const key = cache.makeKey({
          model: `model-${i}`,
          role: 'coder',
          systemPromptHash: `hash-${i}`,
        })
        await cache.set(key, `prompt-${i}`)
      }
      expect(cache.getStats().entries).toBe(50)
    })
  })

  describe('token limit guard', () => {
    it('refuses to cache prompts exceeding MAX_ENTRY_TOKENS', async () => {
      const hugePrompt = 'A'.repeat(1_000_000)
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      await cache.set(key, hugePrompt)
      expect(await cache.get(key)).toBeNull()
    })

    it('caches prompts within the token limit', async () => {
      const reasonablePrompt = 'A'.repeat(400_000)
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      await cache.set(key, reasonablePrompt)
      expect(await cache.get(key)).toBe(reasonablePrompt)
    })
  })

  describe('stats reporting', () => {
    it('reports correct hit rate', async () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      await cache.set(key, 'prompt')

      await cache.get(key)
      await cache.get(key)
      await cache.get(cache.makeKey({ model: 'x', role: 'y' }))
      await cache.get(cache.makeKey({ model: 'x', role: 'z' }))
      await cache.get(cache.makeKey({ model: 'a', role: 'b' }))

      const stats = cache.getStats()
      expect(stats.hitRate).toBe(40)
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(3)
    })

    it('reports memory estimate in bytes', async () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      await cache.set(key, 'Hello world')

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

  describe('reset', () => {
    it('clears all entries and resets stats', async () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      await cache.set(key, 'prompt')
      await cache.get(key)

      await cache.reset()

      const statsAfterReset = cache.getStats()
      expect(statsAfterReset.hits).toBe(0)
      expect(statsAfterReset.misses).toBe(0)
      expect(statsAfterReset.totalTokensSaved).toBe(0)
      expect(statsAfterReset.entries).toBe(0)

      expect(await cache.get(key)).toBeNull()
      const statsAfterGet = cache.getStats()
      expect(statsAfterGet.misses).toBe(1)
    })
  })

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

  describe('edge cases', () => {
    it('handles empty prompt text', async () => {
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      await cache.set(key, '')
      const result = await cache.get(key)
      expect(result).toBe('')
    })

    it('handles prompts with special characters', async () => {
      const prompt = 'function hello() { return "world"; }'
      const key = cache.makeKey({ model: 'gpt-4o', role: 'coder' })
      await cache.set(key, prompt)
      expect(await cache.get(key)).toBe(prompt)
    })

    it('handles nullish key fields via makeKey defaults', () => {
      const key = cache.makeKey({ model: undefined as unknown as string, role: 'coder' })
      expect(key.model).toBe('unknown')
    })
  })

  describe('singleton behavior', () => {
    it('getInstance always returns the same instance', () => {
      const instance1 = PromptCacheManager.getInstance()
      const instance2 = PromptCacheManager.getInstance()
      expect(instance1).toBe(instance2)
    })
  })
})
