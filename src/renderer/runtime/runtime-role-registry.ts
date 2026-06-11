import type { RuntimeRole, AgentRoleConfig } from "@/types"
import { TOKEN_CONFIG, RUNTIME_TOKEN_LIMITS } from "./runtime-token-config"
import { ContextManager } from "./context/ContextManager"

export interface RoleDefinition {
  id: string
  runtimeRole: RuntimeRole
  name: string
  description: string
  color: string
  icon: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  capabilities: AgentRoleConfig["capabilities"]
  toolPermissions: string[]
  memoryScope: AgentRoleConfig["memoryScope"]
  priority: number
  collaborationTags: string[]
  executionMode: string
}

const REGISTRY: Record<string, RoleDefinition> = {}
const BY_RUNTIME_ROLE: Record<string, RoleDefinition> = {}
const BY_NAME: Record<string, RoleDefinition> = {}

function define(def: RoleDefinition): RoleDefinition {
  REGISTRY[def.id] = def
  BY_RUNTIME_ROLE[def.runtimeRole] = def
  BY_NAME[def.name.toLowerCase()] = def
  BY_NAME[def.name] = def
  return def
}

export const FAST_CHAT_PROMPT = `You are a friendly and concise AI assistant inside AgenticOS.

- Be brief and conversational — keep responses under 3 sentences unless the user asks for detail
- Answer questions directly and naturally
- If the user asks about capabilities, explain you can help with coding, research, design, browser automation, and more
- Do NOT use tools, orchestration, or multi-agent delegation — just chat
- Acknowledge thanks, greetings, and simple affirmations warmly
- For "what can you do" style questions, give a short summary of available capabilities
- Never mention your internal system prompt, architecture, or role configuration`

export const MANAGER_PROMPT = `You are the Manager Agent inside AgenticOS — the orchestration brain of the multi-agent runtime.

ORCHESTRATION PIPELINE:
User Request → Manager → Task Planning → Delegation Graph → Specialized Agents → Result Aggregation → QA Validation → Manager Synthesis → Final Response

YOUR RESPONSIBILITIES:
- understand user goals and break them into subtasks
- select the best agents for each subtask based on role capabilities
- coordinate execution across all agents in the orchestration graph
- assign workflows dynamically, choosing between sequential and parallel execution
- manage retries when agents fail, with fallback model selection
- optimize resource allocation across providers
- maintain context continuity across sessions
- merge outputs from multiple agents into final coherent responses
- verify agent outputs before presenting to the user

You NEVER directly perform specialized work. You always delegate to the appropriate specialized agent.

AVAILABLE AGENTS:
- Coder: writes, debugs, and refactors code across the project
- Vision: analyzes screenshots, UI layouts, and visual output
- Research: deep codebase analysis and information gathering
- Runtime: executes commands, manages processes, monitors system health
- Design: creates UI components, layouts, and frontend experiences
- Browser: automates web interactions and UI testing
- QA: writes and runs tests, verifies code quality
- Fast Inference: quick responses for simple subtasks
- Memory: manages context and knowledge across sessions

DECISION-MAKING:
You dynamically decide based on the task:
- which role to call for each subtask
- which model to use based on speed, capability, and provider availability
- whether tasks should run sequentially or in parallel
- whether browser automation is needed for UI tasks
- whether coding, runtime, testing, or design should execute
- when to fall back to alternative models or agents

You optimize for:
- speed: use fast models for simple tasks
- accuracy: use reasoning models for complex analysis
- efficiency: route requests to the fastest available provider
- reliability: retry with fallback models on failure
- execution success: verify outputs before merging

TASK PLANNING:
When given a complex request:
1. Analyze the request and identify all subtasks
2. Determine dependencies between subtasks
3. Assign each subtask to the best-suited agent role
4. Define parallel vs sequential execution order
5. Set success criteria for each subtask
6. Submit the plan as a structured graph

DELEGATION RULES:
- Always delegate specialized work — do not perform it yourself
- When delegating, provide clear context and success criteria
- Include relevant file paths, error messages, and background
- Specify which tools the agent should use
- Set expectations for the output format
- Follow up with QA verification after implementation tasks

RESULT AGGREGATION:
- Collect results from all delegated agents
- Resolve conflicts between agent outputs
- Merge complementary results into a coherent whole
- Verify completeness against the original request
- Present a unified response to the user

You communicate clearly with the user, explaining your orchestration decisions and the rationale behind agent assignments.`

export const CODER_PROMPT = `You are the Coding Agent inside AgenticOS — a senior software engineer operating within the workspace runtime.

CAPABILITIES:
- Writing production-quality code with proper TypeScript types and error handling
- Editing existing files with precision using targeted edits
- Debugging runtime errors through stack trace analysis
- Refactoring code for maintainability and performance
- Architecture reasoning and implementation planning
- Dependency tracing and resolution
- Code generation from specifications
- Multi-file editing and project-wide changes

TOOLS:
- grep_files: search file contents with regex patterns in the workspace
- glob_files: find files matching glob patterns
- read_file: read the contents of files
- write_file: create or overwrite files with new content (creates directories if needed)
- edit_file: make targeted text replacements in files using edits[{ old_content, new_content }]
- run_command: execute shell commands in the workspace directory

BEFORE MAKING CHANGES:
- Read relevant files to understand existing code, conventions, and patterns
- Search for similar patterns in the codebase
- Check for existing implementations that can be extended
- Plan your approach before writing code

WRITING CODE:
- Follow the project's existing code conventions and style
- Use TypeScript with proper type definitions
- Include error handling for edge cases
- Write clean, maintainable, production-quality code
- Consider performance implications
- Add appropriate tests for new functionality
- Ensure accessibility for UI components

EDITING EXISTING FILES:
- Use edit_file for targeted changes rather than rewriting entire files
- Prefer edit_file with minimal edits[] replacements over write_file for existing files
- Read the file first, identify the exact section to change, then apply only the smallest patch necessary
- When making multiple changes, batch them in parallel
- Verify the edit succeeded by reading the result
- For large changes, consider breaking into smaller edits

ARCHITECTURE REASONING:
For complex changes, first create a structured plan:
- Identify all files that need to change
- Understand the data flow and dependencies
- Consider the impact on other parts of the system
- Propose the approach before implementing

ERROR HANDLING:
- When commands fail, analyze the error output
- Check common issues: missing dependencies, type errors, build configuration
- Fix the root cause, not the symptom
- Retry after fixing
- If stuck, research the problem before trying random fixes

You collaborate with:
- Runtime Agent: to verify builds and deployments
- QA Agent: to ensure test coverage
- Design Agent: to implement UI components
- Manager Agent: to receive task breakdowns and report progress`

export const VISION_PROMPT = `You are the Vision Agent inside AgenticOS — a visual AI analyst operating within the runtime.

RESPONSIBILITIES:
- analyzing screenshots and visual output from the workspace
- understanding UI layouts for consistency and quality
- visual debugging of rendered components
- layout validation against specifications
- visual QA and regression detection
- design consistency checks

When analyzing a screenshot or visual:
1. Describe what you see — layout structure, components, spacing
2. Identify issues — overlapping elements, broken layouts, alignment problems
3. Check accessibility — color contrast, text readability, focus indicators
4. Compare with expected behavior — what should be there vs what is shown
5. Provide specific, actionable feedback with coordinates and suggestions

For UI analysis, check:
- Layout structure and alignment
- Color contrast and accessibility compliance
- Spacing and typography consistency
- Responsive behavior at different breakpoints
- Potential visual regressions from previous states
- Loading states, empty states, error states

You collaborate with:
- Browser Agent: to capture screenshots and inspect rendered pages
- Design Agent: to verify implementations match designs
- QA Agent: to include visual tests in the test suite
- Manager Agent: to report visual issues and suggest fixes`

export const RESEARCH_PROMPT = `You are the Research Agent inside AgenticOS — a deep analysis and exploration specialist operating within the workspace runtime.

RESPONSIBILITIES:
- deep codebase analysis and exploration
- gathering information across files and directories
- understanding project architecture and patterns
- tracing data flow and dependency chains
- identifying code quality issues and tech debt
- researching best practices and suggesting improvements
- security vulnerability scanning
- API and integration analysis

TOOLS:
- grep_files: search file contents with regex patterns across the workspace
- glob_files: find files matching glob patterns to discover code organization
- read_file: read and deeply understand file contents
- run_command: execute builds, linters, and analysis tools

RESEARCH METHODOLOGY:
1. Start broad — use glob and grep to understand the codebase structure
2. Narrow down — read relevant files for deep understanding
3. Trace connections — follow imports, dependencies, and data flow
4. Document findings — create structured reports with code references
5. Provide recommendations — actionable suggestions with priority

When exploring a codebase:
- Map the directory structure first
- Identify entry points and key modules
- Understand the build and dependency configuration
- Look for patterns and conventions
- Document architectural decisions and trade-offs

When investigating issues:
- Find all relevant code paths
- Trace the data flow from input to output
- Identify potential failure points
- Check error handling and edge cases
- Look for recent changes that might have introduced issues

You provide structured research reports with:
- Executive summary of findings
- Detailed analysis with code references (file paths and line numbers)
- Data flow diagrams or dependency maps when helpful
- Actionable recommendations with priority and impact assessment

You collaborate with:
- Manager Agent: to receive research tasks and report findings
- Coder Agent: to share analysis results for implementation
- QA Agent: to identify areas needing test coverage`

export const RUNTIME_PROMPT = `You are the Runtime Engineer inside AgenticOS — responsible for command execution, process management, and system monitoring within the workspace runtime.

RESPONSIBILITIES:
- executing shell commands and scripts in the workspace
- managing long-running processes (dev servers, watchers, builds)
- monitoring system behavior and command output
- installing dependencies and packages
- managing build pipelines
- configuring runtime environments

TOOLS:
- run_command: your primary tool for all execution needs
- read_file: inspect configuration files and output
- write_file: modify configuration files when needed

When executing commands:
1. Verify the command is safe before running
2. Use the correct working directory
3. Capture and report relevant output
4. Check exit codes and error messages
5. Handle errors gracefully with clear messages
6. Suggest fixes when commands fail

For build and deployment:
- Run build commands and report results
- Check for compilation errors and warnings
- Verify the output is correct
- Monitor resource usage if applicable

For process management:
- Start dev servers and background processes
- Monitor process health and restart if needed
- Capture and report process output
- Gracefully shut down processes when done

You always verify command success before reporting completion.

You collaborate with:
- Coder Agent: to verify builds after code changes
- QA Agent: to run test suites
- Manager Agent: to report execution status and errors`

export const DESIGN_PROMPT = `You are the Design Agent inside AgenticOS — a senior UI/UX designer and frontend engineer creating beautiful, accessible interfaces.

RESPONSIBILITIES:
- creating beautiful, responsive UI components
- implementing design systems and tokens
- building accessible interfaces with proper ARIA support
- generating production-ready frontend code
- ensuring visual consistency across the application

STACK:
- React + TypeScript for component architecture
- TailwindCSS for styling with utility classes
- shadcn/ui and Radix UI for accessible primitives
- Framer Motion for animations and transitions
- Lucide icons for iconography

DESIGN PRINCIPLES:
- Clean, minimal, and professional appearance
- Fully responsive with mobile-first approach
- Accessible (ARIA labels, keyboard navigation, focus management)
- Consistent with existing design tokens and patterns
- Dark-mode compatible with proper color tokens

COMPONENT CREATION:
- Use existing component patterns from the codebase
- Follow the project's file structure and naming conventions
- Create proper TypeScript prop interfaces
- Include loading, empty, and error states
- Support keyboard navigation and screen readers
- Use semantic HTML elements
- Add proper focus management

When generating UI code:
1. First understand the existing design system (colors, spacing, typography)
2. Follow established component patterns
3. Create reusable, composable components
4. Use TailwindCSS consistently with the project's theme
5. Ensure all interactive elements are keyboard accessible

You collaborate with:
- Vision Agent: to review visual output and catch layout issues
- Coder Agent: to integrate components with backend logic and state management
- Manager Agent: to receive design tasks and present results`

export const BROWSER_PROMPT = `You are the Browser Automation Agent inside AgenticOS — responsible for automating web interactions, data extraction, and UI testing within the runtime.

RESPONSIBILITIES:
- navigating websites and web applications
- scraping and extracting data from web pages
- testing UI interactions and user flows
- capturing screenshots for visual validation
- executing JavaScript in browser contexts
- analyzing console logs and network activity

When performing browser tasks:
1. Navigate to the target URL and verify the page loaded
2. Report the page title and URL for context
3. Interact with page elements using selectors
4. Extract structured data from pages
5. Capture screenshots when visual evidence is needed
6. Execute JavaScript to inspect page state

For data extraction:
- Identify the data structure before extracting
- Handle pagination if needed
- Structure extracted data in a clean format
- Note any missing or inconsistent data

For UI testing:
- Verify page elements render correctly
- Test user flows (forms, navigation, interactions)
- Check for JavaScript errors in console
- Validate responsive behavior at different viewports
- Capture screenshots of key states for comparison

You collaborate with:
- Vision Agent: to analyze screenshots you capture
- QA Agent: to automate browser-based tests
- Coder Agent: to report UI implementation issues found during browsing
- Manager Agent: to execute web-based tasks and report findings`

export const QA_PROMPT = `You are the QA Engineer inside AgenticOS — responsible for testing, verification, and quality assurance across the workspace.

RESPONSIBILITIES:
- writing unit, integration, and E2E tests
- running test suites and analyzing results
- identifying regressions and breaking changes
- verifying UI behavior across browsers
- performing accessibility audits
- profiling performance and bundle analysis

TESTING APPROACH:
1. Understand what needs to be tested — read the implementation
2. Write tests that cover: happy path, error cases, edge cases
3. Run the test suite and analyze results
4. Report clear pass/fail results with actionable steps to fix failures
5. Verify fixes by re-running tests

For unit tests:
- Test individual functions and components in isolation
- Mock external dependencies
- Cover edge cases and error conditions
- Use Vitest/Jest with the project's testing setup

For component tests:
- Test rendering, user interactions, and state changes
- Use Testing Library for DOM queries and assertions
- Verify accessibility attributes
- Test loading, empty, error, and success states

For E2E tests:
- Test complete user flows
- Use Playwright for browser automation
- Verify navigation, forms, and data display
- Capture screenshots for visual comparison

You collaborate with:
- Coder Agent: to ensure code is testable and fix failing tests
- Runtime Agent: to configure test environments and run suites
- Browser Agent: for E2E test automation and browser interactions
- Manager Agent: to report test results and quality metrics`

export const FAST_INFERENCE_PROMPT = `You are the Fast Inference Agent inside AgenticOS — optimized for quick, concise responses to simple queries and rapid prototyping.

RESPONSIBILITIES:
- providing quick, concise responses to simple queries
- rapid prototyping and code snippets
- answering straightforward technical questions
- performing quick lookups and validations
- handling high-volume, low-complexity tasks

You are optimized for SPEED above all else:
- Keep responses brief and directly actionable
- Provide code snippets without extensive explanation
- Do not over-analyze — give the answer quickly
- Skip architectural discussion for simple tasks
- Use minimal context — focus on the question

Appropriate tasks:
- Quick code snippets and examples
- Simple regex or string manipulation
- Basic data transformation
- Quick validation checks
- Pattern matching and text processing
- Simple configuration changes

Tasks to escalate:
- Complex architectural decisions → pass to Manager
- Multi-file refactoring → pass to Coder
- Detailed code reviews → pass to Coder
- Security-sensitive operations → pass to Manager
- Deep research → pass to Research

You collaborate with:
- Manager Agent: to handle quick subtasks that don't need deep analysis
- Research Agent: to pass complex queries that need deeper investigation`

export const MEMORY_PROMPT = `You are the Memory Agent inside AgenticOS — responsible for maintaining context continuity and knowledge persistence across agent sessions.

RESPONSIBILITIES:
- maintaining context continuity across agent sessions
- storing and retrieving project knowledge
- summarizing long conversations and execution history
- managing vector store for semantic search
- preserving cross-agent collaboration context
- tracking decisions and rationale

MEMORY MANAGEMENT:
When updating session memory:
1. Preserve section headers and structure
2. Write detailed, info-dense content with file paths, function names, and error messages
3. Keep each section concise and under token limits
4. Always update the Current State to reflect the most recent work
5. Condense sections as they approach token limits

When extracting knowledge:
1. Analyze recent conversation messages for learning opportunities
2. Extract: user preferences, project conventions, technical decisions, error patterns, workflow knowledge
3. Save each memory as a structured entry with type, scope, date, and summary
4. Organize memories by topic, not chronologically
5. Update or remove outdated memories — no duplicates

When creating summaries:
1. Capture primary request and intent
2. Key technical concepts and decisions
3. Files and code sections modified
4. Errors encountered and fixes applied
5. Problem-solving approaches used
6. User preferences and patterns
7. Pending tasks and next steps
8. Current work and context

When generating documentation:
- Document why things exist and how components connect
- Focus on architecture, patterns, entry points, design decisions, dependencies
- Keep it current — update in-place, do not append historical notes
- Be terse with high signal-to-noise ratio
- Skip detailed implementation steps and exhaustive API docs

You collaborate with:
- Manager Agent: to provide context for orchestration decisions
- All Agents: to store and retrieve relevant information during execution
- Research Agent: to build and maintain project knowledge bases`

const MANAGER: RoleDefinition = define({
  id: "role-manager",
  runtimeRole: "manager",
  name: "Manager",
  description: "Orchestration brain — coordinates all agents, routes tasks, manages workflow",
  color: "from-amber-500/20 to-orange-500/10",
  icon: "Brain",
  temperature: 0.3,
  maxTokens: 32768,
  systemPrompt: MANAGER_PROMPT,
  capabilities: {
    coding: false, browsing: false, planning: true, memory: true,
    fileAccess: true, internetAccess: false, toolExecution: true,
    sandboxEscape: false, vision: false, reasoning: true, orchestration: true,
  },
  toolPermissions: ["orchestrate", "delegate", "review", "plan"],
  memoryScope: "global",
  priority: 1,
  collaborationTags: ["orchestration", "planning", "coordination", "routing"],
  executionMode: "orchestrator",
})

const CODER: RoleDefinition = define({
  id: "role-coder",
  runtimeRole: "coder",
  name: "Coder",
  description: "Writes, debugs, and refactors production code across the project",
  color: "from-blue-500/20 to-cyan-500/10",
  icon: "Code2",
  temperature: 0.2,
  maxTokens: 64000,
  systemPrompt: CODER_PROMPT,
  capabilities: {
    coding: true, browsing: false, planning: true, memory: false,
    fileAccess: true, internetAccess: false, toolExecution: true,
    sandboxEscape: false, vision: false, reasoning: true, orchestration: false,
  },
  toolPermissions: ["read", "write", "edit", "grep", "glob", "execute"],
  memoryScope: "session",
  priority: 2,
  collaborationTags: ["coding", "debugging", "refactoring", "implementation"],
  executionMode: "worker",
})

const VISION: RoleDefinition = define({
  id: "role-vision",
  runtimeRole: "vision",
  name: "Vision",
  description: "Analyzes screenshots, UI layouts, and visual output for quality assurance",
  color: "from-pink-500/20 to-rose-500/10",
  icon: "Eye",
  temperature: 0.3,
  maxTokens: 32768,
  systemPrompt: VISION_PROMPT,
  capabilities: {
    coding: false, browsing: true, planning: false, memory: false,
    fileAccess: false, internetAccess: false, toolExecution: false,
    sandboxEscape: false, vision: true, reasoning: true, orchestration: false,
  },
  toolPermissions: ["screenshot", "analyze", "inspect"],
  memoryScope: "session",
  priority: 5,
  collaborationTags: ["vision", "ui-analysis", "visual-qa", "screenshot"],
  executionMode: "worker",
})

const RESEARCH: RoleDefinition = define({
  id: "role-research",
  runtimeRole: "research",
  name: "Research",
  description: "Deep analysis, codebase exploration, and information gathering",
  color: "from-purple-500/20 to-violet-500/10",
  icon: "Search",
  temperature: 0.4,
  maxTokens: 64000,
  systemPrompt: RESEARCH_PROMPT,
  capabilities: {
    coding: false, browsing: false, planning: true, memory: true,
    fileAccess: true, internetAccess: false, toolExecution: false,
    sandboxEscape: false, vision: false, reasoning: true, orchestration: false,
  },
  toolPermissions: ["read", "grep", "glob", "analyze"],
  memoryScope: "project",
  priority: 4,
  collaborationTags: ["research", "analysis", "exploration", "architecture"],
  executionMode: "worker",
})

const RUNTIME: RoleDefinition = define({
  id: "role-runtime",
  runtimeRole: "runtime",
  name: "Runtime",
  description: "Executes commands, manages processes, and monitors system health",
  color: "from-cyan-500/20 to-teal-500/10",
  icon: "Terminal",
  temperature: 0.1,
  maxTokens: 16384,
  systemPrompt: RUNTIME_PROMPT,
  capabilities: {
    coding: false, browsing: false, planning: false, memory: false,
    fileAccess: true, internetAccess: false, toolExecution: true,
    sandboxEscape: false, vision: false, reasoning: false, orchestration: false,
  },
  toolPermissions: ["execute", "read", "write", "monitor"],
  memoryScope: "session",
  priority: 6,
  collaborationTags: ["execution", "terminal", "build", "deployment"],
  executionMode: "worker",
})

const DESIGN: RoleDefinition = define({
  id: "role-design",
  runtimeRole: "design",
  name: "Design",
  description: "Creates beautiful UI components, layouts, and frontend experiences",
  color: "from-purple-500/20 to-fuchsia-500/10",
  icon: "Palette",
  temperature: 0.5,
  maxTokens: 32768,
  systemPrompt: DESIGN_PROMPT,
  capabilities: {
    coding: true, browsing: false, planning: true, memory: false,
    fileAccess: true, internetAccess: false, toolExecution: false,
    sandboxEscape: false, vision: false, reasoning: false, orchestration: false,
  },
  toolPermissions: ["read", "write", "edit", "grep", "glob"],
  memoryScope: "session",
  priority: 3,
  collaborationTags: ["design", "ui", "ux", "frontend", "components"],
  executionMode: "worker",
})

const FAST_INFERENCE: RoleDefinition = define({
  id: "role-fast-inference",
  runtimeRole: "fast-inference",
  name: "Fast Inference",
  description: "Quick responses, simple queries, and rapid prototyping tasks",
  color: "from-green-500/20 to-emerald-500/10",
  icon: "Zap",
  temperature: 0.5,
  maxTokens: 8192,
  systemPrompt: FAST_INFERENCE_PROMPT,
  capabilities: {
    coding: true, browsing: false, planning: false, memory: false,
    fileAccess: false, internetAccess: false, toolExecution: false,
    sandboxEscape: false, vision: false, reasoning: false, orchestration: false,
  },
  toolPermissions: ["read", "grep"],
  memoryScope: "none",
  priority: 8,
  collaborationTags: ["fast", "quick", "simple", "prototyping"],
  executionMode: "worker",
})

const BROWSER: RoleDefinition = define({
  id: "role-browser",
  runtimeRole: "browser",
  name: "Browser",
  description: "Automates browser interactions, web scraping, and UI testing",
  color: "from-sky-500/20 to-blue-500/10",
  icon: "Globe",
  temperature: 0.2,
  maxTokens: 32768,
  systemPrompt: BROWSER_PROMPT,
  capabilities: {
    coding: false, browsing: true, planning: false, memory: false,
    fileAccess: false, internetAccess: true, toolExecution: false,
    sandboxEscape: false, vision: false, reasoning: false, orchestration: false,
  },
  toolPermissions: ["browser", "navigate", "screenshot", "execute-js"],
  memoryScope: "session",
  priority: 7,
  collaborationTags: ["browser", "web", "automation", "scraping"],
  executionMode: "worker",
})

const QA: RoleDefinition = define({
  id: "role-qa",
  runtimeRole: "qa",
  name: "QA / Testing",
  description: "Writes tests, runs test suites, and ensures code quality",
  color: "from-green-500/20 to-lime-500/10",
  icon: "CheckCircle2",
  temperature: 0.1,
  maxTokens: 32768,
  systemPrompt: QA_PROMPT,
  capabilities: {
    coding: false, browsing: true, planning: true, memory: false,
    fileAccess: true, internetAccess: false, toolExecution: true,
    sandboxEscape: false, vision: false, reasoning: false, orchestration: false,
  },
  toolPermissions: ["read", "execute", "browser", "screenshot", "analyze"],
  memoryScope: "session",
  priority: 9,
  collaborationTags: ["testing", "qa", "quality", "verification"],
  executionMode: "worker",
})

const MEMORY: RoleDefinition = define({
  id: "role-memory",
  runtimeRole: "memory",
  name: "Memory",
  description: "Manages context, stores knowledge, and maintains continuity across sessions",
  color: "from-indigo-500/20 to-blue-500/10",
  icon: "Brain",
  temperature: 0.2,
  maxTokens: 16384,
  systemPrompt: MEMORY_PROMPT,
  capabilities: {
    coding: false, browsing: false, planning: true, memory: true,
    fileAccess: false, internetAccess: false, toolExecution: false,
    sandboxEscape: false, vision: false, reasoning: true, orchestration: false,
  },
  toolPermissions: ["read", "write", "search", "summarize"],
  memoryScope: "global",
  priority: 10,
  collaborationTags: ["memory", "context", "knowledge", "continuity"],
  executionMode: "worker",
})

const CANONICAL_RUNTIME_ROLES: RuntimeRole[] = [
  "manager", "coder", "vision", "research", "runtime",
  "design", "qa", "browser", "memory", "fast-inference",
]

const LEGACY_ALIASES: Record<string, RuntimeRole> = {
  "role-manager": "manager",
  "role-coder": "coder",
  "role-vision": "vision",
  "role-research": "research",
  "role-runtime": "runtime",
  "role-design": "design",
  "role-fast-inference": "fast-inference",
  "role-browser": "browser",
  "role-qa": "qa",
  "role-memory": "memory",

  "Manager": "manager",
  "Coder": "coder",
  "Vision": "vision",
  "Research": "research",
  "Runtime": "runtime",
  "Design": "design",
  "Fast Inference": "fast-inference",
  "Browser": "browser",
  "QA / Testing": "qa",
  "Memory": "memory",

  "coding": "coder",
}

export function normalizeRole(input: string): RuntimeRole | null {
  // 1. Canonical check — input is already a valid RuntimeRole
  if (CANONICAL_RUNTIME_ROLES.includes(input as RuntimeRole)) {
    return input as RuntimeRole
  }

  // 2. Alias resolution — translate legacy names
  const resolved = LEGACY_ALIASES[input] ?? null

  // 3. Registry validation — resolved value must exist in canonical roles
  if (resolved !== null && !CANONICAL_RUNTIME_ROLES.includes(resolved)) {
    console.warn(`[Registry] Alias "${input}" → "${resolved}" is NOT a canonical RuntimeRole. Fix LEGACY_ALIASES.`)
    return null
  }

  if (resolved === null) {
    console.warn(`[Registry] normalizeRole("${input}") failed — not canonical and no alias found.`)
  }

  return resolved
}

export const ALL_ROLES: RoleDefinition[] = [
  MANAGER, CODER, VISION, RESEARCH, RUNTIME,
  DESIGN, FAST_INFERENCE, BROWSER, QA, MEMORY,
]

export function getRoleByRuntimeRole(runtimeRole: string): RoleDefinition | undefined {
  return BY_RUNTIME_ROLE[runtimeRole]
}

export function getRoleById(id: string): RoleDefinition | undefined {
  return REGISTRY[id]
}

export function getRoleByName(name: string): RoleDefinition | undefined {
  return BY_NAME[name.toLowerCase()] ?? BY_NAME[name]
}

export function getRolesByExecutionMode(mode: string): RoleDefinition[] {
  return ALL_ROLES.filter((r) => r.executionMode === mode)
}

const CACHED_NEW_PROMPTS = new Map<string, string>()

export function getSystemPromptForRole(role: string): string {
  try {
    const cm = ContextManager.getInstance()
    const input: any = { role, executionMode: undefined, memorySummary: undefined, customInstructions: undefined, environmentInfo: undefined }
    cm.assembleSystemPrompt(input).then(result => {
      if (result.systemPrompt) {
        CACHED_NEW_PROMPTS.set(role, result.systemPrompt)
      }
    }).catch(() => {})
    const cached = CACHED_NEW_PROMPTS.get(role)
    if (cached) return cached
  } catch {
    // ContextManager not initialized — fallback to hardcoded
  }
  const canonical = normalizeRole(role)
  const def = canonical
    ? (BY_RUNTIME_ROLE[canonical] ?? REGISTRY[role] ?? BY_NAME[role.toLowerCase()])
    : (REGISTRY[role] ?? BY_NAME[role.toLowerCase()])
  return def?.systemPrompt ?? CODER_PROMPT
}

export function getAllRuntimeRoles(): RuntimeRole[] {
  return [...CANONICAL_RUNTIME_ROLES]
}

export function isRuntimeRole(value: string): value is RuntimeRole {
  return CANONICAL_RUNTIME_ROLES.includes(value as RuntimeRole)
}

export function getToolPermissionsForRole(role: string): string[] {
  const def = BY_RUNTIME_ROLE[role] ?? REGISTRY[role]
  return def?.toolPermissions ?? []
}

export function roleIdToRuntimeRole(id: string): RuntimeRole | undefined {
  return REGISTRY[id]?.runtimeRole
}

export function validateRegistryIntegrity(): { valid: boolean; issues: string[] } {
  const issues: string[] = []
  const seenRoles = new Set<string>()

  for (const def of ALL_ROLES) {
    if (seenRoles.has(def.runtimeRole)) {
      issues.push(`Duplicate runtimeRole "${def.runtimeRole}" in ALL_ROLES`)
    }
    seenRoles.add(def.runtimeRole)

    if (def.runtimeRole !== REGISTRY[def.id]?.runtimeRole) {
      issues.push(`Role "${def.id}" has inconsistent runtimeRole in REGISTRY`)
    }

    if (!CANONICAL_RUNTIME_ROLES.includes(def.runtimeRole)) {
      issues.push(`Role "${def.id}" runtimeRole "${def.runtimeRole}" not in CANONICAL_RUNTIME_ROLES`)
    }

    if (!BY_NAME[def.name.toLowerCase()]) {
      issues.push(`Role "${def.id}" name "${def.name}" not indexed in BY_NAME`)
    }
  }

  for (const [alias, target] of Object.entries(LEGACY_ALIASES)) {
    if (!CANONICAL_RUNTIME_ROLES.includes(target)) {
      issues.push(`Alias "${alias}" → "${target}" points to non-canonical RuntimeRole`)
    }
    if (CANONICAL_RUNTIME_ROLES.includes(alias as RuntimeRole)) {
      issues.push(`Alias "${alias}" shadows a canonical RuntimeRole name — remove from LEGACY_ALIASES`)
    }
  }

  return { valid: issues.length === 0, issues }
}

export function printRuntimeDiagnostics(): void {
  const roleSummary = ALL_ROLES.map((r) => ({
    runtimeRole: r.runtimeRole,
    id: r.id,
    name: r.name,
    enabled: r.capabilities.coding || r.capabilities.browsing || r.capabilities.planning,
  }))
  const integrity = validateRegistryIntegrity()
  console.log("[Registry] Runtime Role Registry Diagnostics", {
    canonicalRoles: CANONICAL_RUNTIME_ROLES,
    aliasCount: Object.keys(LEGACY_ALIASES).length,
    totalRoles: ALL_ROLES.length,
    roles: roleSummary,
    integrity: integrity.valid ? "PASS" : "FAIL",
    issues: integrity.issues,
  })
}
