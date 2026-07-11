import type { MemoryEntry, MemoryCandidate, MemoryCategory } from "./types"

export interface ScoredCandidate {
  candidate: MemoryCandidate
  importance: number
  confidence: number
  rationale: string
}

export class ScoringEngine {
  score(candidate: MemoryCandidate): ScoredCandidate {
    const importance = this.computeImportance(candidate)
    const confidence = this.computeConfidence(candidate)
    const rationale = this.buildRationale(candidate, importance, confidence)

    return {
      candidate: { ...candidate, importance, confidence },
      importance,
      confidence,
      rationale,
    }
  }

  scoreBatch(candidates: MemoryCandidate[]): ScoredCandidate[] {
    return candidates.map((c) => this.score(c))
  }

  private computeImportance(candidate: MemoryCandidate): number {
    let score = 0.5

    const categoryWeights: Record<MemoryCategory, number> = {
      preference: 0.7,
      convention: 0.85,
      decision: 0.9,
      pattern: 0.75,
      workflow: 0.8,
      error: 0.6,
      learning: 0.8,
      architecture: 0.9,
      command: 0.7,
      browser_action: 0.3,
      tool_usage: 0.5,
      general: 0.4,
    }

    if (candidate.category) {
      score = categoryWeights[candidate.category] ?? 0.4
    } else {
      score = this.inferCategoryFromContent(candidate.content).weight
    }

    if (candidate.filePaths && candidate.filePaths.length > 0) {
      score = Math.min(1, score + 0.1 * Math.min(candidate.filePaths.length, 3))
    }

    if (candidate.tags) {
      if (candidate.tags.includes("decision")) score = Math.min(1, score + 0.15)
      if (candidate.tags.includes("architecture")) score = Math.min(1, score + 0.1)
      if (candidate.tags.includes("convention")) score = Math.min(1, score + 0.1)
      if (candidate.tags.includes("fix")) score = Math.min(1, score + 0.1)
      if (candidate.tags.includes("error")) score = Math.min(1, score - 0.1)
    }

    return Math.round(score * 100) / 100
  }

  private computeConfidence(candidate: MemoryCandidate): number {
    let score = 0.5

    if (candidate.source === "execution") score += 0.1
    if (candidate.source === "user") score += 0.2
    if (candidate.source === "verification") score += 0.15

    if (candidate.category === "command") score += 0.1
    if (candidate.category === "convention") score -= 0.1
    if (candidate.category === "decision") score -= 0.1

    if (candidate.content.length > 20 && candidate.content.length < 500) score += 0.1
    if (candidate.content.length > 500) score -= 0.1

    if (candidate.tags && candidate.tags.length > 0) {
      score += Math.min(0.1, candidate.tags.length * 0.02)
    }

    return Math.round(Math.min(1, Math.max(0.1, score)) * 100) / 100
  }

  inferCategoryFromContent(content: string): { category: MemoryCategory; weight: number } {
    const lower = content.toLowerCase()

    if (lower.includes("prefer") || lower.includes("like") || lower.includes("dislike")) {
      return { category: "preference", weight: 0.7 }
    }
    if (lower.includes("convention") || lower.includes("style") || lower.includes("naming")) {
      return { category: "convention", weight: 0.85 }
    }
    if (lower.includes("decided") || lower.includes("decision") || lower.includes("chose")) {
      return { category: "decision", weight: 0.9 }
    }
    if (lower.includes("pattern") || lower.includes("template") || lower.includes("structure")) {
      return { category: "pattern", weight: 0.75 }
    }
    if (lower.includes("workflow") || lower.includes("step") || lower.includes("process")) {
      return { category: "workflow", weight: 0.8 }
    }
    if (lower.includes("error") || lower.includes("bug") || lower.includes("fix") || lower.includes("failure")) {
      return { category: "error", weight: 0.6 }
    }
    if (lower.includes("learned") || lower.includes("lesson") || lower.includes("insight")) {
      return { category: "learning", weight: 0.8 }
    }
    if (lower.includes("architecture") || lower.includes("module") || lower.includes("component")) {
      return { category: "architecture", weight: 0.9 }
    }
    if (lower.includes("command") || lower.includes("install") || lower.includes("build")) {
      return { category: "command", weight: 0.7 }
    }

    return { category: "general", weight: 0.4 }
  }

  private buildRationale(candidate: MemoryCandidate, importance: number, confidence: number): string {
    const parts: string[] = []
    if (candidate.category) parts.push(`category=${candidate.category}`)
    if (candidate.filePaths?.length) parts.push(`${candidate.filePaths.length} file(s)`)
    if (candidate.tags?.length) parts.push(`${candidate.tags.length} tag(s)`)
    parts.push(`source=${candidate.source}`)
    return parts.join(", ")
  }
}
