import type { CacheStrategy } from '../registry/SectionDefinition'
import { CachePolicy } from './CachePolicy'

export class SectionCache {
  private cache: CachePolicy

  constructor() {
    this.cache = new CachePolicy()
  }

  get(id: string, strategy: CacheStrategy, ctx: Record<string, unknown>): string | null {
    const key = this.cache.getKey(id, strategy, JSON.stringify(ctx))
    return this.cache.get(key)
  }

  set(id: string, strategy: CacheStrategy, ctx: Record<string, unknown>, content: string): void {
    const key = this.cache.getKey(id, strategy, JSON.stringify(ctx))
    this.cache.set(key, content)
  }

  invalidate(sectionId?: string): void {
    if (sectionId) {
      this.cache.invalidate(sectionId)
    } else {
      this.cache.invalidateAll()
    }
  }

  invalidateAll(): void {
    this.cache.invalidateAll()
  }

  getStats(): { size: number; hits: number } {
    const stats = this.cache.getStats()
    return { size: stats.size, hits: stats.hits }
  }
}
