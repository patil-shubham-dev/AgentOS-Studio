import type { ResolvedSection } from '../registry/SectionDefinition'

export type DedupMatch = {
  sourceId: string
  targetId: string
  reason: string
}

export class SectionDeduplicator {
  private readonly minSimilarity: number

  constructor(minSimilarity: number = 0.6) {
    this.minSimilarity = minSimilarity
  }

  deduplicate(sections: ResolvedSection[]): { sections: ResolvedSection[]; matches: DedupMatch[] } {
    const matches: DedupMatch[] = []
    const result: ResolvedSection[] = []

    for (const section of sections) {
      if (!section.content) {
        result.push(section)
        continue
      }

      let merged = false
      for (const existing of result) {
        if (!existing.content) continue

        const match = this.findMatch(existing, section)
        if (match) {
          matches.push(match)
          merged = true
          break
        }
      }

      if (!merged) {
        result.push(section)
      }
    }

    return { sections: result, matches }
  }

  private findMatch(a: ResolvedSection, b: ResolvedSection): DedupMatch | null {
    if (a.definition.id === b.definition.id) {
      return { sourceId: b.definition.id, targetId: a.definition.id, reason: 'Duplicate section ID' }
    }

    if (a.definition.category !== b.definition.category) return null

    const contentA = a.content!.toLowerCase().trim()
    const contentB = b.content!.toLowerCase().trim()

    if (contentA === contentB) {
      return { sourceId: b.definition.id, targetId: a.definition.id, reason: 'Identical content' }
    }

    if (contentA.includes(contentB) || contentB.includes(contentA)) {
      return { sourceId: b.definition.id, targetId: a.definition.id, reason: 'Content overlap' }
    }

    const similarity = this.calculateNgramSimilarity(contentA, contentB)
    if (similarity >= this.minSimilarity) {
      return { sourceId: b.definition.id, targetId: a.definition.id, reason: `N-gram similarity ${similarity.toFixed(2)}` }
    }

    return null
  }

  private calculateNgramSimilarity(a: string, b: string, n: number = 3): number {
    const ngramsA = this.getNgrams(a, n)
    const ngramsB = this.getNgrams(b, n)
    if (ngramsA.size === 0 || ngramsB.size === 0) return 0

    const intersection = new Set([...ngramsA].filter(x => ngramsB.has(x)))
    const union = new Set([...ngramsA, ...ngramsB])
    return intersection.size / union.size
  }

  private getNgrams(text: string, n: number): Set<string> {
    const ngrams = new Set<string>()
    const cleaned = text.replace(/\s+/g, ' ')
    for (let i = 0; i <= cleaned.length - n; i++) {
      ngrams.add(cleaned.slice(i, i + n))
    }
    return ngrams
  }
}
