interface SessionMemoryEntry {
  tag: string
  fact: string
  confidence: number
}

export class SessionMemoryCompact {
  private memoryStore: SessionMemoryEntry[] = []

  extract(messages: Array<{ role: string; content: unknown }>): string[] {
    const tags = new Set<string>()

    for (const msg of messages) {
      if (msg.role !== 'user' && msg.role !== 'assistant') continue
      const text = typeof msg.content === 'string' ? msg.content : ''
      if (!text) continue

      const extracted = this.extractTags(text)
      for (const tag of extracted) tags.add(tag)
    }

    return Array.from(tags)
  }

  private extractTags(text: string): string[] {
    const tags: string[] = []
    const lower = text.toLowerCase()

    const patterns: Array<{ tag: string; keywords: string[] }> = [
      { tag: 'typescript', keywords: ['typescript', 'tsconfig', '.ts'] },
      { tag: 'react', keywords: ['react', 'jsx', 'component', 'hook'] },
      { tag: 'testing', keywords: ['test', 'jest', 'vitest', 'spec'] },
      { tag: 'build', keywords: ['build', 'compile', 'bundle', 'webpack', 'vite'] },
      { tag: 'security', keywords: ['security', 'injection', 'permission', 'sandbox'] },
      { tag: 'performance', keywords: ['performance', 'optimize', 'bundle size', 'lazy'] },
      { tag: 'api', keywords: ['api', 'endpoint', 'route', 'rest'] },
      { tag: 'database', keywords: ['database', 'db', 'sql', 'query', 'schema'] },
      { tag: 'ui', keywords: ['ui', 'component', 'style', 'css', 'tailwind'] },
    ]

    for (const { tag, keywords } of patterns) {
      if (keywords.some(k => lower.includes(k))) {
        tags.push(tag)
      }
    }

    return tags
  }

  store(entry: SessionMemoryEntry): void {
    this.memoryStore.push(entry)
    if (this.memoryStore.length > 100) this.memoryStore.shift()
  }

  getMemory(): SessionMemoryEntry[] {
    return this.memoryStore
  }

  clear(): void {
    this.memoryStore = []
  }
}
