import { SkillRegistry, type SkillDefinition } from './SkillRegistry'

interface ScoredSkill {
  skill: SkillDefinition
  score: number
  matchedTerms: string[]
}

export class SkillMatcher {
  private registry: SkillRegistry

  constructor(registry: SkillRegistry) {
    this.registry = registry
  }

  match(input: string, topN: number = 3): ScoredSkill[] {
    const skills = this.registry.getAll()
    const inputWords = this.tokenize(input)

    if (inputWords.length === 0) return []

    const scored: ScoredSkill[] = []

    for (const skill of skills) {
      const textToMatch = [skill.name, skill.description, ...skill.tags, ...skill.aliases].join(' ')
      const skillWords = this.tokenize(textToMatch)
      if (skillWords.length === 0) continue

      const matchedTerms: string[] = []
      let matchCount = 0

      for (const iw of inputWords) {
        if (skillWords.has(iw)) {
          matchCount++
          matchedTerms.push(iw)
        }
      }

      // Score = Jaccard similarity * boost for name matches
      const union = new Set([...inputWords, ...skillWords])
      let score = union.size > 0 ? matchCount / union.size : 0

      // Boost if the user explicitly mentions the skill name
      if (skill.aliases.some((a) => inputWords.has(a.toLowerCase()))) {
        score *= 2
      }
      if (inputWords.has(skill.name.toLowerCase())) {
        score *= 2
      }

      if (score > 0) {
        scored.push({ skill, score, matchedTerms })
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, topN)
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 1 && !STOP_WORDS.has(w)),
    )
  }
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'because', 'but', 'and', 'or', 'if', 'while', 'that', 'this',
  'these', 'those', 'it', 'its', 'what', 'which', 'who', 'whom',
])
