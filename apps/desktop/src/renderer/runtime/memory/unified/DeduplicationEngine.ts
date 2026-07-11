import type { MemoryEntry, MemoryCandidate } from "./types"
import { createMemoryEntry } from "./types"

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim()
}

function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(normalizeText(a).split(/\W+/).filter(Boolean))
  const wordsB = new Set(normalizeText(b).split(/\W+/).filter(Boolean))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)))
  return intersection.size / Math.max(wordsA.size, wordsB.size)
}

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeText(a).split(/\W+/).filter(Boolean))
  const wordsB = new Set(normalizeText(b).split(/\W+/).filter(Boolean))
  const union = new Set([...wordsA, ...wordsB])
  if (union.size === 0) return 0
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)))
  return intersection.size / union.size
}

export interface DedupResult {
  candidate: MemoryCandidate
  isDuplicate: boolean
  mergedInto: MemoryEntry | null
  mergeAction: "new" | "merged" | "skipped"
  similarity: number
}

export class DeduplicationEngine {
  private minSimilarity = 0.7
  private wordOverlapThreshold = 0.5

  async deduplicate(
    candidate: MemoryCandidate,
    existingEntries: MemoryEntry[],
  ): Promise<DedupResult> {
    if (existingEntries.length === 0) {
      return {
        candidate,
        isDuplicate: false,
        mergedInto: null,
        mergeAction: "new",
        similarity: 0,
      }
    }

    let bestMatch: MemoryEntry | null = null
    let bestSimilarity = 0

    for (const existing of existingEntries) {
      const sim = jaccardSimilarity(candidate.content, existing.content)
      const overlap = wordOverlap(candidate.content, existing.content)

      const combinedSim = Math.max(sim, overlap)

      if (combinedSim > bestSimilarity) {
        bestSimilarity = combinedSim
        bestMatch = existing
      }
    }

    if (!bestMatch || bestSimilarity < this.minSimilarity) {
      return {
        candidate,
        isDuplicate: false,
        mergedInto: null,
        mergeAction: "new",
        similarity: bestSimilarity,
      }
    }

    if (bestSimilarity >= 0.9) {
      return {
        candidate,
        isDuplicate: true,
        mergedInto: bestMatch,
        mergeAction: "skipped",
        similarity: bestSimilarity,
      }
    }

    const merged = this.merge(bestMatch, candidate)
    return {
      candidate,
      isDuplicate: true,
      mergedInto: merged,
      mergeAction: "merged",
      similarity: bestSimilarity,
    }
  }

  async deduplicateBatch(
    candidates: MemoryCandidate[],
    existingEntries: MemoryEntry[],
  ): Promise<DedupResult[]> {
    const results: DedupResult[] = []
    const mutableExisting = [...existingEntries]

    for (const candidate of candidates) {
      const result = await this.deduplicate(candidate, mutableExisting)
      if (result.mergedInto && result.mergeAction === "merged") {
        const idx = mutableExisting.findIndex((e) => e.id === result.mergedInto!.id)
        if (idx >= 0) {
          mutableExisting[idx] = result.mergedInto
        } else {
          mutableExisting.push(result.mergedInto)
        }
      }
      results.push(result)
    }

    return results
  }

  merge(existing: MemoryEntry, candidate: MemoryCandidate): MemoryEntry {
    const now = Date.now()

    const combinedTags = [...new Set([...existing.tags, ...(candidate.tags ?? [])])]
    const combinedFiles = [...new Set([...existing.filePaths, ...(candidate.filePaths ?? [])])]

    const existingLen = existing.content.length
    const candidateLen = candidate.content.length
    const mergedContent = existingLen >= candidateLen
      ? existing.content
      : candidate.content

    const mergedImportance = Math.max(existing.importance, candidate.importance ?? 0.5)
    const mergedConfidence = Math.max(existing.confidence, candidate.confidence ?? 0.5)

    return createMemoryEntry({
      id: existing.id,
      type: candidate.type ?? existing.type,
      scope: this.broaderScope(existing.scope, candidate.scope),
      category: candidate.category ?? existing.category,
      content: mergedContent,
      source: existing.source,
      timestamp: existing.timestamp,
      tags: combinedTags,
      filePaths: combinedFiles,
      importance: mergedImportance,
      confidence: mergedConfidence,
      metadata: { ...existing.metadata, ...candidate.metadata, mergedAt: now },
      ttl: Math.max(existing.ttl, candidate.ttl ?? 0),
      version: existing.version + 1,
    })
  }

  private broaderScope(
    existing: MemoryEntry["scope"],
    candidate?: MemoryEntry["scope"],
  ): MemoryEntry["scope"] {
    if (!candidate) return existing
    const hierarchy: MemoryEntry["scope"][] = ["ephemeral", "session", "project", "workspace", "user", "global"]
    const existingIdx = hierarchy.indexOf(existing)
    const candidateIdx = hierarchy.indexOf(candidate)
    return hierarchy[Math.max(existingIdx, candidateIdx)]
  }
}
