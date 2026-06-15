# AgenticOS — Master Improvement Plan (Claude Code Parity)

> **Date:** June 15, 2026
> **Goal:** Bring AgenticOS to full feature parity with Claude Code Desktop and Cursor Agent mode while preserving its unique advantages (multi-agent orchestration, browser+design tools, electron UI).
> **Philosophy:** Completeness over speed. Every feature must be production-grade, tested, and polished before moving to the next.

---

## 📊 Current Architecture Snapshot

### What AgenticOS Already Has

| System | Strength | Key Files |
|--------|----------|-----------|
| **Multi-Agent Orchestration** | 11 specialized agent roles with pipeline ordering | `runtime-role-registry.ts`, `ExecutionOrchestrator.ts` |
| **Autonomous Goal Loop** | Plan→Execute→Observe→Verify→Reflect→Replan cycle | `AutonomousGoalLoop.ts`, `GoalState.ts` |
| **Context Management** | Dynamic prompt composition with file scoring, memory injection, budget tracking, auto-compaction | `ContextManager.ts` |
| **Tool System** | 30+ built-in tools with pipeline, permissions, retry, concurrency control | `tools/implementations/index.ts`, `RuntimeOS.ts` |
| **Provider System** | Multi-model, multi-provider with 4-tier fallback, runtime detection | `AgentExecutor.ts`, `ProviderRuntime.ts` |
| **Browser Automation** | Live viewport with 12 automation tools, annotations, console, network inspector, device emulation | `browser-workspace.tsx` |
| **Design Workspace** | Artifact management with version history, code/visual/split preview | `design-workspace.tsx` |
| **Code Editor** | Monaco-based with streaming AI edits, inline editing, diagnostics, debug, split views | `code-workspace.tsx` |
| **Memory Architecture** | Cross-session memory with types, scopes, importance scoring, auto-extraction | `MemoryArchitecture.ts` |
| **Verification Pipeline** | 8-stage automated verification (lint, typecheck, build, test, security, performance, regression) | `VerificationPipeline.ts` |
| **Observability** | Event logging, counters, histograms, spans, deterministic tool recording | `ObservabilityManager.ts` |
| **Feature Flags** | Toggle system for runtime selection (goal-loop vs legacy), browser continuity, auto-memory | `FeatureFlagManager.ts` |

### What's Missing vs Claude Code / Cursor

| Feature | Claude Code | Cursor | AgenticOS | Impact |
|---------|:-----------:|:------:|:---------:|--------|
| **Prompt Caching** | ✅ Auto-cached | ✅ Implicit | ❌ Missing | 40-60% cost savings |
| **Project Config File** | ✅ CLAUDE.md | ✅ .cursor/rules/ | ❌ Missing | Persistent project conventions |
| **Plan Mode** | ✅ Extended thinking | ✅ Plan Mode | ❌ Missing | Prevents wrong multi-step changes |
| **Parallel Tool Execution** | ✅ Selective | ✅ Sequential | ❌ Sequential only | 2-3x speed on research tasks |
| **@-Symbol Context** | ❌ | ✅ @file, @folder, @web | ❌ AI context only | Precise context control |
| **Diff Viewing UX** | ❌ CLI-only | ✅ Best-in-class | ⚠️ Basic | Change acceptance workflow |
| **Git Worktree Sandbox** | ❌ | ✅ | ❌ Missing | Safe agent experimentation |
| **Output Styles** | ✅ Markdown presets | ✅ .cursor/rules/ | ❌ Hardcoded prompts | User customization |
| **ToolSearch** | ✅ Dynamic loading | ❌ | ❌ Fixed registry | Reduces prompt bloat |
| **Auto-Generated Config** | ✅ /init command | ✅ Implicit | ❌ Missing | Zero-friction onboarding |
| **Cross-Session Context** | ✅ Auto Memory | ⚠️ Limited | ⚠️ Needs work | Never lose context |
| **CLI Mode** | ✅ Primary | ❌ | ✅ Has headless | Terminal users |
| **Multi-Agent** | ❌ Single agent | ❌ Single agent | ✅ 11 agents | **Unique advantage** |
| **Browser Automation** | ❌ | ❌ | ✅ Live viewport | **Unique advantage** |
| **Design Tools** | ❌ | ❌ | ✅ Artifacts | **Unique advantage** |

---

## 📋 Priority Matrix

```
P0 ─── Critical: Blocking functionality/scale
├── Prompt Caching (cost, latency)
├── AGENTIC.md Config File (project conventions)
└── Plan Mode (user trust, change prevention)

P1 ─── Feature Parity
├── Parallel Tool Execution (speed)
├── @-Symbol Context Referencing (precision)
├── Enhanced Diff Viewer (UX)
└── Output Styles / Personas (customization)

P2 ─── Production Hardening
├── Git Worktree Sandboxing (safety)
├── AGENTIC.md Auto-Generation (onboarding)
├── Cross-Session Context Persistence (continuity)
└── ToolSearch Dynamic Loading (prompt efficiency)

P3 ─── Advanced & Polish
├── Multi-Model Plan Comparison
├── Session Replay & Debugging
├── CLI Mode Enhancement
├── Performance Profiling Dashboard
└── Plugin System
```

---

# ═══════════════════════════════════════════
# P0 — CRITICAL: Blocking Functionality & Scale
# ═══════════════════════════════════════════

---

## P0.1 — Implement Prompt Caching

**Target:** Reduce provider costs by 40-60% and reduce Time-to-First-Token by 30-50% on multi-turn conversations.

### Technical Architecture

Prompt caching works on the principle that the **prefix** of the conversation (system prompt + tool definitions + project context) changes infrequently, while the **suffix** (new user messages) changes every turn. By caching the prefix's computed representation, we avoid re-processing thousands of tokens of static content on every turn.

### Implementation Plan

#### Step 1: Create Cache Manager (`src/renderer/runtime/caching/PromptCacheManager.ts`)

```typescript
interface CacheKey {
  model: string          // "claude-sonnet-4-20250514"
  role: RuntimeRole      // "coder", "manager", etc.
  systemPromptHash: string  // hash of the composed system prompt
  toolDefinitionsHash: string  // hash of the active tool definitions
  projectConfigHash: string    // hash of AGENTIC.md content
  memorySummaryHash: string    // hash of injected memory
}

interface CacheEntry {
  key: CacheKey
  cachedAt: number
  hits: number
  estimatedSavings: number  // tokens saved
}

class PromptCacheManager {
  private static CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes
  private cache = new Map<string, CacheEntry>()
  
  // Key insight: the cache is based on the PREFIX of the conversation,
  // not the entire conversation. Static content goes first.
  
  getCacheBreakpoint(messages: ChatMessage[]): number {
    // Return the index where static content ends and dynamic begins
    return messages.findIndex(m => m.role === 'user' && !this.isSystemMessage(m))
  }
  
  getOrCompute() {}
  invalidate(change: 'model' | 'tools' | 'config' | 'memory') {}
  getStats(): { hits: number; misses: number; savings: number } {}
}
```

#### Step 2: Integrate with ContextManager

In `ContextManager.ts`:
- After `assembleSystemPrompt()` computes the final system prompt, hash it
- Check `PromptCacheManager` for an existing entry
- If cache hit: reuse the cached prefix, only send the delta (new user message)
- If cache miss: send full prompt, cache the result

#### Step 3: Integrate with AgentExecutor

In `AgentExecutor.ts`:
- Before each round, check what portion of the conversation is cacheable
- Group messages into: `[cacheable_prefix, dynamic_suffix]`
- Apply cache_control headers or equivalent breakpoints based on the provider

#### Step 4: Cache Invalidation Rules

| Invariant | Invalidates Cache? |
|-----------|:------------------:|
| New user message | ❌ No (appends to suffix) |
| Model switch | ✅ Yes (compute changes) |
| Tool/MCP change | ✅ Yes (prefix changes) |
| AGENTIC.md change | ✅ Yes (prefix changes) |
| Memory injection | ✅ Yes (prefix changes) |
| Conversation compact | ✅ Rebuilds cache |
| Provider switch | ✅ Yes (compute changes) |

#### Files to Modify
- **NEW:** `src/renderer/runtime/caching/PromptCacheManager.ts`
- **MODIFY:** `src/renderer/runtime/context/ContextManager.ts` — Integrate cache check after prompt assembly
- **MODIFY:** `src/renderer/runtime/agents/AgentExecutor.ts` — Apply caching to provider calls
- **MODIFY:** `src/renderer/runtime/execution/ExecutionOrchestrator.ts` — Apply caching to direct responses
- **MODIFY:** `src/renderer/runtime/RuntimeOS.ts` — Wire cache manager into initialization
- **TEST:** `tests/caching/prompt-cache.test.ts`

#### Success Criteria
- [ ] Cache hit/miss tracking visible in runtime diagnostics
- [ ] Same conversation turn costs 50%+ less after first turn
- [ ] Cache invalidates correctly on model/role/config changes
- [ ] No regression in response quality or latency
- [ ] Tested with at least 3 different providers

---

## P0.2 — Add AGENTIC.md Project Config File

**Target:** Give users a standard, Claude Code-compatible way to define project-level conventions, architecture docs, and custom instructions that the AI automatically reads at session start.

### File Format Specification

```
AGENTIC.md (at project root)
.agentic/rules/     (for path-scoped rules)
.agentic/memory/    (auto-generated by the system)
```

#### AGENTIC.md Format

```markdown
# AgenticOS Project Configuration

<!-- This file is for PROJECT-SHARED instructions. Add .gitignore.
     For personal overrides, use AGENTIC.local.md (add to .gitignore). -->

## Build & Test
- Build: `npm run build`
- Test (unit): `npm run test`
- Test (e2e): `npx playwright test`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`

## Coding Standards
- Language: TypeScript (strict mode)
- Framework: React 18 with hooks
- Styling: TailwindCSS with utility classes
- State: Zustand stores
- Tests: Vitest with Testing Library
- Imports: Use `@/` alias for src/

## Project Structure
- `src/renderer/` — Electron renderer (React app)
- `src/main/` — Electron main process
- `src/preload/` — Electron preload scripts
- `packages/` — Shared packages (providers, ui)
- `tests/` — All test files mirroring src structure

## Architecture Rules
- No circular dependencies between stores
- All async operations must have error boundaries
- Components in `components/` are pure UI; logic in `lib/` or `hooks/`
- New features need tests before merging

## Environment
- Node >= 18
- Chrome for browser automation tests
```

#### .agentic/rules/ — Path-Scoped Rules

Files in `.agentic/rules/` can have YAML frontmatter to scope rules to paths:

```markdown
---
paths: ["src/renderer/runtime/**"]
---

# Runtime Architecture Rules
- All runtime modules use singleton pattern via `getInstance()`
- Events flow through ExecutionSessionManager — never write to stores directly
- Provider calls must use the ProviderTransport or ProviderRuntime classes
```

#### Load Order (Scope Hierarchy)

Files are loaded from broadest to most specific:

1. **Managed Policy:** `/etc/agentic-os/AGENTIC.md` (global/org-wide)
2. **User:** `~/.agentic/AGENTIC.md` (personal preferences)
3. **Project:** `./AGENTIC.md` or `./.agentic/AGENTIC.md` (team-shared)
4. **Local:** `./AGENTIC.local.md` (personal, non-shared — add to .gitignore)
5. **Path-Scoped:** `.agentic/rules/*.md` (loaded on-demand when interacting with matching paths)

### Implementation Plan

#### Step 1: Create Config Loader (`src/renderer/runtime/project-config/ConfigLoader.ts`)

```typescript
interface LoadedConfig {
  source: 'managed' | 'user' | 'project' | 'local' | 'path-rules'
  path: string
  content: string
  paths?: string[]  // for path-scoped rules
}

interface ConfigLoadResult {
  configs: LoadedConfig[]
  combined: string  // concatenated in priority order
  hash: string      // hash for cache key
}

class ConfigLoader {
  async load(workspaceRoot: string): Promise<ConfigLoadResult>
  async loadPathScoped(workspaceRoot: string, filePath: string): Promise<LoadedConfig[]>
  watch(root: string, callback: () => void): () => void  // file watcher
}
```

#### Step 2: Integrate with MemoryLoader

The existing `memory-loader.ts` already loads project memory. Extend it to also load AGENTIC.md files:

```typescript
// In memory-loader.ts
async load(workspaceRoot: string): Promise<MemoryLoadResult> {
  const config = await configLoader.load(workspaceRoot)
  // Inject AGENTIC.md content into the memory result
  // with high priority (above project rules, below built-in)
}
```

#### Step 3: Integrate with ContextManager

In `ContextManager.ts`, inject config content into the system prompt assembly:

```typescript
assembleSystemPrompt(input: ContextAssemblyInput): Promise<ContextAssemblyResult> {
  // ...
  const config = await configLoader.load(workspaceRoot)
  resolveCtx.customInstructions = [
    ...(config.configs.map(c => c.content)),
    ...(input.customInstructions ?? []),
  ]
  // ...
}
```

#### Step 4: Add Watcher for Hot-Reload

```typescript
class ConfigWatcher {
  private watchers = new Map<string, () => void>()
  
  watch(root: string, onChange: () => void): void {
    // Use chokidar or similar to watch AGENTIC.md files
    // Debounce at 500ms to avoid rapid reloads
    // Call onChange() which triggers RuntimeManager.refresh()
  }
  
  unwatch(root: string): void {}
}
```

#### Step 5: Create /init Command

Add a "Generate AGENTIC.md" button in the workspace or settings:

```typescript
async function generateAgenticMd(rootPath: string): Promise<void> {
  // 1. Detect package.json → get scripts, dependencies
  // 2. Detect tsconfig.json → get language, strictness
  // 3. Detect config files → get test framework, linter
  // 4. Generate tailored AGENTIC.md
  // 5. Write to rootPath/AGENTIC.md
}
```

#### Files to Create/Modify
- **NEW:** `src/renderer/runtime/project-config/ConfigLoader.ts`
- **NEW:** `src/renderer/runtime/project-config/ConfigWatcher.ts`
- **NEW:** `src/renderer/runtime/project-config/ConfigGenerator.ts`
- **MODIFY:** `src/renderer/runtime/project-memory/memory-loader.ts` — Integrate config loading
- **MODIFY:** `src/renderer/runtime/context/ContextManager.ts` — Inject config into prompts
- **MODIFY:** `src/renderer/runtime/RuntimeOS.ts` — Wire config watcher
- **MODIFY:** `src/renderer/lib/workspace-panel-controller.ts` — Add init actions
- **TEST:** `tests/project-config/config-loader.test.ts`
- **TEST:** `tests/project-config/config-generator.test.ts`

#### Success Criteria
- [ ] AGENTIC.md at project root is automatically loaded at session start
- [ ] Content is injected into the system prompt (visible in context usage)
- [ ] Changes to AGENTIC.md trigger config refresh within 1 second
- [ ] AGENTIC.local.md overrides AGENTIC.md
- [ ] Path-scoped rules only load when agent interacts with matching files
- [ ] Generated AGENTIC.md accurately reflects project configuration
- [ ] Config content participates in prompt caching

---

## P0.3 — Add Plan Mode (User-Facing)

**Target:** Before executing multi-step changes, the AI must present a structured markdown plan for user review and approval. This is Cursor's #1 user-facing feature for preventing incorrect changes.

### UX Flow

```
User: "Refactor the authentication module to use JWT"

     │
     ▼
[AI analyzes request]
     │
     ▼
[AI generates structured plan in markdown]
     │
     ▼
[Plan displayed in chat with Approve / Edit / Reject buttons]
     │
     ▼
User clicks "Approve"  ──► AI executes plan step by step
User clicks "Edit"     ──► Opens editor for user to modify plan
User clicks "Reject"   ──► Cancels execution
```

### Plan Format

```markdown
# Implementation Plan: JWT Authentication Refactor

## Overview
Replace the existing session-based auth with JWT-based authentication across the backend and frontend.

## Files to Modify
1. `src/auth/AuthService.ts` — Add JWT token generation and validation
2. `src/middleware/auth.ts` — Replace session check with JWT verification
3. `src/routes/api.ts` — Update route handlers for new auth flow
4. `src/renderer/stores/auth-store.ts` — Update client-side auth logic

## Step-by-Step

### Step 1: Add JWT utilities (AuthService.ts)
- Import `jsonwebtoken` library
- Add `generateToken(userId, role)` function
- Add `verifyToken(token)` function
- Add `refreshToken(oldToken)` function
- **Files affected:** 1 file, ~60 lines added

### Step 2: Update middleware (auth.ts)  
- Replace `req.session.user` with `req.headers.authorization` parsing
- Add JWT verification middleware
- Add role-based access control helper
- **Files affected:** 1 file, ~40 lines modified

### Step 3: Update routes (api.ts)
- Remove session middleware from all routes
- Add JWT middleware to protected routes
- Update error responses for token expiry
- **Files affected:** 1 file, ~15 lines modified

### Step 4: Update frontend stores (auth-store.ts)
- Store JWT token in localStorage instead of cookies
- Add token refresh logic on 401 responses
- Update login/logout flows
- **Files affected:** 1 file, ~50 lines modified

## Verification
- [ ] All existing auth tests pass
- [ ] New JWT generation/validation tests pass
- [ ] API routes respond correctly with valid/invalid tokens
- [ ] Frontend properly handles token expiry and refresh
```

### Implementation Plan

#### Step 1: Create Plan Types (`src/renderer/runtime/planning/PlanTypes.ts`)

```typescript
interface PlanStep {
  id: string
  title: string
  description: string
  filesAffected: { path: string; changeType: 'create' | 'modify' | 'delete'; summary: string }[]
  estimatedChanges: string  // "~60 lines added"
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
}

interface ImplementationPlan {
  id: string
  correlationId: string
  title: string
  overview: string
  steps: PlanStep[]
  verificationCriteria: string[]
  createdAt: number
  approvedAt?: number
  status: 'pending_review' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed'
}

interface PlanStore {
  currentPlan: ImplementationPlan | null
  setPlan(plan: ImplementationPlan): void
  approvePlan(): void
  rejectPlan(reason?: string): void
  updateStepStatus(stepId: string, status: PlanStep['status']): void
  clearPlan(): void
}
```

#### Step 2: Add Plan Mode Toggle (`src/renderer/stores/app-store.ts`)

```typescript
interface AppState {
  planMode: 'auto' | 'always' | 'never'
  setPlanMode(mode: 'auto' | 'always' | 'never'): void
}
```

- `auto`: Plan mode activates automatically for complex multi-step requests
- `always`: Plan mode on every message
- `never`: No plan mode (current behavior)

#### Step 3: Integrate with ExecutionOrchestrator

In `ExecutionOrchestrator.ts`, add a plan generation step:

```typescript
async *execute(options: ExecuteOptions): AsyncGenerator<ExecutionEvent> {
  const planMode = useAppStore.getState().planMode
  const needsPlan = planMode === 'always' || 
    (planMode === 'auto' && this.isComplexRequest(input))
  
  if (needsPlan && !options.skipPlan) {
    // Before executing, generate plan
    const plan = await this.generatePlan(input, activeRole, ctrl.signal)
    
    // Yield plan for user review and PAUSE
    yield { type: 'PLAN_PROPOSED', executionId, plan, timestamp: Date.now() }
    
    // Wait for user approval (via promise that resolves from UI)
    const approved = await this.waitForPlanApproval(plan.id, ctrl.signal)
    if (!approved) {
      yield { type: 'EXECUTION_CANCELLED', executionId, reason: 'Plan rejected by user', timestamp: Date.now() }
      return
    }
    
    yield { type: 'PLAN_APPROVED', executionId, plan, timestamp: Date.now() }
    
    // Execute plan steps sequentially
    for (const step of plan.steps) {
      yield* this.executeStep(step, options, ctrl)
    }
  } else {
    // Normal execution path
    yield* this.executeDirect(input, activeRole, ctrl, executionId)
  }
}
```

#### Step 4: Create Plan UI Component (`src/renderer/components/workspace/planning/PlanViewer.tsx`)

A React component that:
- Renders the plan as a formatted markdown document
- Shows `✅`/`⏳`/`❌` status per step during execution
- Has Approve / Edit / Reject buttons
- On Edit: opens a text editor for the user to modify the plan markdown
- On Approval: resolves the pending promise, allowing execution to continue

#### Step 5: Add Plan Timeline Events

```typescript
// In ExecutionEvent.ts
interface PlanProposedEvent {
  type: 'PLAN_PROPOSED'
  executionId: string
  plan: ImplementationPlan
  timestamp: number
}

interface PlanApprovedEvent {
  type: 'PLAN_APPROVED'
  executionId: string
  plan: ImplementationPlan
  timestamp: number
}

interface PlanRejectedEvent {
  type: 'PLAN_REJECTED'
  executionId: string
  planId: string
  reason?: string
  timestamp: number
}
```

#### Files to Create/Modify
- **NEW:** `src/renderer/runtime/planning/PlanTypes.ts`
- **NEW:** `src/renderer/runtime/planning/PlanGenerator.ts` — AI prompt for plan generation
- **NEW:** `src/renderer/components/workspace/planning/PlanViewer.tsx`
- **NEW:** `src/renderer/components/workspace/planning/PlanStepCard.tsx`
- **NEW:** `src/renderer/stores/plan-store.ts`
- **MODIFY:** `src/renderer/runtime/ExecutionEvent.ts` — Add plan events
- **MODIFY:** `src/renderer/runtime/execution/ExecutionOrchestrator.ts` — Add plan generation and execution
- **MODIFY:** `src/renderer/runtime/sessions/ExecutionSessionManager.ts` — Handle plan events
- **MODIFY:** `src/renderer/components/workspace/chat-panel.tsx` — Wire plan approval UI
- **MODIFY:** `src/renderer/stores/app-store.ts` — Add planMode setting
- **TEST:** `tests/planning/plan-generator.test.ts`
- **TEST:** `tests/planning/plan-execution.test.ts`

#### Success Criteria
- [ ] User can toggle plan mode (auto/always/never)
- [ ] Plan is generated and displayed before any code changes
- [ ] User can approve, edit, or reject the plan
- [ ] Rejected plan cancels execution
- [ ] Edited plan is used for execution
- [ ] Plan steps are tracked with status during execution
- [ ] Works with both direct and multi-agent execution
- [ ] Plan mode in "auto" correctly detects complex requests

---

# ═══════════════════════════════════════════
# P1 — FEATURE PARITY: Claude Code / Cursor Level
# ═══════════════════════════════════════════

---

## P1.1 — Implement Selective Parallel Tool Execution

**Target:** Speed up research-heavy tasks by 2-3x by running independent read-only tools (Grep, Glob, ReadFile, SearchContent) in parallel, while keeping write tools (WriteFile, EditFile, Bash) sequential.

### Architecture

```typescript
class ToolExecutionScheduler {
  // Partition tools into independent groups
  schedule(toolCalls: ToolCall[]): ToolCallGroup[] {
    const groups: ToolCallGroup[] = []
    const pending = [...toolCalls]
    
    while (pending.length > 0) {
      const group: ToolCall[] = []
      let i = 0
      while (i < pending.length) {
        if (this.canRunInParallel(group, pending[i])) {
          group.push(pending.splice(i, 1)[0])
        } else {
          i++
        }
      }
      groups.push({ tools: group, runSequentiallyWithin: false })
    }
    
    return groups
  }
  
  private canRunInParallel(existing: ToolCall[], next: ToolCall): boolean {
    // Read-only tools (Grep, Glob, ReadFile, SearchContent) can run in parallel
    // Write tools (WriteFile, EditFile, Bash) must be sequential
    // Browser tools can run in parallel with file tools but not with each other
    
    if (existing.length === 0) return true
    
    const nextIsReadOnly = READ_ONLY_TOOLS.has(next.function.name)
    return existing.every(t => 
      READ_ONLY_TOOLS.has(t.function.name) === nextIsReadOnly
    )
  }
}
```

### Implementation Plan

**Step 1:** Define tool categories in `AgentExecutor.ts`
- Read-only: `read_file`, `grep_files`, `glob_files`, `search_content`, `web_search`, `web_fetch`
- Write: `write_file`, `edit_file`, `run_command`, `bash`
- Browser: all browser tools (parallel with file tools, sequential with each other)

**Step 2:** Modify tool execution loop to batch calls by category

**Step 3:** Add concurrency limit (default: 3 parallel read operations)

**Step 4:** Update timeline events to show parallel tool groups

#### Files to Modify
- **MODIFY:** `src/renderer/runtime/agents/AgentExecutor.ts` — Add scheduler, parallel execution
- **MODIFY:** `src/renderer/components/workspace/timeline/step-card.tsx` — Show parallel groups
- **TEST:** `tests/agent-system/parallel-tools.test.ts`

#### Success Criteria
- [ ] Read-only tools execute in parallel (observable via faster execution)
- [ ] Write tools still execute sequentially
- [ ] No race conditions or data corruption
- [ ] Timeline correctly shows parallel execution
- [ ] Concurrency limit is respected

---

## P1.2 — Add @-Symbol Context Referencing

**Target:** Allow users to type `@file`, `@folder`, `@web`, `@code` in the chat input to precisely reference context for the AI, matching Cursor's developer workflow.

### Syntax Specification

```
@file src/renderer/runtime/context/ContextManager.ts
  → Injects the full file content into the AI's context

@folder src/renderer/runtime/
  → Injects the directory listing and structure

@web https://react.dev/reference/react/hooks
  → Fetches and injects the web page content

@code "function handleSubmit" in src/renderer/stores/
  → Searches for matching code and injects results

@lines 42-78 in src/renderer/runtime/execution/ExecutionOrchestrator.ts
  → Injects only the specified line range

@problems
  → Injects current diagnostics/problems

@git
  → Injects current git status and changes

@symbol AuthService
  → Injects the symbol definition

Combined:
@file ContextManager.ts + @lines 50-120
  → Injects only lines 50-120 of ContextManager.ts
```

### Implementation Plan

#### Step 1: Create Reference Parser (`src/renderer/lib/context-references/ReferenceParser.ts`)

```typescript
interface ContextReference {
  type: 'file' | 'folder' | 'web' | 'code' | 'lines' | 'problems' | 'git' | 'symbol'
  target: string          // "src/file.ts", "https://...", "function name"
  qualifier?: string      // line range, search query
  resolvedContent?: string
}

class ReferenceParser {
  parse(input: string): { text: string; references: ContextReference[] } {
    // Regex: @type [qualifier] [in path]
    // Example: @file ContextManager.ts
    // Example: @lines 42-78 in src/renderer/runtime/execution/ExecutionOrchestrator.ts
    // Returns clean text (with references removed) + resolved references
  }
}
```

#### Step 2: Create Reference Resolver (`src/renderer/lib/context-references/ReferenceResolver.ts`)

```typescript
class ReferenceResolver {
  async resolve(ref: ContextReference, workspaceRoot: string): Promise<string> {
    switch (ref.type) {
      case 'file': return this.resolveFile(ref.target, workspaceRoot)
      case 'folder': return this.resolveFolder(ref.target, workspaceRoot)
      case 'web': return this.resolveWeb(ref.target)
      case 'code': return this.resolveCode(ref.target, ref.qualifier, workspaceRoot)
      case 'lines': return this.resolveLines(ref.target, ref.qualifier!, workspaceRoot)
      case 'problems': return this.resolveProblems()
      case 'git': return this.resolveGit(workspaceRoot)
    }
  }
}
```

#### Step 3: Integrate with Chat Input (`src/renderer/components/workspace/timeline/composer.tsx`)

- Parse `@` references on input change
- Show an autocomplete dropdown when user types `@`
- Suggest files, folders, web URLs, symbols
- Display resolved reference as an inline chip/badge
- On send: replace `@file path` with the resolved content wrapped in markers

#### Step 4: Integrate with ContextManager

```typescript
// Before sending to agent, resolve all @-references
const parsed = referenceParser.parse(userInput)
const resolved = await Promise.all(
  parsed.references.map(ref => referenceResolver.resolve(ref, rootPath))
)
const enrichedInput = [
  parsed.text,
  ...resolved.map((content, i) => 
    `[Attached: ${parsed.references[i].type} "${parsed.references[i].target}"]\n\`\`\`\n${content}\n\`\`\``
  )
].join('\n\n')
```

#### Files to Create/Modify
- **NEW:** `src/renderer/lib/context-references/ReferenceParser.ts`
- **NEW:** `src/renderer/lib/context-references/ReferenceResolver.ts`
- **NEW:** `src/renderer/components/workspace/context-refs/ReferenceChip.tsx`
- **NEW:** `src/renderer/components/workspace/context-refs/ReferenceAutocomplete.tsx`
- **MODIFY:** `src/renderer/components/workspace/timeline/composer.tsx` — Add @-autocomplete
- **MODIFY:** `src/renderer/components/workspace/chat-panel.tsx` — Resolve before send
- **MODIFY:** `src/renderer/components/workspace/context-bar.tsx` — Show active references
- **TEST:** `tests/context-references/parser.test.ts`
- **TEST:** `tests/context-references/resolver.test.ts`

#### Success Criteria
- [ ] `@file path` injects file content with syntax highlighting
- [ ] `@folder path` injects directory listing
- [ ] `@web url` fetches and injects web page content
- [ ] `@code "query"` searches and injects results
- [ ] `@lines N-M in path` injects specific line range
- [ ] Autocomplete dropdown shows as user types `@`
- [ ] Inline chips show resolved references
- [ ] Works with multi-line input and multiple references

---

## P1.3 — Enhanced Diff Viewer

**Target:** Match Cursor's diff viewing experience — side-by-side diffs with inline accept/reject per change, not per file.

### Implementation Plan

#### Step 1: Create Diff Types (`src/renderer/lib/diff/DiffTypes.ts`)

```typescript
interface DiffChange {
  id: string
  filePath: string
  type: 'addition' | 'deletion' | 'modification'
  oldRange: { startLine: number; endLine: number }
  newRange: { startLine: number; endLine: number }
  oldContent: string
  newContent: string
  status: 'pending' | 'accepted' | 'rejected'
}
```

#### Step 2: Build Side-by-Side Diff Viewer

Using Monaco's built-in diff editor:

```typescript
// src/renderer/components/workspace/diff-viewer/SideBySideDiff.tsx
<DiffEditor
  original={change.oldContent}
  modified={change.newContent}
  language={language}
  options={{
    renderSideBySide: true,
    readOnly: true,
    enableSplitViewResizing: true,
  }}
  onMount={(editor) => {
    // Add inline "Accept" / "Reject" buttons at each change
    editor.createDecorationsCollection([
      ...this.getChangeDecorations(editor, change)
    ])
  }}
/>
```

#### Step 3: Add Inline Accept/Reject Buttons

Each change gets an overlay button group:
- **Accept** (green) — applies the change
- **Reject** (red) — discards the change
- **Edit** (blue) — opens the changed section for manual editing

#### Step 4: Integrate with Existing AiChangeOverlay

Replace the 30s timer overlay with the new side-by-side diff. The old `AiChangeOverlay` should be replaced by a proper diff panel that shows in the docking area (alongside code/browser/design).

#### Step 5: Add "Apply All" / "Reject All" / "Apply Selected" controls

#### Files to Create/Modify
- **MODIFY:** `src/renderer/components/workspace/diff-viewer/DiffViewerPane.tsx` — Full rewrite
- **NEW:** `src/renderer/components/workspace/diff-viewer/SideBySideDiff.tsx`
- **NEW:** `src/renderer/components/workspace/diff-viewer/InlineDiffActions.tsx`
- **NEW:** `src/renderer/stores/diff-store.ts` — Track pending diffs and their status
- **MODIFY:** `src/renderer/components/workspace/code-workspace.tsx` — Replace AiChangeOverlay
- **MODIFY:** `src/renderer/components/workspace/timeline/step-card.tsx` — Link to diff viewer
- **TEST:** `tests/diff-viewer/diff-store.test.ts`

#### Success Criteria
- [ ] Side-by-side Monaco diff editor for all file changes
- [ ] Per-change accept/reject buttons (not per-file)
- [ ] "Accept All" / "Reject All" controls
- [ ] Edited changes show in the diff pane automatically
- [ ] Accepted changes reflect in the file editor immediately
- [ ] Rejected changes are discarded

---

## P1.4 — Add Output Styles / Personas

**Target:** Allow users to define persistent persona configurations (like Claude Code's Output Styles) that customize how the AI behaves without modifying system prompts.

### Format

```markdown
# .agentic/presets/security-reviewer.md

## Persona
You are a senior security engineer. Be thorough and paranoid.

## Style
- Always check for OWASP Top 10 vulnerabilities
- Flag any hardcoded secrets or credentials
- Check authentication and authorization patterns
- Review data validation and sanitization

## Response Format
- Start with a security score (A-F)
- List vulnerabilities by severity (CRITICAL, HIGH, MEDIUM, LOW)
- Provide specific code snippets with fixes
- End with a summary of risk level
```

### Implementation Plan

**Step 1:** Create preset loader (`src/renderer/runtime/project-config/PresetLoader.ts`)
**Step 2:** Add preset switcher to chat panel header
**Step 3:** Inject active preset into system prompt assembly
**Step 4:** Create preset marketplace (ship with 5 defaults: default, concise, thorough, security-reviewer, architect)

#### Files to Create/Modify
- **NEW:** `src/renderer/runtime/project-config/PresetLoader.ts`
- **NEW:** `src/renderer/components/workspace/PresetSwitcher.tsx`
- **NEW:** `src/renderer/presets/*.md` (5 default presets)
- **MODIFY:** `src/renderer/runtime/context/ContextManager.ts` — Inject presets
- **MODIFY:** `src/renderer/stores/app-store.ts` — Add activePreset state

#### Success Criteria
- [ ] Presets are loadable from `.agentic/presets/`
- [ ] User can switch presets from the chat header
- [ ] Active preset affects AI behavior
- [ ] 5 default presets ship with the product

---

# ═══════════════════════════════════════════
# P2 — PRODUCTION HARDENING
# ═══════════════════════════════════════════

---

## P2.1 — Git Worktree Sandboxing

**Target:** Before an agent makes edits, create a git worktree. Apply changes there, then create a diff for user review. User approves before merging. This prevents catastrophic errors.

### Architecture

```typescript
class WorktreeSandbox {
  async create(workspaceRoot: string, taskId: string): Promise<Sandbox> {
    // 1. git branch agentic-sandbox-{taskId}
    // 2. git worktree add ../agentic-sandbox-{taskId} agentic-sandbox-{taskId}
    // 3. Return sandbox context with isolated path
  }
  
  async getDiff(sandbox: Sandbox): Promise<DiffResult> {
    // git diff main...agentic-sandbox-{taskId}
    // Return structured diff with per-file changes
  }
  
  async merge(sandbox: Sandbox): Promise<void> {
    // git checkout main
    // git merge agentic-sandbox-{taskId}
    // git worktree remove ../agentic-sandbox-{taskId}
    // git branch -D agentic-sandbox-{taskId}
  }
  
  async discard(sandbox: Sandbox): Promise<void> {
    // git worktree remove ../agentic-sandbox-{taskId}
    // git branch -D agentic-sandbox-{taskId}
  }
}
```

### UX Flow

```
Agent wants to edit files
     │
     ▼
Create git worktree
     │
     ▼
Agent edits files in worktree
     │
     ▼
Generate diff of all changes
     │
     ▼
Show diff to user in DiffViewerPane
     │
     ▼
User approves  ──► Merge worktree to main
User rejects   ──► Discard worktree
```

### Implementation Considerations

- **Non-blocking:** If there's no git repo, fall back to direct editing (current behavior)
- **Performance:** Worktree creation is fast (<100ms) for small changes
- **Conflicts:** If merge fails, show conflict markers inline
- **Edge case:** User has uncommitted changes → stash them, apply worktree, then pop

#### Files to Create/Modify
- **NEW:** `src/renderer/lib/git/WorktreeSandbox.ts`
- **MODIFY:** `src/renderer/runtime/agents/AgentExecutor.ts` — Wire sandbox before edits
- **MODIFY:** `src/renderer/components/workspace/diff-viewer/DiffViewerPane.tsx` — Show sandbox diff
- **MODIFY:** `src/renderer/stores/workspace-store.ts` — Add sandbox state
- **TEST:** `tests/git/worktree-sandbox.test.ts`

#### Success Criteria
- [ ] Worktree is created before agent edits
- [ ] All agent edits go to the worktree
- [ ] Diff is presented to user for review
- [ ] User can approve (merge) or reject (discard)
- [ ] Falls back to direct editing if no git repo
- [ ] Handles uncommitted user changes gracefully

---

## P2.2 — AGENTIC.md Auto-Generation (init Command)

**Target:** When a user opens a new workspace, automatically scan the project and generate a tailored AGENTIC.md. Like Claude Code's `/init` command but automatic.

### Implementation Plan

**Step 1:** Create scanner (`src/renderer/runtime/project-config/ProjectScanner.ts`)
```typescript
class ProjectScanner {
  async scan(rootPath: string): Promise<ProjectProfile> {
    return {
      languages: await this.detectLanguages(rootPath),
      frameworks: await this.detectFrameworks(rootPath),
      buildTool: await this.detectBuildTool(rootPath),
      testFramework: await this.detectTestFramework(rootPath),
      lintTool: await this.detectLintTool(rootPath),
      packageManager: await this.detectPackageManager(rootPath),
      structure: await this.detectProjectStructure(rootPath),
    }
  }
  
  private async detectLanguages(root: string): Promise<string[]> {
    // Count file extensions, return dominant ones
    // .ts, .tsx → TypeScript, .py → Python, etc.
  }
  
  private async detectFrameworks(root: string): Promise<string[]> {
    // Check package.json dependencies
    // react, next, vue, svelte, express, etc.
  }
  
  private async detectBuildTool(root: string): Promise<string> {
    // Check for vite.config, webpack.config, next.config, etc.
  }
  
  private async detectTestFramework(root: string): Promise<string> {
    // Check for vitest, jest, mocha, playwright, cypress
    // Check test/ directory, *.test.ts files
  }
  
  private async detectProjectStructure(root: string): Promise<ProjectStructure> {
    // src/ → packages/ → lib/ → type of project
  }
}
```

**Step 2:** Create CLI-style `init` action accessible from UI
**Step 3:** Offer auto-generation on first workspace open
**Step 4:** Write the generated AGENTIC.md to project root

#### Files to Create/Modify
- **NEW:** `src/renderer/runtime/project-config/ProjectScanner.ts`
- **NEW:** `src/renderer/runtime/project-config/ConfigGenerator.ts`
- **MODIFY:** `src/renderer/pages/code-canvas.tsx` — Trigger on first workspace visit
- **MODIFY:** `src/renderer/components/workspace/chat-panel.tsx` — Add init action

#### Success Criteria
- [ ] First-time workspace open triggers config generation prompt
- [ ] Generated AGENTIC.md accurately reflects project tech stack
- [ ] User can regenerate at any time
- [ ] Existing AGENTIC.md is not overwritten without confirmation

---

## P2.3 — Cross-Session Context Persistence

**Target:** At the end of every session, the system automatically summarizes key decisions, patterns, and learnings into `.agentic/memory/`. Next session starts with full context.

### Architecture

```typescript
class SessionMemoryExtractor {
  async extract(session: ExecutionSession): Promise<SessionSummary> {
    return {
      objective: session.input,
      keyDecisions: await this.extractDecisions(session.events),
      filesModified: await this.extractFiles(session.events),
      patternsDiscovered: await this.extractPatterns(session.events),
      errorsEncountered: await this.extractErrors(session.events),
      conventionsLearned: await this.extractConventions(session.events),
      pendingWork: await this.extractPending(session.events),
    }
  }
  
  private async extractDecisions(events: ExecutionEvent[]): Promise<Decision[]> {
    // Look for AGENT_ASSIGNED → MESSAGE_COMPLETE patterns
    // Extract architectural decisions from agent responses
  }
}
```

### Storage

```markdown
# .agentic/memory/sessions/2026-06-15-jwt-auth-refactor.md

## Session Summary
- **Objective:** Refactor authentication to use JWT
- **Duration:** 12m 34s
- **Files Modified:** 4 (AuthService.ts, auth.ts, api.ts, auth-store.ts)

## Key Decisions
- Used `jsonwebtoken` library (v9.0.0) for token generation
- Token expiry set to 1 hour with 7-day refresh tokens
- Frontend stores tokens in httpOnly cookies via the backend, not localStorage

## Patterns Discovered
- Auth middleware pattern: chain of responsibility with middleware array
- Rate limiting should be applied before auth middleware

## Conventions Learned
- Error responses use format: `{ error: string, code: number }`
- All auth-related types go in `src/types/auth.ts`

## Pending Work
- [ ] Add token revocation endpoint
- [ ] Add refresh token rotation
```

### Implementation Plan

**Step 1:** Create SessionMemoryExtractor (`src/renderer/runtime/memory/SessionMemoryExtractor.ts`)
**Step 2:** Create session memory writer (writes to `.agentic/memory/sessions/`)
**Step 3:** Create session memory loader (loads last N sessions on startup)
**Step 4:** Integrate with MemoryArchitecture (store sessions as memories)
**Step 5:** Add session memory injection to ContextManager

#### Success Criteria
- [ ] Session summaries are automatically generated after each execution
- [ ] Summaries are stored in `.agentic/memory/sessions/`
- [ ] Last 5 sessions are loaded on startup
- [ ] Session memory is injected into the system prompt
- [ ] Content is relevant and useful (not noisy)

---

## P2.4 — ToolSearch / Dynamic Tool Loading

**Target:** Allow agents to dynamically discover and load tools based on task needs, rather than carrying all 30+ tool definitions in every prompt.

### Implementation Plan

**Step 1:** Add ToolSearch capability to AgentExecutor

After receiving the user's input, before the first round:
1. Generate embeddings/tags from the user input
2. Match against tool descriptions
3. Only load the top-N most relevant tool definitions
4. Keep "always-load" tools (read_file, write_file, run_command)

**Step 2:** Create tool tagging system

```typescript
const TOOL_TAGS: Record<string, string[]> = {
  read_file: ['always', 'file', 'read'],
  write_file: ['always', 'file', 'write'],
  edit_file: ['always', 'file', 'edit'],
  grep_files: ['research', 'search'],
  bash: ['execution', 'command'],
  browser_navigate: ['browser', 'web'],
  web_search: ['research', 'web', 'search'],
  // ...
}
```

**Step 3:** Create relevance matcher

```typescript
class ToolRelevanceMatcher {
  match(input: string, tools: AgentTool[]): AgentTool[] {
    const always = tools.filter(t => t.tags.includes('always'))
    const inputTags = this.extractTags(input)
    const relevant = tools.filter(t => 
      t.tags.some(tag => inputTags.includes(tag))
    )
    return [...always, ...relevant].slice(0, MAX_TOOLS)
  }
}
```

#### Success Criteria
- [ ] Only relevant tools are loaded per turn
- [ ] "Always" tools are never excluded
- [ ] Token savings measurable (10-30% reduction per prompt)
- [ ] No tool needed is ever missing

---

# ═══════════════════════════════════════════
# P3 — ADVANCED & POLISH
# ═══════════════════════════════════════════

---

## P3.1 — Multi-Model Plan Comparison

Allow the agent to query 2+ models for plan generation, compare results, and let the user pick the best plan. This leverages AgenticOS's multi-provider support.

## P3.2 — Session Replay & Debugging

Build a session replay tool (UI) that lets developers replay agent execution step-by-step — seeing every tool call, response, and state change. The `ObservabilityManager` and `DeterministicToolRecorder` already capture this data.

## P3.3 — CLI Mode Enhancement

The headless CLI (`src/cli/headless.ts`) exists but is basic. Enhance it to match Claude Code's terminal-first experience with:
- Colored output with syntax highlighting
- Streaming token display
- Progress bars for long operations
- Interactive mode with readline

## P3.4 — Performance Profiling Dashboard

Create a `/performance` route showing:
- Provider call latency (per model)
- Token usage over time
- Tool execution duration distribution
- Cache hit rates
- Agent pipeline bottlenecks

## P3.5 — Plugin System

Allow external plugins to register new tools, MCP servers, and UI components. The `RuntimeOS` and `ToolRegistry` already support this — just need a plugin discovery mechanism and UI.

---

# ═══════════════════════════════════════════
# APPENDIX: File Dependency Graph
# ═══════════════════════════════════════════

```
                    ┌─────────────────────────┐
                    │   RuntimeOS (Hub)        │
                    │   - ToolRegistry         │
                    │   - PermissionEngine     │
                    │   - MCPRegistry          │
                    │   - SkillRegistry        │
                    └────────┬───────┬─────────┘
                             │       │
              ┌──────────────┘       └──────────────┐
              │                                     │
     ┌────────▼────────┐                  ┌─────────▼─────────┐
     │ ContextManager   │                  │ AgentExecutor      │
     │ - ConfigLoader   │                  │ - ToolScheduler    │
     │ - TokenBudget    │                  │ - ProviderTransport │
     │ - Compactor      │                  │ - Cached rounds    │
     │ - PromptCache    │                  │ - WorktreeSandbox  │
     └────────┬────────┘                  └─────────┬─────────┘
              │                                     │
     ┌────────▼────────┐                  ┌─────────▼─────────┐
     │ ExecutionOrch.  │◄─────────────────│ ExecutionSessionMgr│
     │ - Plan Mode      │                 │ - Event handler    │
     │ - Goal Loop      │                 │ - Session lifecycle│
     │ - Delegation     │                 │ - Observability    │
     └────────┬────────┘                  └─────────┬─────────┘
              │                                     │
              └──────────────┬──────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   UI (React)    │
                    │ - ChatPanel     │
                    │ - CodeWorkspace │
                    │ - BrowserWS     │
                    │ - DesignWS      │
                    │ - PlanViewer    │
                    │ - DiffViewer    │
                    └─────────────────┘
```

---

# ═══════════════════════════════════════════
# APPENDIX: Test Strategy
# ═══════════════════════════════════════════

Each major feature must have:

| Test Layer | Coverage | Framework |
|------------|----------|-----------|
| **Unit tests** | Core logic, pure functions | Vitest |
| **Integration tests** | Module interactions, event flow | Vitest + Testing Library |
| **Component tests** | UI rendering, user interactions | Vitest + Testing Library |
| **E2E tests** | Full workflow, multi-step execution | Playwright |

### Minimum Test Scenarios Per Feature

**Prompt Caching:**
- Cache hit returns cached content
- Cache miss computes fresh content
- Cache invalidates on model change
- Cache invalidates on config change
- Multiple turns correctly use cache

**AGENTIC.md:**
- File loaded at session start
- Content injected into system prompt
- AGENTIC.local.md overrides AGENTIC.md
- Path-scoped rules only load on matching paths
- File watcher triggers refresh on change

**Plan Mode:**
- Plan generated and displayed before execution
- User approval allows execution
- User rejection cancels execution
- Edited plan is executed
- Plan steps tracked with status

**Parallel Tools:**
- Read-only tools execute in parallel
- Write tools execute sequentially
- Mixed read/write groups correctly partitioned
- Concurrency limit respected
- No race conditions

---

# ═══════════════════════════════════════════
# APPENDIX: Implementation Ordering
# ═══════════════════════════════════════════

The recommended implementation order prioritizes features that build on each other:

```
Phase 1 ── Foundation
1. Prompt Caching (P0.1) — needs no other feature
2. AGENTIC.md Config (P0.2) — independent but enhances caching

Phase 2 ── User-Facing Value
3. Plan Mode (P0.3) — requires AGENTIC.md context for better plans
4. @-Symbol Context (P1.2) — independent, immediate UX improvement

Phase 3 ── Speed & Precision
5. Parallel Tool Execution (P1.1) — independent, algorithmic
6. Output Styles (P1.4) — requires AGENTIC.md infrastructure

Phase 4 ── Safety & Polish
7. Git Worktree Sandbox (P2.1) — requires Plan Mode for UX
8. Enhanced Diff Viewer (P1.3) — requires Git Sandbox for full value

Phase 5 ── Intelligence
9. Cross-Session Context (P2.3) — requires MemoryArchitecture
10. Auto-Generate Config (P2.2) — requires AGENTIC.md already working

Phase 6 ── Optimization
11. ToolSearch (P2.4) — independent optimization
12. Advanced Features (P3.x) — all dependencies met
```

---

# ═══════════════════════════════════════════
# APPENDIX: Risk Assessment
# ═══════════════════════════════════════════

| Feature | Risk Level | Risks | Mitigation |
|---------|:----------:|-------|------------|
| Prompt Caching | 🟢 Low | Cache invalidation bugs → stale responses | Robust hash computation, TTL expiry |
| AGENTIC.md | 🟢 Low | File not found, permission errors | Graceful fallback, default content |
| Plan Mode | 🟡 Medium | Plan generation timeout on complex tasks | Configurable timeout, streaming plan |
| Parallel Tools | 🟡 Medium | Race conditions on shared resources | Strict read-only vs write separation |
| @-Symbol Context | 🟢 Low | Parsing edge cases, large file injection | Truncation at token limit, regex testing |
| Enhanced Diff | 🟡 Medium | Monaco diff editor loading, large diffs | Virtualization, chunked rendering |
| Output Styles | 🟢 Low | Style conflict with system prompts | Priority ordering (user styles override) |
| Git Worktree | 🔴 High | Git operations failing, merge conflicts | Robust error handling, manual merge fallback |
| Cross-Session Memory | 🟡 Medium | Memory bloat, irrelevant context | Max N sessions, relevance scoring |
| ToolSearch | 🟢 Low | Missing relevant tools | Always-load set for critical tools |

---

*This plan is a living document. Update it as features are completed, priorities shift, or new requirements emerge.*
