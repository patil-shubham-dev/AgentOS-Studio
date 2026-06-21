/**
 * ComplexityAnalyzer — determines whether a user request is complex enough
 * to warrant a structured plan in "auto" plan mode.
 *
 * Uses multiple signal categories to compute a score 0–1.
 * Threshold: ≥ 0.5 triggers plan generation.
 */

export interface ComplexityResult {
  score: number
  signals: string[]
  shouldPlan: boolean
}

// ── Signal definitions ──

/** Keywords that strongly indicate a multi-step implementation task */
const IMPLEMENTATION_KEYWORDS = [
  "refactor", "implement", "create", "redesign", "rewrite", "migrate",
  "restructure", "reorganize", "extract", "separate", "split",
  "consolidate", "merge", "integrate", "convert", "transform",
  "set up", "setup", "scaffold", "generate", "build", "configure",
  "add.*feature", "new.*module", "new.*component", "new.*system",
]

/** Keywords that moderately indicate a non-trivial task */
const MODERATE_KEYWORDS = [
  "update", "change", "modify", "improve", "enhance", "fix", "resolve",
  "optimize", "clean up", "cleanup", "reformat", "rework",
  "add.*support", "add.*function", "add.*method", "add.*handler",
  "handle.*error", "error.*handling", "validation", "validation",
  "auth", "authentication", "authorization", "permission",
  "database", "query", "migration", "schema", "model",
  "api", "endpoint", "route", "middleware", "service",
  "test", "testing", "coverage", "spec", "e2e",
  "state.*management", "store", "context", "provider",
  "optimize", "performance", "caching", "cache",
]

/** Keywords that indicate a simple question — reduces complexity score */
const SIMPLE_INDICATORS = [
  "what is", "what are", "what's", "how do i", "how does",
  "can you explain", "explain", "tell me about",
  "hello", "hi ", "hey", "thanks", "thank you",
  "yes", "no", "okay", "ok ",
  "where is", "show me", "find",
]

/** Patterns that detect file path mentions */
const FILE_PATH_PATTERN = /(?:[`'"])?(?:\/[a-zA-Z0-9_./-]+\.[a-zA-Z]+|[a-zA-Z0-9_-]+\.[a-zA-Z]{2,4})(?:[`'"])?/g

/** Patterns that detect multi-step or structured requests */
const MULTI_STEP_PATTERNS = [
  /(?:first|second|third|next|then|after that|finally)/gi,
  /(?:step\s*\d|phase\s*\d|stage\s*\d)/gi,
  /(?:in order to|to do this|as part of)/gi,
  /(?:both|multiple|several|various|different)\s+(?:file|component|module|service|function)/gi,
  /(?:one by one|step by step|gradually|incrementally)/gi,
  /\n\s*(?:[-*]\s|\d+\.\s)/g, // bullet points or numbered lists
]

/** Patterns that detect structural/architectural changes */
const STRUCTURAL_PATTERNS = [
  /(?:move|rename|delete|remove|extract)\s+(?:file|folder|directory|class|function|component)/gi,
  /(?:split|divide|separate|break\s+apart|tear\s+apart)/gi,
  /(?:combine|merge|join|unite|consolidate)/gi,
  /(?:architecture|pattern|design|structure|layout|hierarchy)/gi,
  /(?:circular\s+dependency|import\s+cycle|tight\s+coupling)/gi,
]

/** Patterns that detect code-level changes (not just questions) */
const CODE_CHANGE_PATTERNS = [
  /(?:add|edit|update|change|remove|delete)\s+(?:the\s+)?(?:code|logic|function|class|method|handler|route)/gi,
  /(?:implement|write|create)\s+(?:a\s+)?(?:function|class|component|module|service|utility|helper)/gi,
  /(?:fix|resolve|patch|correct)\s+(?:a\s+)?(?:bug|issue|problem|error|vulnerability)/gi,
  /type\s+(?:error|mismatch|incompatible)/gi,
  /(?:lint|eslint|prettier|format)/gi,
]

export class ComplexityAnalyzer {
  private static instance: ComplexityAnalyzer

  static getInstance(): ComplexityAnalyzer {
    if (!ComplexityAnalyzer.instance) {
      ComplexityAnalyzer.instance = new ComplexityAnalyzer()
    }
    return ComplexityAnalyzer.instance
  }

  /**
   * Analyze a user input and determine if it's complex enough for a plan.
   */
  analyze(input: string): ComplexityResult {
    const signals: string[] = []
    let score = 0

    // ── Signal 1: Input length ──
    // Longer inputs are more likely to be complex
    const wordCount = input.split(/\s+/).filter(Boolean).length
    if (wordCount > 50) {
      score += 0.15
      signals.push(`Long input (${wordCount} words)`)
    } else if (wordCount > 20) {
      score += 0.08
      signals.push(`Moderate input (${wordCount} words)`)
    }

    // ── Signal 2: Implementation keywords ──
    const implMatches = IMPLEMENTATION_KEYWORDS.filter((kw) =>
      new RegExp(kw, "gi").test(input)
    )
    if (implMatches.length >= 3) {
      score += 0.25
      signals.push(`Strong implementation signals: ${implMatches.slice(0, 3).join(", ")}`)
    } else if (implMatches.length >= 1) {
      score += 0.15
      signals.push(`Implementation keyword: ${implMatches[0]}`)
    }

    // ── Signal 3: Moderate keywords ──
    const modMatches = MODERATE_KEYWORDS.filter((kw) =>
      new RegExp(kw, "gi").test(input)
    )
    if (modMatches.length >= 3) {
      score += 0.15
      signals.push(`Multiple moderate signals: ${modMatches.slice(0, 3).join(", ")}`)
    } else if (modMatches.length >= 1) {
      score += 0.08
    }

    // ── Signal 4: File path mentions ──
    const fileMatches = input.match(FILE_PATH_PATTERN)
    const uniqueFiles = fileMatches ? new Set(fileMatches.map((f) => f.replace(/[`'"]/g, "").trim())).size : 0
    if (uniqueFiles >= 3) {
      score += 0.25
      signals.push(`Multiple files mentioned (${uniqueFiles})`)
    } else if (uniqueFiles >= 1) {
      score += 0.10
      signals.push(`File mentioned: ${fileMatches?.[0]?.replace(/[`'"]/g, "")}`)
    }

    // ── Signal 5: Multi-step patterns ──
    const stepMatches = MULTI_STEP_PATTERNS.filter((p) => p.test(input))
    if (stepMatches.length > 0) {
      score += 0.15
      signals.push(`Multi-step request detected`)
    }

    // ── Signal 6: Structural patterns ──
    const structMatches = STRUCTURAL_PATTERNS.filter((p) => p.test(input))
    if (structMatches.length > 0) {
      score += 0.15
      signals.push(`Structural change detected`)
    }

    // ── Signal 7: Code change patterns ──
    const codeMatches = CODE_CHANGE_PATTERNS.filter((p) => p.test(input))
    if (codeMatches.length > 0) {
      score += 0.10
      signals.push(`Code modification request`)
    }

    // ── Signal 8: Simple question penalty ──
    const simpleMatches = SIMPLE_INDICATORS.filter((kw) =>
      new RegExp(`^${kw}|\\b${kw}\\b`, "gi").test(input)
    )
    if (simpleMatches.length > 0 && implMatches.length === 0 && codeMatches.length === 0) {
      score -= 0.20
      signals.push(`Simple question detected`)
    }

    // ── Signal 9: Multiple sentence types ──
    // Requests with both questions AND implementation language are often complex
    const hasQuestion = /\?\s*$/.test(input.trim()) || /what|how|why|can you|could you/i.test(input)
    const hasDirective = /^(?:please\s+)?(?:refactor|implement|create|add|update|change|fix|write|build|make|set\s+up)/i.test(input.trim())
    if (hasQuestion && hasDirective) {
      score += 0.10
      signals.push("Mixed question + directive")
    }

    // ── Signal 10: Sentence count ──
    const sentenceCount = input.split(/[.!?]+/).filter(Boolean).length
    if (sentenceCount >= 5) {
      score += 0.10
      signals.push(`Multiple sentences (${sentenceCount})`)
    }

    // ── Clamp score between 0 and 1 ──
    score = Math.max(0, Math.min(1, score))

    const shouldPlan = score >= 0.5

    if (shouldPlan) {
      signals.push(`Score ${score.toFixed(2)} ≥ threshold 0.50`)
    }

    return { score, signals, shouldPlan }
  }
}
