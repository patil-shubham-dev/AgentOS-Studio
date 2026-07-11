import type { RuntimeRole } from "@/types"

/**
 * Optional LLM-based intent classifier for fallback when regex patterns
 * yield low confidence. Called by routeWithLLMFallback when available.
 */
export type LLMClassifier = (input: string) => Promise<{ category: IntentCategory; confidence: number }>

export type IntentCategory =
  | "conversation"
  | "coding"
  | "ui-analysis"
  | "research"
  | "execution"
  | "browser-task"
  | "planning"
  | "multi-agent"

export type ExecutionStrategy = "direct" | "single-agent" | "multi-agent"

export interface RoutingDecision {
  requiresDelegation: boolean
  selectedRoles: RuntimeRole[]
  executionStrategy: ExecutionStrategy
  mode: "fast" | "full"
  reasoning: string
  intentCategory: IntentCategory
}

const INTENT_PATTERNS: Record<IntentCategory, { patterns: RegExp[]; roles: RuntimeRole[]; delegatable: boolean }> = {
  conversation: {
    patterns: [
      /^(hi|hello|hey|yo|sup|howdy)\b/i,
      /^(thanks|thank you|thx|ty|appreciate)\b/i,
      /^(ok|okay|k|sure|alright|got it|understood)\b/i,
      /^(goodbye|bye|see you|cya|farewell)\b/i,
      /^(how are you|what's up|whats up|how's it going|how is it going)\b/i,
      /^(what can you do|what do you do|help|commands|capabilities)\b/i,
      /^(who are you|what are you|explain yourself|tell me about yourself)\b/i,
      /^(yes|no|maybe|perhaps|correct|right|nah|nope|yep|yeah)\b/i,
      /^(nice|great|awesome|perfect|good|cool|amazing|wonderful)\b/i,
      /^(help me|i need help|can you help)\b/i,
      /^(what is this(?! (project|app|codebase|repo|code))|what is agentic|what does this do)\b/i,
      /^(i have a question|question|quick question)\b/i,
      /^(tl;dr|tldr|gist|brief)/i,
      /^(what did I just|what was I|where was I)/i,
    ],
    roles: ["fast-inference"],
    delegatable: true,
  },
  coding: {
    patterns: [
      /implement|write|create|build|develop|\bprogram\b|\bcode\b/i,
      /make|fix|debug|bug|error|crash|broken|issue|repair/i,
      /refactor|rewrite|restructure|optimize|clean.?up/i,
      /add feature|new feature|function|class|component|module/i,
      /typescript|javascript|react|vue|angular|node|python|rust|go|java/i,
      /html|css|scss|less|style|design|layout|ui|ux/i,
      /website|webpage|web page|page|site|app|application/i,
      /component|element|button|form|input|menu|nav|header|footer|section/i,
      /algorithm|data structure|api endpoint|route|handler|service/i,
      /unit test|integration test|test case|test suite/i,
    ],
    roles: ["coder"],
    delegatable: true,
  },
  "ui-analysis": {
    patterns: [
      /screenshot|visual|ui analysis|render|layout|style|css/i,
      /looks? (like|at|wrong|off|good|bad)/i,
      /design review|ui review|visual review/i,
    ],
    roles: ["vision"],
    delegatable: true,
  },
  research: {
    patterns: [
      /research|investigate|find out|look up|search for/i,
      // Both US (analyze) and British (analyse) spellings; also codebase-overview queries
      /analyz|analys|explore|understand how/i,
      /documentation|docs|readme|architecture|dependency/i,
      /what is|how does|explain|architecture of/i,
      // Codebase / project understanding queries that should never fast-path.
      // 'codebase' must be listed here BEFORE the coding patterns fire on 'code'.
      /codebase|code[-_]?base|project structure|project overview|project layout/i,
      /what (does|is) (this|the) (project|app|codebase|repo|code)/i,
      /tell me about (this|the) (project|app|codebase|repo|codebase)/i,
      /give (me )?an? overview/i,
      /summarize (the |this )?(project|codebase|repo|code)/i,
      /\bsummarize\b/i,
      // "what is this project about" — 'project about' as a phrase
      /project (about|description|purpose|goal)/i,
    ],
    roles: ["research"],
    delegatable: true,
  },
  execution: {
    patterns: [
      /run|execute|start|launch|deploy/i,
      /command|terminal|shell|script|bash|powershell/i,
      /build|compile|transpile|bundle|package/i,
      /install|npm|yarn|pnpm|pip|cargo|go get/i,
      /process|server|daemon|service/i,
    ],
    roles: ["runtime"],
    delegatable: true,
  },
  "browser-task": {
    patterns: [
      /navigate to|go to|open website|browse|visit/i,
      /scrape|extract.*data|crawl/i,
      /click on|fill form|submit|login/i,
      /automation|e2e test|playwright|puppeteer/i,
    ],
    roles: ["browser"],
    delegatable: true,
  },
  planning: {
    patterns: [
      /plan|strategy|approach|architecture|design.*doc/i,
      /roadmap|milestone|sprint|task.*(list|breakdown)/i,
      /how should I|what's the best way|recommend/i,
    ],
    roles: ["manager"],
    delegatable: true,
  },
  "multi-agent": {
    patterns: [
      /multiple agents|orchestrate|coordinate|parallel/i,
      /complex.*task|full.*stack|end.*to.*end/i,
      /build.*(app|system|project|service|platform)/i,
      /migrate|upgrade|convert.*from/i,
      /comprehensive|thorough|extensive|complete.*solution/i,
      /implement.*(feature|system|module).*(with|including).*(test|doc|validation)/i,
    ],
    roles: ["coder", "research", "verification", "runtime"],
    delegatable: true,
  },
}

/** Detect code blocks (``` or `inline`) in user input */
function containsCodeBlock(input: string): boolean {
  return /```[\s\S]*?```/.test(input) || /`[^`]+`/.test(input)
}

/** Detect file-path references (e.g. src/foo.ts, ./bar.tsx, path/to/file) */
function containsFilePathRef(input: string): boolean {
  return /(?:^|\s)(?:`?[.\/]?[\w.\/-]+\/\w+[\w.\/-]*\.\w{1,4}`?)/.test(input)
}

const DIRECT_RESPONSE_KEYWORDS = [
  /^hi\b/i, /^hello\b/i, /^hey\b/i, /^thanks\b/i, /^thank you\b/i,
  /^ok\b/i, /^okay\b/i, /^sure\b/i, /^yes\b/i, /^no\b/i,
  /^bye\b/i, /^goodbye\b/i,
  /^(what can you do|help|commands|capabilities|what do you do)$/i,
  /^(who are you|what are you|what is this|explain yourself|tell me about yourself)$/i,
  /^(nice|great|awesome|perfect|good|got it|cool)$/i,
  /^(help me|i need help|can you help)$/i,
]

export function classifyIntent(input: string): {
  category: IntentCategory
  confidence: number
} {
  const trimmed = input.trim()

  for (const [category, config] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(trimmed)) {
        return { category: category as IntentCategory, confidence: 0.8 }
      }
    }
  }

  const wordCount = trimmed.split(/\s+/).length
  if (wordCount < 4) {
    for (const pattern of DIRECT_RESPONSE_KEYWORDS) {
      if (pattern.test(trimmed)) {
        return { category: "conversation", confidence: 0.9 }
      }
    }
  }

  if (wordCount < 4) {
    return { category: "conversation", confidence: 0.6 }
  }

  if (trimmed.endsWith("?") && wordCount < 8) {
    const questionWords = /^(what|who|how|does|do|can|could|would|will|is|are|was|were|why|where|when)\b/i
    if (questionWords.test(trimmed)) {
      return { category: "conversation", confidence: 0.7 }
    }
  }

  return { category: "conversation", confidence: 0.5 }
}

export function route(
  input: string,
  wiredRoles: RuntimeRole[],
): RoutingDecision {
  const { category, confidence } = classifyIntent(input)
  const pattern = INTENT_PATTERNS[category]
  const isConversation = category === "conversation"
  const hasCode = containsCodeBlock(input)
  const hasFilePath = containsFilePathRef(input)

  // ── Coding patterns: file paths, code blocks, or coding verbs → full single-agent ──
  // Check this FIRST so coding-intent always wins over conversation (a fast-mode reply
  // that ignores a code-fix request is worse than a full-mode reply for a greeting).
  //
  // IMPORTANT: 'codebase' must NOT be caught here — it belongs to research.
  // The guard regex uses \bcode\b so 'codebase' is excluded.
  const isCodingIntent =
    hasCode ||
    hasFilePath ||
    category === "coding" ||
    /\b(edit|fix|add|refactor|debug|explain|test|write|make|build|implement|create|update|remove|delete|rename|optimize|design|style|generate|render)\b/i.test(input) ||
    /\b(html|css|javascript|typescript|react|vue|node|python|rust|go|java|webpage|website|page|site|app|application)\b/i.test(input) ||
    /\banalyz|\banalys|\bexplor|\bexamin|\binvestigat/i.test(input)

  if (isCodingIntent) {
    const coderAvailable = wiredRoles.includes("coder" as RuntimeRole)
    if (coderAvailable) {
      return {
        requiresDelegation: true,
        selectedRoles: ["coder"] as RuntimeRole[],
        executionStrategy: "single-agent",
        mode: "full",
        reasoning: "Coding request — full single-agent execution with tools.",
        intentCategory: "coding",
      }
    }
    // Fall through: no coder wired, try conversation or pattern-based routing below
  }

  // ── High-confidence conversation → fast (toolless) mode, no delegation ──
  if (isConversation && confidence >= 0.7) {
    return {
      requiresDelegation: false,
      selectedRoles: [],
      executionStrategy: "direct",
      mode: "fast",
      reasoning: "Conversational message — fast toolless response.",
      intentCategory: "conversation",
    }
  }

  // ── Low-confidence conversation (confidence < 0.7): classifier fell through to the
  //    default — this is NOT a confirmed greeting. Use mode:"full" so any hidden
  //    analysis/coding intent still gets tool access.
  if (isConversation) {
    const managerAvailable = wiredRoles.includes("manager" as RuntimeRole)
    if (managerAvailable) {
      return {
        requiresDelegation: true,
        selectedRoles: ["manager"] as RuntimeRole[],
        executionStrategy: "single-agent",
        // Use full mode: confidence < 0.7 means the classifier isn't sure. A full
        // response with tool access is always safe; a fast response may silently
        // ignore a legitimate analysis or coding request.
        mode: "full",
        reasoning: "Low-confidence classification. Delegating to manager with full tool access to avoid misclassification.",
        intentCategory: "conversation",
      }
    }
    return {
      requiresDelegation: false,
      selectedRoles: [],
      executionStrategy: "direct",
      // Same rationale: unknown intent → full mode
      mode: "full",
      reasoning: "Ambiguous input — no delegation but using full mode to ensure analysis/coding requests are not silently fast-pathed.",
      intentCategory: "conversation",
    }
  }

  const availableRoles = pattern.roles.filter((r) => wiredRoles.includes(r))

  // Input length escalation: add supporting roles for long inputs
  const inputWordCount = input.trim().split(/\s+/).length
  if (inputWordCount > 60 && availableRoles.length <= 1 && category !== "conversation") {
    if (wiredRoles.includes("research" as RuntimeRole) && !availableRoles.includes("research" as RuntimeRole)) {
      availableRoles.push("research" as RuntimeRole)
    }
    if (wiredRoles.includes("qa" as RuntimeRole) && !availableRoles.includes("qa" as RuntimeRole)) {
      availableRoles.push("qa" as RuntimeRole)
    }
  }

  if (availableRoles.length === 0) {
    return {
      requiresDelegation: false,
      selectedRoles: [],
      executionStrategy: "direct",
      mode: "full",
      reasoning: `Intent "${category}" but no wired roles available for delegation. Responding directly.`,
      intentCategory: category,
    }
  }

  // ── Single role → single-agent full mode ──
  // IMPORTANT: never emit "multi-agent" strategy from intent classification
  return {
    requiresDelegation: true,
    selectedRoles: availableRoles,
    executionStrategy: "single-agent",
    mode: "full",
    reasoning: `Classified as "${category}" with confidence ${confidence}. Delegating to ${availableRoles[0]}.`,
    intentCategory: category,
  }
}

/**
 * Compute low-confidence classification: returns true when the regex-based
 * classifier fell back to a generic result (confidence < 0.8).
 */
export function isLowConfidence(category: IntentCategory, confidence: number): boolean {
  return category === "conversation" && confidence < 0.8
}

/**
 * Route with optional LLM fallback when regex patterns yield low confidence.
 * Falls back to route() synchronously if no LLM classifier is provided.
 * This is the async entry point used by the executor.
 */
export async function routeWithLLMFallback(
  input: string,
  wiredRoles: RuntimeRole[],
  llmClassifier?: LLMClassifier,
): Promise<RoutingDecision> {
  const syncDecision = route(input, wiredRoles)
  if (!isLowConfidence(syncDecision.intentCategory, 0.5) || !llmClassifier) {
    return syncDecision
  }

  try {
    const llmResult = await llmClassifier(input)
    const pattern = INTENT_PATTERNS[llmResult.category]
    const availableRoles = pattern ? pattern.roles.filter((r) => wiredRoles.includes(r)) : []

    if (availableRoles.length === 0) {
      return syncDecision
    }

    // LLM fallback: never emit "multi-agent" strategy — always "single-agent"
    return {
      requiresDelegation: true,
      selectedRoles: availableRoles,
      executionStrategy: "single-agent",
      mode: "full",
      reasoning: `LLM fallback: classified as "${llmResult.category}" (confidence ${llmResult.confidence}). Delegating to ${availableRoles.join(", ")}.`,
      intentCategory: llmResult.category,
    }
  } catch {
    return syncDecision
  }
}
