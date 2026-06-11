import type { RuntimeRole } from "@/types"

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
      /^(what is this|what is agentic|what does this do)\b/i,
      /^(does .* work|how does .* work|can you .*)\b/i,
      /^(i have a question|question|quick question)\b/i,
      /^(summarize|tl;dr|tldr|gist|brief)/i,
      /^(what did I just|what was I|where was I)/i,
    ],
    roles: ["fast-inference"],
    delegatable: true,
  },
  coding: {
    patterns: [
      /implement|write|create|build|develop|program|code/i,
      /fix|debug|bug|error|crash|broken|issue|repair/i,
      /refactor|rewrite|restructure|optimize|clean up/i,
      /add feature|new feature|function|class|component|module/i,
      /typescript|javascript|react|vue|angular|node|python|rust|go|java/i,
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
      /analyze|analysis|explore|understand how/i,
      /documentation|docs|readme|architecture|dependency/i,
      /what is|how does|explain|architecture of/i,
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
    ],
    roles: ["coder", "research", "qa", "runtime"],
    delegatable: true,
  },
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

  return { category: "coding", confidence: 0.5 }
}

export function route(input: string, wiredRoles: RuntimeRole[]): RoutingDecision {
  const { category, confidence } = classifyIntent(input)
  const pattern = INTENT_PATTERNS[category]
  const isConversation = category === "conversation"

  if (isConversation) {
    const fastInferenceAvailable = wiredRoles.includes("fast-inference" as RuntimeRole)
    if (fastInferenceAvailable) {
      return {
        requiresDelegation: true,
        selectedRoles: ["fast-inference"] as RuntimeRole[],
        executionStrategy: "single-agent",
        reasoning: "Conversational message. Delegating to fast-inference for quick response.",
        intentCategory: "conversation",
      }
    }
    return {
      requiresDelegation: false,
      selectedRoles: [],
      executionStrategy: "direct",
      reasoning: "Greeting or conversational message — no delegation needed.",
      intentCategory: "conversation",
    }
  }

  const availableRoles = pattern.roles.filter((r) => wiredRoles.includes(r))

  if (availableRoles.length === 0) {
    return {
      requiresDelegation: false,
      selectedRoles: [],
      executionStrategy: "direct",
      reasoning: `Intent "${category}" but no wired roles available for delegation. Responding directly.`,
      intentCategory: category,
    }
  }

  if (availableRoles.length === 1 && category !== "multi-agent") {
    return {
      requiresDelegation: true,
      selectedRoles: availableRoles,
      executionStrategy: "single-agent",
      reasoning: `Classified as "${category}" with confidence ${confidence}. Delegating to ${availableRoles[0]}.`,
      intentCategory: category,
    }
  }

  return {
    requiresDelegation: true,
    selectedRoles: availableRoles,
    executionStrategy: "multi-agent",
    reasoning: `Complex task classified as "${category}". Multi-agent delegation to: ${availableRoles.join(", ")}.`,
    intentCategory: category,
  }
}
