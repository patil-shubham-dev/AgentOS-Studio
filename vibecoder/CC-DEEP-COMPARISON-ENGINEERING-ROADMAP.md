# Claude Code Deep Comparison — AgenticOS Engineering Roadmap

**Generated:** 2026-07-09  
**Scope:** Complete analysis of Claude Code CLI leaked source (1902 files) vs AgenticOS  
**Purpose:** Single source of truth for every architectural difference, every bug found, and every improvement needed — in execution priority order  
**Core immutables (AgenticOS identity):**  
1. Multi-model, multi-provider under one hood (non-negotiable)  
2. Claude Code–level UI/UX with IDE-type feel (VS Code tier)  
3. Feature variety beyond coding (Agentic Browser, Design System, Device Agentic Harness) — but current focus is coding/vibe-coding only  

---

## How to use this document

This is a **priority-ordered engineering execution map**. Work it top to bottom, tier by tier. Each section contains:

- **What Claude Code does** (from 1902-file deep-dive of leaked src)  
- **What AgenticOS does** (from full codebase analysis)  
- **The gap** (exact delta, not generic "improve this")  
- **The fix** (exact code changes, file paths, patterns)  
- **Why this order** (dependency chain — some fixes unlock others)  

Every P0 bug has a verified file path and line number. Every improvement is scoped to a specific subsystem.

---

## TIER P0 — BREAKING BUGS (fix before anything else)

These are verified bugs in AgenticOS that break core functionality. Fix them first — no feature work starts until these are resolved.

---

### P0.1 EditFileTool never writes to disk

**Severity:** CATASTROPHIC — the AI believes it edited files, but nothing was written

**File:** `src/renderer/runtime/tools/implementations/EditFileTool.ts`  
**Evidence path:** `execute()` method → generates patch via `applyEdits()` → records in `ChangeSet` → **never calls `fsWrite()`**

**What happens:** When the AI says "I edited app.tsx", the file on disk is unchanged. The ChangeSet records the intention, but no filesystem write ever occurs. The UI may show the change in the diff viewer, but on disk it's a lie.

**Root cause:** The `EditFileTool` was designed as a "staging" tool that works through ChangeSets, and someone forgot the final write step when extracting it from an earlier pipeline. The `WriteFileTool` writes to disk correctly, but the `EditFileTool` does not.

**Fix:**
```typescript
// In EditFileTool.ts execute() — after applyEdits() succeeds:
const result = applyEdits(originalContent, edits)
if (!result.success) {
  return toolResultError(`Edit failed: ${result.error}`)
}
// === CRITICAL: Write to disk ===
await fsWrite(absolutePath, result.content)  // <-- MISSING LINE
// === THEN record in ChangeSet ===
changesetByTrace.get(ctx.traceId)?.push({
  type: 'edit',
  filePath: absolutePath,
  originalContent,
  newContent: result.content,
  edits,
})
```

**Verification:**  
1. Open a file in the editor  
2. Ask the AI to edit it  
3. Close and re-open the file — the edit should persist  

**Depends on:** Nothing (standalone bug fix)

---

### P0.2 workspace-store.ts calls undefined saveSession()

**Severity:** HIGH — workspace state is never persisted on close

**File:** `src/renderer/stores/workspace-store.ts`, line ~640  
**Evidence:** `saveSession?.()` called in `closeWorkspace()` action — `saveSession` is **never defined** anywhere in the store, its closure, or its initialization

**What happens:** When the user closes the workspace, the open files, cursor positions, dirty flags, and split editor state are silently discarded. The localStorage round-trip (`loadWorkspaceConfig` / `persistWorkspaceState`) still works, but the `closeWorkspace` path which is supposed to trigger persistence does nothing.

**Root cause:** Either `saveSession` was removed during a refactor and the call site wasn't updated, or it was planned but never implemented.

**Fix:**
```typescript
// Option A (if persistence is desired on close):
const saveSession = () => {
  persistWorkspaceState({
    rootPath: get().rootPath,
    openFiles: get().openFiles,
    activeFile: get().activeFile,
    pinnedFiles: get().pinnedFiles,
    splitState: get().splitState,
  })
}

// Option B (if closeWorkspace should not persist):
// Remove the dead call entirely:
// saveSession?.();  // DELETE THIS LINE
```

**Verification:**  
1. Open files, split editor, set cursor positions  
2. Close workspace  
3. Re-open same workspace — state should be restored (Option A) or clean slate (Option B)  

**Depends on:** Nothing

---

### P0.3 CommandExecutionPolicy catch-all regex makes downstream rules unreachable

**Severity:** HIGH — network download command safety checks are dead code  

**File:** `src/renderer/runtime/tools/policies/CommandExecutionPolicy.ts`  
**Evidence:** Array of `{ pattern, tier }` rules. The final entries include `{ pattern: /./, tier: "ask" }` (catch-all) before other rules like `{ pattern: /^curl\s+/, tier: "ask" }` and network fetch rules. Since `/./` matches every string, the curl/fetch rules are unreachable.

**What happens:** All unrecognized commands are treated as "ask" (same as the catch-all), but specific ask-worthy patterns like `curl`, `wget`, and network-download commands are never checked — they are already matched by the catch-all. This means the system can't apply different policies to network commands vs. other unknown commands. Additionally, if you add a "deny" rule for a specific pattern AFTER the catch-all, it will be silently ignored.

**Root cause:** Rules are ordered by perceived frequency/importance rather than by specificity. The catch-all is placed in the middle of the array instead of at the end.

**Fix:**
```typescript
// Reorder rules: most specific first, catch-all absolute last
const COMMAND_TIER_RULES = [
  // ... existing specific rules ...
  { pattern: /^curl\s+/i, tier: 'ask' },
  { pattern: /^wget\s+/i, tier: 'ask' },
  { pattern: /^npm\s+(publish|unpublish|remove|delete)\b/, tier: 'deny', reason: 'Destructive npm commands require explicit approval' },
  // ... more specific rules ...
  // CATCH-ALL — MUST BE LAST
  { pattern: /./, tier: 'ask' },
]
```

**Verification:** Unit test: `evaluateCommandPolicy('curl https://evil.com')` should match the curl rule, not the catch-all.

**Depends on:** Nothing

---

### P0.4 ToolValidation.ts does not check required fields

**Severity:** HIGH — tools with required fields silently accept missing values  

**File:** `src/renderer/runtime/tools/execution/ToolValidation.ts`  
**Evidence:** `validate()` checks type, ranges, enums, patterns — but NOT required fields. `validateRequiredFields()` exists as a separate method but is never called by `ToolExecutionPipeline.execute()`.

**What happens:** If a tool defines `file_path` as required but the model omits it, the validation passes. The tool receives `undefined` for the path and may crash with an unhelpful error, or worse, resolve it to the current working directory and modify the wrong file.

**Root cause:** `validateRequiredFields()` was extracted as a separate concern during refactoring, but the pipeline was not updated to call it.

**Fix:**
```typescript
// In ToolExecutionPipeline.ts, inside execute(), after the tool is resolved:
const validator = new ToolValidator(tool.inputSchema)
const validationResult = validator.validate(input)
if (validationResult !== true) {
  return { error: `Validation failed: ${validationResult}` }
}
// ADD THIS LINE:
const requiredResult = validator.validateRequiredFields(input)
if (requiredResult !== true) {
  return { error: `Missing required fields: ${requiredResult}` }
}
```

**Verification:** Unit test: tool with required `file_path` omitted should fail validation.

**Depends on:** Nothing

---

### P0.5 WebSearchTool scrapes Google HTML directly (fragile + against ToS)

**Severity:** HIGH — will break without warning, violates Google ToS  

**File:** `src/renderer/runtime/tools/implementations/WebSearchTool.ts`  
**Evidence:** Uses `fetch()` to get raw Google search results, then regex parses the HTML to extract titles, URLs, and snippets.

**What happens:** When Google updates their search result page HTML (which happens multiple times per year), the regex patterns break silently. The tool returns empty results with no error. Additionally, scraping Google violates their Terms of Service and could result in IP blocks.

**Root cause:** No search API was available at implementation time, so scraping was used as a shortcut.

**Fix:** Replace with a proper search API. Two options:

**Option A — Built-in (recommended for now):**
```typescript
// Replace Google scraping with a duckduckgo-search NPM package
// Simple, no API key needed, good results
import { search } from 'duckduckgo-search'
const results = await search(query)
return results.slice(0, maxResults).map(r => ({
  title: r.title,
  url: r.url,
  snippet: r.description,
}))
```

**Option B — Configurable search provider (preferred long-term):**
```typescript
// Add to ToolContext: searchProvider
// Users configure in settings: google-api, bing-api, serpapi, duckduckgo
// The tool delegates to the configured provider
switch (ctx.searchProvider) {
  case 'google-api': return googleSearch(query, ctx.googleApiKey)
  case 'serpapi': return serpApiSearch(query, ctx.serpApiKey)
  case 'duckduckgo': return duckDuckGoSearch(query)
  default: return duckDuckGoSearch(query) // built-in fallback
}
```

**Verification:** Send "search for latest TypeScript version" — should return real results, not HTML soup.

**Depends on:** Nothing (though Option B depends on a config store for `searchProvider`)

---

### P0.6 changesetByTrace module-level Map never garbage-collected

**Severity:** MEDIUM-HIGH — memory leak over long sessions  

**File:** `src/renderer/runtime/tools/implementations/WriteFileTool.ts` (and likely `EditFileTool.ts` as well)  
**Evidence:**  
```typescript
const changesetByTrace = new Map<string, ChangeSetEntry[]>()
```
This Map lives at module scope. Every execution creates a new traceId. New entries are **pushed** to the existing array. No cleanup logic exists.

**What happens:** Over a session with hundreds of actions, the Map accumulates entries for every traceId ever seen. Each entry holds `originalContent` (potentially large file contents). Memory usage grows without bound.

**Root cause:** The Map was designed for a single-session architecture where the process ends after each session. In AgenticOS (long-running desktop app), this never happens.

**Fix:**
```typescript
// Option A — LRU eviction:
const changesetByTrace = new LRUMap<string, ChangeSetEntry[]>({
  maxSize: 500,  // Keep last 500 execution traces
  maxAge: 30 * 60 * 1000,  // 30 minute TTL
})

// Option B — Manual cleanup hook (preferred — integrates with execution lifecycle):
// In ToolExecutionPipeline.ts, at the end of execute(), add:
executionCleanupHooks.push(() => {
  const traceId = ctx.traceId
  WriteFileTool.clearChangesetForTrace(traceId)
  EditFileTool.clearChangesetForTrace(traceId)
})

// Option C — Session boundaries:
// When a new session starts (e.g., /clear or new workspace):
resetChangesetByTrace()
```

**Verification:** Open DevTools memory profiler, run 1000+ tool calls, check for Map growth.

**Depends on:** Nothing

---

## TIER P1 — CRITICAL ARCHITECTURAL GAPS

These are not bugs but missing capabilities that directly impact code quality, user trust, or feature completeness. They block downstream work.

---

### P1.1 Add search-and-replace FileEditTool (modeled on Claude Code)

**Impact:** Core coding ability — safer editing, fewer file corruptions  
**Effort:** Large (new tool + validation + UI integration)  

**Why:** Claude Code's `FileEditTool` uses **search-and-replace** (`old_string` / `new_string`) which is fundamentally safer than diff-based editing. The AI says "find this exact text and replace with this". If the text moved, the edit fails cleanly instead of applying a patch to wrong lines.

**Current state:** AgenticOS has diff-based `EditFileTool` (which doesn't write to disk — see P0.1), but no search-and-replace tool.

**Required capabilities (copy from Claude Code):**

1. **Input schema:**
```typescript
{
  file_path: string          // Absolute path to file
  old_string: string         // Exact text to find (must be unique in file)
  new_string: string         // Replacement text (must differ from old_string)
  replace_all?: boolean      // Allow multiple matches (default: false)
}
```

2. **Validation pipeline (layered, fail-closed):**
   - Path normalization: handle Windows `/` vs `\` (use `expandPath()`)
   - Secret scanning: reject edits that introduce credentials in team-memory files
   - No-op rejection: `old_string === new_string` → fail fast
   - File size limit: reject files > 1 GiB (OOM prevention)
   - Encoding detection: read bytes, check BOM for UTF-16LE vs UTF-8
   - File existence: if file doesn't exist and `old_string === ''` → new file creation (valid)
   - Empty file creation: reject if file has content but `old_string === ''`
   - Stale-read detection: compare file mtime to read timestamp → reject if modified since read
   - Quote normalization: handle curly/smart quotes → straight for matching, then preserve file's quote style in output
   - Multiple-match detection: if >1 match and `replace_all === false`, error with guidance
   - De-sanitization: Claude can't output `<function_results>` (API strips it), so it outputs `<fnr>` — detect and convert back

3. **Execution:**
   - Read file from disk (synchronous, inside critical section)
   - Find exact `old_string` match
   - If not found, try normalized-quote matching
   - If still not found, try de-sanitized matching
   - Apply replacement → generate structured diff hunks
   - Write to disk (preserving original encoding)
   - Notify LSP servers (`didChange` + `didSave`)
   - Update read-state timestamp (prevent subsequent stale-read errors)
   - Return: `{ filePath, oldString, newString, structuredPatch, isNewFile }`

4. **Prompt (how to tell the AI to use it):**
   - "Before editing a file, read it first. Every edit must specify the exact `old_string` to replace."
   - "Provide enough surrounding context (2-4 lines) in `old_string` for a unique match."
   - "Prefer editing existing files over creating new ones."
   - "If you want to change multiple non-consecutive sections, make separate Edit calls."

**Verification:**  
1. Ask AI to "change the greeting in app.tsx from 'Hello' to 'Hi'"  
2. Verify the exact string is replaced, other occurrences of 'Hello' are untouched  
3. Verify the file on disk actually changed  
4. Ask to edit a file that was modified externally → should error with stale-read message  

**Depends on:** P0.1 (EditFileTool disk write — this replaces that buggy tool), P1.2 (read-before-edit enforcement)

---

### P1.2 Add read-before-edit enforcement with timestamp tracking

**Impact:** Prevents editing wrong files, race conditions, and external-edit conflicts  
**Effort:** Medium (file state cache + validation hook)  

**Why:** Claude Code enforces that a file must be READ before it can be edited. If a file was modified on disk after it was read (e.g., by the user or another tool), the edit is rejected. This prevents the AI from overwriting user changes.

**Current state:** No enforcement. The AI can edit any file at any time without having read it first.

**Implementation:**

1. **File state cache** (`src/renderer/runtime/tools/storage/FileStateCache.ts`):
```typescript
class FileStateCache {
  // Key: absolute file path
  // Value: { lastReadAt: number (mtime), lastReadContent: string, lastWriteAt: number }
  private cache = new Map<string, { lastReadAt: number; lastReadContent: string; lastWriteAt: number }>()
  
  recordRead(path: string, content: string, mtime: number): void
  recordWrite(path: string): void
  wasRead(path: string): boolean
  isStale(path: string, currentMtime: number): boolean  // true if file modified since last read
  invalidate(path: string): void
}
```

2. **Integration with ReadFileTool:** After every read, call `fileStateCache.recordRead(path, content, mtime)`

3. **Integration with EditFileTool (new, P1.1):** Before edit:
```typescript
// In validateInput():
if (!fileStateCache.wasRead(filePath)) {
  throw new ToolValidationError(
    `File "${filePath}" has not been read yet. Use ReadFileTool to read it first.`
  )
}
const currentMtime = await getMtime(filePath)
if (fileStateCache.isStale(filePath, currentMtime)) {
  throw new ToolValidationError(
    `File "${filePath}" has been modified since it was read. ` +
    `Read it again to see the latest content before editing.`
  )
}
```

4. **Windows-specific staleness handling:** On Windows, file timestamps can change without content changes (cloud sync, antivirus scanning). For full reads, do a content comparison fallback:
```typescript
if (fileStateCache.isStale(filePath, currentMtime)) {
  const currentContent = await readFile(filePath)
  if (currentContent !== fileStateCache.getContent(filePath)) {
    throw new ToolValidationError(...)
  }
  // False positive — update the timestamp without changing content
  fileStateCache.recordRead(filePath, currentContent, currentMtime)
}
```

**Depends on:** P1.1 (to have an EditFileTool that uses this)

---

### P1.3 Split UnifiedExecutor.ts into separate modules ✅

**Impact:** Maintainability, testability, ability to extend agent pipeline  
**Effort:** Large (1027-line file → 5-6 files)  

**Why:** At 1027 lines, `UnifiedExecutor.ts` is the largest file in the runtime. It mixes:  
- Agent role assignment logic  
- Plan generation and approval  
- Multi-agent pipeline orchestration  
- Single-agent fast-path execution  
- Mock mode with inline HTML/CSS/JS templates  
- Circuit breaker management  
- History deduplication and compression  
- File change extraction and synthesis  

This single file is responsible for every execution path. A bug in mock mode can break production execution. A change to the single-agent path risks the multi-agent path.

**Proposed split:**

| New file | Responsibility | Lines from UnifiedExecutor |
|----------|---------------|---------------------------|
| `AgentPipelineOrchestrator.ts` | Orchestrates the full multi-agent pipeline: research → coder → browser → ... → verification → synthesis | ~250 |
| `AgentRoleAssigner.ts` | Assigns tasks to agents via `assignAgentForTask()`, manages agent lifecycle | ~100 |
| `PlanManager.ts` | Plan generation, plan approval flow, plan feedback loop | ~150 |
| `FastPathExecutor.ts` | Single-agent fast-path execution (no planning, no verification) | ~100 |
| `MockExecutionEngine.ts` | Mock mode: file creation detection, template generation, mock event emission | ~150 |
| `ExecutionSynthesizer.ts` | Synthesizes results from multiple agents, extracts file changes | ~100 |

The remaining `UnifiedExecutor.ts` becomes a thin coordinator that delegates to these components:
```typescript
// UnifiedExecutor.ts (after split — ~150 lines)
class UnifiedExecutor {
  async execute(): AsyncGenerator<ExecutionEvent> {
    if (mockMode) return yield* new MockExecutionEngine().execute(input)
    if (fastMode) return yield* new FastPathExecutor().execute(input, context)
    
    const planner = new PlanManager(context)
    const plan = await planner.generatePlan(input)
    if (plan.needsApproval && !(await planner.requestApproval(plan))) return
    
    const orchestrator = new AgentPipelineOrchestrator(context)
    const results = await orchestrator.execute(plan)
    
    const synthesizer = new ExecutionSynthesizer(context)
    return synthesizer.synthesize(results)
  }
}
```

**Verification:** All existing execution paths (fast/full/mock/autonomous) produce identical output and events. The refactoring is purely structural — no behavioral changes.

**Depends on:** No code changes needed before this, but this is the structural prerequisite for P1.4 and P1.5.

---

### P1.4 Add context micro-compaction ✅

**Impact:** Enables long sessions (50+ turns), saves API tokens  
**Effort:** Medium  

**Why:** Without compaction, every tool result accumulates in the conversation history. After 10 turns reading and editing files, the context window is often full. Micro-compaction silently replaces old bulky tool results with short placeholders, keeping the context focused on recent activity.

**Current state:** `Compactor.ts` exists with multi-strategy compaction framework. `microCompact.ts` utility + post-hook in ToolExecutionPipeline now replace old tool result content with compacted placeholders.

**Implementation:**

1. **Compactable tool types** (same as Claude Code):
```typescript
const COMPACTABLE_TOOL_RESULTS = new Set([
  'read_file', 'bash', 'run_command',
  'grep_files', 'glob_files',
  'web_search', 'web_fetch',
  'edit_file', 'write_file',
])
```

2. **Micro-compact function** (`src/renderer/runtime/compaction/microCompact.ts`):
```typescript
function microCompact(messages: Message[]): Message[] {
  let lastUserIndex = -1
  let compactedCount = 0

  // Find the last user message — keep everything after it
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIndex = i
      break
    }
  }

  // Compact tool results before the last user message
  return messages.map((msg, i) => {
    if (i >= lastUserIndex) return msg  // Keep recent messages
    if (msg.role !== 'tool') return msg  // Only compact tool results
    
    const toolName = extractToolName(msg)
    if (!COMPACTABLE_TOOL_RESULTS.has(toolName)) return msg
    
    compactedCount++
    return {
      ...msg,
      content: `[${toolName} result from earlier — content cleared to save space]`,
      // Keep minimal metadata for UI rendering
      metadata: { ...msg.metadata, compacted: true, originalLength: msg.content?.length },
    }
  })
}
```

3. **Time-based micro-compact** (aggressive variant):
```typescript
function timeBasedMicroCompact(messages: Message[], thresholdMs = 60000): Message[] {
  const now = Date.now()
  // If user has been idle > 60s, compact ALL tool results (server cache is cold anyway)
  // ... similar to above but without the "keep recent" guard
}
```

4. **Call site:** In `ToolExecutionPipeline.execute()`, after the tool result is ready and before it's appended to history, call `microCompact` on the existing message list.

5. **Cache-preserving variant** (future, when using Anthropic API): Use `cache_edits` parameter to delete old content from the server-side prompt cache without changing the message text. This preserves cache hits.

**Verification:**  
1. Run a session with 20+ turns of file reading and editing  
2. Inspect the message array sent to the API — old tool results should be replaced with compacted markers  
3. Token count should stabilize rather than grow linearly  

**Depends on:** No code changes needed before this, but its benefit is amplified by P1.5 (auto-compact).

---

### P1.5 Add auto-compact (conversation summarization)

**Impact:** Enables indefinite sessions, prevents context-window overflow  
**Effort:** Large (summarizer agent, compact prompt, state restoration)  

**Why:** Even with micro-compaction, the conversation grows. When token count reaches ~90% of the model's context window, the system should summarize everything up to the current point and continue with a compressed history.

**Current state:** No auto-compact. The session ends when the context window is full.

**Implementation (modeled on Claude Code's `compact.ts`):**

1. **Trigger detection:**
```typescript
function shouldAutoCompact(messages: Message[], contextWindow: number): boolean {
  const estimatedTokens = estimateTokenCount(messages)
  const threshold = contextWindow - AUTOCOMPACT_BUFFER_TOKENS  // e.g., contextWindow - 13000
  return estimatedTokens >= threshold
}
```

2. **Compaction prompt** (send to a fast/cheap model):
```
Summarize the conversation below, preserving:
- The user's original request and requirements
- What files were created/modified and why
- Key decisions made (architecture, naming, trade-offs)
- What is still in progress
- Any errors encountered and their resolutions
```

3. **Compaction execution:**
```typescript
async function autoCompact(messages: Message[], context: ToolContext): Promise<Message[]> {
  // Circuit breaker: max 3 consecutive failures
  if (consecutiveCompactionFailures >= 3) return messages
  
  // Build compact prompt + original messages
  const summary = await compactModel.call(compactPrompt + serializeMessages(messages))
  if (!summary) {
    consecutiveCompactionFailures++
    return messages
  }
  
  // Create a compact boundary marker + summary message
  const compactedMessages = [
    { role: 'system', content: `[Conversation from earlier summarized below]` },
    { role: 'assistant', content: summary },
    { role: 'user', content: '[Continue from here. The summary above preserves all context needed.]' },
    // Keep the last N interactions (full fidelity for recent work)
    ...messages.slice(-PRESERVED_RECENT_MESSAGE_COUNT),
  ]
  
  // Re-attach file state (read files are gone after compaction)
  await reAttachFileContext(compactedMessages)
  
  consecutiveCompactionFailures = 0
  return compactedMessages
}
```

4. **File re-attachment after compact:** After compaction, re-read the files the model was working on and inject their content. This is critical — the summarized conversation loses file contents, so the model needs fresh reads:
```typescript
async function reAttachFileContext(messages: Message[]): Promise<void> {
  const filesToReattach = extractFilePathsFromSummary(messages)
  for (const filePath of filesToReattach) {
    const content = await readFile(filePath)
    messages.push({
      role: 'user',
      content: `[Re-attached file: ${filePath}]\n\`\`\`\n${content}\n\`\`\``,
    })
  }
}
```

**Depends on:** P1.4 (micro-compact is the baseline; auto-compact is the safety net). Also depends on the provider system having access to a "cheap" model for summarization.

---

### P1.6 Add Assembly-Time Tool Filtering by Deny Rules

**Impact:** Security — denied tools don't even appear in the model's tool list  
**Effort:** Small  

**Why:** Claude Code's `filterToolsByDenyRules()` removes tools from the AI's view entirely when a blanket deny rule exists. This is more than just blocking at call time — it prevents the AI from even knowing about the tool, which means:
- The model can't hallucinate using a denied tool
- The model's decision space is simplified (fewer options)
- No wasted tokens on tool descriptions that can't be used

**Current state:** AgenticOS checks permissions at call time via `PermissionEngine`. But the tool is still visible to the model in the system prompt.

**Implementation (in `ToolPoolAssembler.ts`):**
```typescript
function assemble(options: AssembleOptions): Tool[] {
  let tools = getAllBuiltinTools()
  
  // ADD THIS: Assembly-time deny filtering
  const denyRules = getDenyRulesForRole(options.role)
  tools = tools.filter(tool => {
    const denyRule = denyRules.find(rule => matchesToolDenyRule(tool.name, rule))
    if (denyRule) {
      // Don't even show this tool to the model
      logger.audit(`Tool "${tool.name}" removed from model's view by deny rule "${denyRule}"`)
      return false
    }
    return true
  })
  
  // ... existing filtering ...
}
```

**Depends on:** The permission/deny rule system should already support per-tool deny rules.

---

### P1.7 Fix cross-layer coupling: tools should not import Zustand stores

**Impact:** Testability, modularity, separation of concerns  
**Effort:** Medium (refactoring across ~8 tools)  

**Why:** Multiple tools in `src/renderer/runtime/tools/implementations/` directly import Zustand stores:
```typescript
import { useWorkspaceStore } from '@/stores/workspace-store'
import { useAgentStore } from '@/stores/agent-store'
import { useSandboxStore } from '@/stores/sandbox-store'
```

This couples the runtime tool layer (which should be pure logic) to the React UI layer. It makes tools hard to test, hard to reuse in non-UI contexts (e.g., headless mode), and creates circular dependency risks.

**Fix:** Inject dependencies through `ToolContext` instead of importing stores directly:
```typescript
// In ToolContext.ts — add:
type ToolContext = {
  // ...existing fields
  workspaceStore?: WorkspaceStoreAPI  // Injected, not imported
  agentStore?: AgentStoreAPI
  sandboxStore?: SandboxStoreAPI
}

// In tool implementations — use context instead of direct import:
// BEFORE:
const rootPath = useWorkspaceStore.getState().rootPath
// AFTER:
const rootPath = ctx.workspaceStore?.getState().rootPath ?? defaultRootPath
```

The pipeline (`ToolExecutionPipeline`) populates `ctx.workspaceStore` at execution time, keeping the import chain clean: UI → Pipeline → ToolContext → Tool, never Tool → UI.

**Affected tools:** WriteFileTool, EditFileTool, ReadFileTool, BashTool, DelegateTool, and any tool that reads `useWorkspaceStore` or `useAgentStore`.

**Depends on:** Nothing structural, but touches many files. Should be done after P1.3 (the pipeline refactoring) to avoid conflicts.

---

## TIER P2 — SIGNIFICANT IMPROVEMENTS

These are valuable features that improve user experience, safety, and performance. They depend on P1 fixes.

---

### P2.1 Add streaming tool executor

**Impact:** Perceived speed — tools start running before the model finishes responding  
**Effort:** Very large (streaming infrastructure + executor)  

**Why:** Claude Code's `StreamingToolExecutor` starts executing tool_use blocks as they arrive in the SSE stream, before the model finishes generating its response. This overlaps API latency with tool execution, hiding 30-50% of perceived wait time.

**Current state:** All tool_use blocks arrive in a single batch after the stream completes. No interleaving.

**Implementation:**

1. **StreamingToolExecutor class:**
```typescript
class StreamingToolExecutor {
  private queue: TrackedTool[] = []
  private executing = new Set<string>()
  private onProgress: (event: ExecutionEvent) => void
  
  addTool(toolUse: ToolUseBlock, assistantMsg: AssistantMessage): void {
    const tool = resolveTool(toolUse.name)
    if (!tool) {
      // Immediate error if tool not found
      return
    }
    const isSafe = tool.isConcurrencySafe(toolUse.input)
    this.queue.push({ id: toolUse.id, block: toolUse, status: 'queued', isSafe })
    
    // Try to start executing (may be blocked by serial dependency)
    this.processQueue()
  }
  
  private processQueue(): void {
    for (const entry of this.queue) {
      if (entry.status !== 'queued') continue
      if (this.canExecute(entry)) {
        this.execute(entry)
      } else {
        break  // Serial dependency — wait
      }
    }
  }
  
  private canExecute(entry: TrackedTool): boolean {
    if (this.executing.size === 0) return true
    if (!entry.isSafe) return false  // Serial tools block
    // Can only execute if ALL current executors are safe
    return [...this.executing].every(id => {
      const t = this.queue.find(e => e.id === id)
      return t?.isSafe
    })
  }
  
  async execute(entry: TrackedTool): Promise<void> {
    entry.status = 'executing'
    this.executing.add(entry.id)
    
    try {
      const result = await executeTool(entry.block)
      this.onProgress({ type: 'tool:complete', toolId: entry.id, result })
    } catch (err) {
      this.onProgress({ type: 'tool:error', toolId: entry.id, error: err })
      // On bash error, abort siblings
      if (entry.block.name === 'bash') {
        this.siblingAbortController?.abort()
      }
    } finally {
      this.executing.delete(entry.id)
      entry.status = 'completed'
      this.processQueue()  // Wake up any waiting tools
    }
  }
  
  async *getResults(): AsyncGenerator<ExecutionEvent> {
    while (this.hasUnfinished()) {
      for (const entry of this.queue) {
        if (entry.status === 'completed' && !entry.yielded) {
          entry.yielded = true
          yield* entry.resultEvents
        }
      }
      if (this.hasUnfinished()) {
        await sleep(50)  // Poll — can be optimized with event-based wakeup
      }
    }
  }
}
```

2. **Integration with provider stream:** When the provider emits a `tool_call` event during streaming, call `executor.addTool(toolUse, assistantMsg)` immediately rather than accumulating.

3. **Result ordering:** Results must be yielded in the same order as the tool_use blocks appeared in the stream (not completion order). This preserves the logical conversation flow even though tools executed in parallel.

**Depends on:** P1.3 (clean pipeline interface), provider streaming infrastructure.

---

### P2.2 Add speculative permission classifier

**Impact:** Speed — permission checks don't block tool execution  
**Effort:** Medium (classifier API call + integration)  

**Why:** Claude Code starts a speculative bash command classification API call in parallel with pre-tool hooks and permission dialog preparation. By the time the user sees the dialog, the classification is often complete. If the classifier says "allow", the dialog is auto-dismissed.

**Current state:** Permission checks block execution. No parallel classification.

**Implementation:**

1. **When a tool is called, start classification immediately (don't wait for hooks):**
```typescript
// In ToolExecutionPipeline.execute(), as early as possible:
let classificationPromise: Promise<ClassifierResult> | null = null
if (tool.name === 'bash' && permissionMode === 'auto') {
  // Fire classifier in parallel with everything else
  classificationPromise = classifyBashCommand(input.command, context)
}
```

2. **When permission check reaches the "ask user" step:**
```typescript
// If classifier is running, wait for it
if (classificationPromise) {
  const result = await classificationPromise
  if (result.behavior === 'allow') {
    return { behavior: 'allow' }  // Skip the dialog
  }
}
// Otherwise, show the permission dialog
return await showPermissionDialog(tool, input)
```

3. **Two-stage classifier** (if using a model that supports fast+thinking):
   - Stage 1: 64 max_tokens, ask for immediate yes/no on known-safe patterns
   - Stage 2: If stage 1 says "block", escalate with chain-of-thought reasoning (4096 tokens)

**Depends on:** Provider system supporting quick classification calls.

---

### P2.3 Add stream idle watchdog

**Impact:** Reliability — prevents silent hangs when AI stops responding  
**Effort:** Small  

**Why:** Claude Code has a 90-second stream idle timeout. If no SSE events arrive for 90 seconds, the connection is aborted and a non-streaming fallback request is made. A warning fires at 45 seconds.

**Current state:** No watchdog. If the AI stream hangs, the user sees "Thinking..." forever.

**Implementation (in `ProviderGateway.ts`):**
```typescript
function streamWithWatchdog(request: Request, signal: AbortSignal): AsyncGenerator<StreamEvent> {
  let lastEventTime = Date.now()
  const WATCHDOG_TIMEOUT = 90_000  // 90 seconds
  const WARNING_THRESHOLD = 45_000  // 45 seconds
  
  const watchdog = setInterval(() => {
    const elapsed = Date.now() - lastEventTime
    if (elapsed > WARNING_THRESHOLD && elapsed < WATCHDOG_TIMEOUT) {
      console.warn(`Stream stalled: ${elapsed}ms since last event`)
    }
    if (elapsed > WATCHDOG_TIMEOUT) {
      console.error('Stream idle timeout — aborting')
      signal.dispatchEvent(new Event('abort'))
      clearInterval(watchdog)
    }
  }, 10_000)  // Check every 10 seconds
  
  // Wrap the original stream generator with watchdog reset
  try {
    for await (const event of originalStream) {
      lastEventTime = Date.now()
      yield event
    }
  } finally {
    clearInterval(watchdog)
  }
}
```

**Depends on:** Provider streaming infrastructure.

---

### P2.4 Add tool result disk persistence for large outputs

**Impact:** Prevents OOM from large tool results, saves tokens  
**Effort:** Medium  

**Why:** Claude Code's `maxResultSizeChars` (default ~100K) limits how much tool output stays in memory. When a tool (grep, bash, read) produces output exceeding this limit, the result is written to disk and the model receives a `<persisted-output>` tag with a preview and file path. The UI shows the full content from disk.

**Current state:** All tool results stay in memory and are sent to the model verbatim. A `grep` across a large codebase can produce megabytes of output.

**Implementation:**

1. **Add `maxResultSizeChars` to every tool:**
```typescript
// In AgentTool.ts:
type AgentTool<I, O> = {
  // ...existing fields
  maxResultSizeChars: number  // Default: 100_000
}
```

2. **In ToolExecutionPipeline, after execution:**
```typescript
async function maybePersistResult(tool: AgentTool, output: string, traceId: string): Promise<{ modelContent: string, displayContent: string, diskPath?: string }> {
  if (output.length <= tool.maxResultSizeChars) {
    return { modelContent: output, displayContent: output }
  }
  
  // Write to disk
  const diskPath = path.join(toolResultsDir, `${traceId}-${tool.name}.txt`)
  await fs.writeFile(diskPath, output, 'utf-8')
  
  // Preview for the model (first 2000 + last 1000 chars)
  const preview = output.slice(0, 2000) + '\n... [truncated] ...\n' + output.slice(-1000)
  
  return {
    modelContent: `<persisted-output path="${diskPath}" totalChars="${output.length}" previewChars="3000">\n${preview}\n</persisted-output>`,
    displayContent: output,  // UI shows full content
    diskPath,
  }
}
```

3. **Cleanup:** Delete persisted files when the session ends or when they're past a TTL.

**Depends on:** P1.3 (clean pipeline to inject this step).

---

### P2.5 Add per-tool UI rendering

**Impact:** Visual quality — each tool has a tailored UI representation  
**Effort:** Medium (add `renderToolUseMessage` and `renderToolResultMessage` to tools)  

**Why:** Claude Code's tools return JSX components from `renderToolUseMessage()` and `renderToolResultMessage()`. This means:
- `BashTool` shows a terminal emulator card with real-time output
- `FileEditTool` shows a syntax-highlighted diff
- `ReadFileTool` shows a code block with line numbers
- `WebSearchTool` shows a search results list with favicons

**Current state:** All tools use generic card components. No tool-specific rendering.

**Implementation:**

1. **Add to AgentTool type:**
```typescript
renderToolUseMessage?(input: Partial<I>, options: { theme: string }): React.ReactNode
renderToolResultMessage?(output: O, options: { verbose: boolean }): React.ReactNode
renderToolUseProgressMessage?(progress: P[]): React.ReactNode
```

2. **Implement for key tools:**

   **ReadFileTool:**
   ```typescript
   renderToolUseMessage(input) {
     return <FilePreview path={input.file_path} />
   }
   renderToolResultMessage(output) {
     return <CodeBlock code={output.content} language={output.language} lineNumbers />
   }
   ```

   **BashTool:**
   ```typescript
   renderToolUseMessage(input) {
     return <TerminalCommand command={input.command} />
   }
   renderToolUseProgressMessage(progress) {
     return <TerminalOutput lines={progress.output} />
   }
   renderToolResultMessage(output) {
     return output.exitCode === 0
       ? <TerminalSuccess output={output.stdout} />
       : <TerminalError output={output.stderr} exitCode={output.exitCode} />
   }
   ```

3. **Update timeline UI to check for these methods** and use them when available, falling back to generic cards.

**Depends on:** P1.1 (EditFileTool with diff rendering).

---

### P2.6 Add per-rule always-allow (not one-bit toggle)

**Impact:** Safety UX — users can permanently allow specific commands  
**Effort:** Medium  

**Why:** Current `alwaysAllow` is a single toggle that enables ALL tools to bypass approval. Claude Code supports per-pattern rules like `"Bash(npm *)"` that allow specific commands while still blocking dangerous ones.

**Current state:** One-bit `alwaysAllow` toggle in `approval-store.ts`.

**Implementation:**

1. **Store always-allow rules as structured objects:**
```typescript
type AlwaysAllowRule = {
  id: string
  toolPattern: string  // e.g., "Bash(npm *)" or "Bash" (all bash commands)
  createdAt: number
  expiresAt?: number   // Optional: session-only, 1 hour, or permanent
}
```

2. **When user clicks "Always Allow" in the approval dialog:**
   - Show a sub-dialog: "Allow all [tool] commands?" or "Allow this specific command pattern: [pattern]"
   - Store the rule in the permission context

3. **Permission check cascade:** Before showing the dialog, check if the tool+input matches any always-allow rule.

**Depends on:** P1.6 (assembly-time filtering will also respect these rules).

---

### P2.7 Add cost tracking per provider

**Impact:** User awareness — shows how many tokens each provider/model consumes  
**Effort:** Small  

**Why:** Usage logging already exists (`ProviderGateway` tracks tokens, duration, model, provider per call). But no cost calculation is applied.

**Current state:** Raw token counts are logged. No USD cost.

**Implementation:**

```typescript
// In ProviderGateway.ts after each API call:
const COST_PER_TOKEN: Record<string, { input: number, output: number }> = {
  'gpt-4': { input: 0.00003, output: 0.00006 },
  'gpt-4-turbo': { input: 0.00001, output: 0.00003 },
  'gpt-3.5-turbo': { input: 0.000001, output: 0.000002 },
  'claude-3-opus': { input: 0.000015, output: 0.000075 },
  'claude-3-sonnet': { input: 0.000003, output: 0.000015 },
  'claude-3-haiku': { input: 0.00000025, output: 0.00000125 },
  // ... populate from provider's published pricing
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = COST_PER_TOKEN[model]
  if (!pricing) return 0
  return (inputTokens * pricing.input) + (outputTokens * pricing.output)
}
```

**Depends on:** Provider system already tracks tokens.

---

### P2.8 Make role definitions data-driven, not hardcoded

**Impact:** Extensibility — users can define custom agent roles  
**Effort:** Medium  

**Why:** The six agent roles (coding, design, vision, qa, manager, runtime) are hardcoded in `app-store.ts` init and in `agent-store.ts` conversations init. Adding a new role requires code changes.

**Current state:** Roles are hardcoded. The `RuntimeRole` type exists but the actual role instances are created in store initialization.

**Implementation:**

```typescript
// Load roles from a config file (e.g., AGENTIC.md or .claude/agents/*.yaml)
type AgentRoleConfig = {
  name: string
  displayName: string
  description: string
  model?: string       // Optional model override
  tools: string[]      // Tool allowlist
  systemPrompt: string // Role-specific system prompt
  temperature?: number
  maxTurns?: number
}

// Registry loaded at startup:
const roleRegistry = new RoleRegistry()
roleRegistry.loadFromConfig('~/.claude/agents/')
roleRegistry.loadFromConfig('.claude/agents/')
roleRegistry.loadBuiltinFallbacks()  // The 6 hardcoded roles as fallback
```

**Depends on:** P1.3 (clean pipeline that doesn't hardcode roles in the executor).

---

### P2.9 Add client-side rate limiting

**Impact:** Prevents silent API failures from rate limit exceeded errors  
**Effort:** Small  

**Why:** ProviderGateway retries on failure but doesn't prevent sending requests that exceed the API's rate limit. A burst of 10 tool calls could hit the rate limit, causing all 10 to fail, retry, and fail again.

**Current state:** No rate limiting. Requests are sent at full speed.

**Implementation:**

```typescript
class TokenBucketRateLimiter {
  private tokens: number
  private lastRefill: number
  private readonly maxTokens: number
  private readonly refillRate: number // tokens per second
  private readonly refillInterval: number
  
  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens
    this.refillRate = refillRate
    this.tokens = maxTokens
    this.lastRefill = Date.now()
    this.refillInterval = 1000 / refillRate
  }
  
  async acquire(count = 1): Promise<void> {
    this.refill()
    while (this.tokens < count) {
      await sleep(this.refillInterval * (count - this.tokens))
      this.refill()
    }
    this.tokens -= count
  }
  
  private refill(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate / 1000)
    this.lastRefill = now
  }
}
```

**Depends on:** Nothing.

---

## TIER P3 — ENHANCEMENTS AND OPTIMIZATIONS

Lower priority but valuable for polish, performance, and edge case handling.

---

### P3.1 Add git diff awareness to system prompt

**Impact:** Context quality — the AI knows what the user just changed  
**Effort:** Medium  

**Why:** Claude Code computes the git diff at session start and includes it in the system prompt. This tells the AI what changes the user has already made (but not committed), so it doesn't conflict or undo them.

**Current state:** AgenticOS has `gitStatus` polling in `code-workspace.tsx` (30s interval) but doesn't inject the diff into the AI's context.

**Implementation:**
```typescript
// In system prompt assembly (getSystemPrompt or similar):
const gitDiff = await fetchGitDiff(workspaceRoot)
if (gitDiff) {
  return `Below is a summary of uncommitted changes in the repository:\n${gitDiff}`
}
```

**Depends on:** System prompt infrastructure.

---

### P3.2 Add stalled-command auto-backgrounding

**Impact:** UX — long-running commands don't block the conversation  
**Effort:** Medium  

**Why:** Claude Code's BashTool auto-backgrounds commands after 15 seconds (in assistant mode). The main agent continues working while the command runs in the background.

**Current state:** Commands block until completion.

**Implementation:**
```typescript
// In BashTool or TerminalRuntime:
const ASSISTANT_BLOCKING_BUDGET_MS = 15_000

const result = await Promise.race([
  commandPromise,
  sleep(ASSISTANT_BLOCKING_BUDGET_MS).then(() => 'BACKGROUND'),
])

if (result === 'BACKGROUND') {
  // Move command to background
  const backgroundTaskId = spawnBackgroundTask(commandPromise)
  return {
    backgroundTaskId,
    message: `Command moved to background. Task ID: ${backgroundTaskId}`,
  }
}
```

**Depends on:** Background task infrastructure (LocalAgentTask or similar).

---

### P3.3 Add shell command sed interception

**Impact:** Safety — preview sed-based edits before applying  
**Effort:** Medium  

**Why:** When Claude Code detects a `sed` command in bash, it intercepts it, computes what the file would look like after the sed, shows the user a diff preview, and only runs the sed after approval. This prevents sed regex errors from corrupting files.

**Current state:** Sed commands are executed blindly.

**Implementation (in BashTool or CommandExecutionPolicy):**
```typescript
function parseSedEditCommand(command: string): { filePath: string, expression: string } | null {
  // Match: sed -i 's/old/new/g' file.txt
  const sedMatch = command.match(/^sed\s+-i\S*\s+'s\/([^/]+)\/([^/]*)\/[g]*'\s+(.+)$/)
  if (!sedMatch) return null
  return {
    filePath: sedMatch[3],
    expression: `s/${sedMatch[1]}/${sedMatch[2]}/g`,
  }
}
```

**Depends on:** P1.1 (search-and-replace FileEditTool — the sed-intercepted edit should use the same path).

---

### P3.4 Add prompt caching across turns

**Impact:** Speed, cost — AI doesn't reprocess tool schemas every turn  
**Effort:** Medium  

**Why:** Claude Code caches the system prompt (about 50-70K tokens of tool descriptions + rules) so the AI doesn't re-process it on every turn. Only the new user message changes per turn.

**Current state:** The entire message array (including system prompt and tool results) is sent fresh every API call. No cache control markers.

**Implementation (for Anthropic API):**
```typescript
// When building the API request, mark the system prompt blocks with cache_control:
const systemBlocks = [
  { type: 'text', text: mainSystemPrompt, cache_control: { type: 'ephemeral' } },
  { type: 'text', text: toolDescriptions, cache_control: { type: 'ephemeral' } },
  // ... more stable sections
]

// For other providers: similar mechanism if supported (e.g., OpenAI's prompt caching)
```

**Depends on:** Provider infrastructure (each provider handles this differently).

---

### P3.5 Add beta header latching

**Impact:** Cache stability — prevents headers from changing mid-session  
**Effort:** Small  

**Why:** Claude Code "latches" beta headers once sent. Changing headers mid-session invalidates the server-side prompt cache, discarding 50-70K tokens of cached computation.

**Current state:** Headers are computed fresh per request.

**Implementation:**
```typescript
let latchedHeaders: Record<string, string> | null = null

function getBetaHeaders(): Record<string, string> {
  if (latchedHeaders) return latchedHeaders
  
  latchedHeaders = {
    'anthropic-beta': ['tools-2024-04-04', ...].join(','),
  }
  return latchedHeaders
}
```

**Depends on:** Provider infrastructure.

---

### P3.6 Replace crude token estimation with tiktoken

**Impact:** Accuracy — token counting affects compact decisions and cost display  
**Effort:** Small  

**Why:** Current estimation (`message.content.length / 4`) is a rough approximation. For non-English text, code, or structured output, it can be off by 2-3x.

**Current state:** Crude character-count-based estimation.

**Implementation:**
```typescript
import { encoding_for_model } from 'tiktoken'

function estimateTokens(text: string, model = 'gpt-4'): number {
  try {
    const enc = encoding_for_model(model)
    const tokens = enc.encode(text).length
    enc.free()
    return tokens
  } catch {
    // Fallback for unknown models
    return Math.ceil(text.length / 4)
  }
}
```

**Depends on:** Adding `tiktoken` as a dependency (verify it exists — pre-flight check).

---

### P3.7 Add logging for denied permission decisions

**Impact:** Debugging — understand why the AI couldn't perform an action  
**Effort:** Small  

**Why:** When the AI can't use a tool due to deny rules, the current code silently filters the tool or returns an error. Claude Code has denial tracking that records the reason and the rule that matched.

**Current state:** No audit trail for permission denials.

**Implementation:**
```typescript
// In PermissionEngine.evaluate():
logger.audit('tool_permission_denied', {
  toolName,
  rule: matchedRule,
  reason: matchedRule.reason,
  input: allowListFields(input),  // Only log non-sensitive fields
  timestamp: Date.now(),
})
```

**Depends on:** Permission engine (already exists).

---

### P3.8 Add notification for background task completion

**Impact:** UX — users know when async work finishes  
**Effort:** Medium  

**Why:** Claude Code's async agents send XML-formatted notifications to the main conversation. AgenticOS has the notification infrastructure (`enqueueAgentNotification`) but no system-level notification (OS notification, badge).

**Implementation:**
```typescript
// In the background task listener:
backgroundTask.onComplete(result => {
  // If the user is on a different conversation turn, send an OS notification
  if (isUserOnDifferentTurn()) {
    showNotification({
      title: 'Background task complete',
      body: `${result.summary}`,
    })
  }
  // Always add to the timeline
  timelineStore.addNotification({
    agentType: result.agentType,
    summary: result.summary,
    duration: result.duration,
  })
})
```

**Depends on:** Background task system.

---

### P3.9 Add stream cancellation propagation

**Impact:** Clean shutdown — canceling a stream actually cancels the HTTP request  
**Effort:** Small  

**Why:** When the user cancels a stream (clicks "Stop" or sends a new message), `ProviderGateway` should abort the underlying HTTP request, not just stop processing events.

**Current state:** Abort signal is accepted but may not be forwarded to the fetch call in all provider implementations.

**Fix:** Audit all provider implementations to ensure `AbortSignal` is passed to `fetch()`:
```typescript
const response = await fetch(url, {
  method: 'POST',
  headers,
  body,
  signal: abortSignal,  // MUST be passed
})
```

**Depends on:** Provider infrastructure.

---

### P3.10 Consolidate three diff rendering approaches

**Impact:** Code maintainability  
**Effort:** Medium  

**Why:** AgenticOS currently has three different diff rendering approaches:
1. `SideBySideDiff.tsx` — Monaco DiffEditor (review panel)
2. `DiffCard.tsx` — Custom HTML with syntax highlighting (inline conversation)
3. `ToolCallCard.tsx` — JSON-parsed inline diffs (conversation)

This is triple the code for the same concept, with different bugs in each.

**Proposed unification:**
- Use `SideBySideDiff` (Monaco) for the full diff review panel — it's the most accurate
- Use `DiffCard` for inline conversation display — it's lighter weight and works without Monaco
- Remove the ad-hoc diff parsing from `ToolCallCard` — delegate to `DiffCard` or a shared `parseDiff` utility
- Create a shared `DiffHunk` type used by both approaches, so they differ only in rendering, not data

**Depends on:** Nothing, but should be coordinated with P2.5 (per-tool rendering) since EditFileTool's progress rendering would use DiffCard.

---

## TIER P4 — POLISH AND EDGE CASES

---

### P4.1 Monaco editor full-height in diff mode

**File:** `SideBySideDiff.tsx` — `height: 300px` is hardcoded. Should fill available space (use flex or container height).

---

### P4.2 Approval dialog keyboard shortcuts

**File:** `approval-gate.tsx` — Add `Enter` → Approve, `Escape` → Reject.

---

### P4.3 Approval queue for parallel tools

When parallel execution (P2.1) is active, multiple tools may need approval simultaneously. The current single-pending-approval model breaks.

---

### P4.4 Remove `_simulatedSedEdit` dangling field

This field exists in EditFileTool but is no longer used by the model. It's an artifact from an earlier sed-based editing approach.

---

### P4.5 Remove `superadmin` hardcoded bypass

Replace with a configurable bypass mechanism with audit logging.

---

### P4.6 Fix `SideBySideDiff` maxComputationTime timeout

Hardcoded 5000ms may timeout for large files. Make it configurable or proportional to file size.

---

### P4.7 Add Monaco model disposal on tab close

`editor-utils.ts` has `removeFromCaches()` but the Monaco model is not always disposed. Verify model lifecycle.

---

### P4.8 Handle deeply nested file trees

`workspace-store.ts` uses recursion for tree operations. For deeply nested directories (>1000 levels), this can stack overflow. Use iterative traversal.

---

### P4.9 Fix `saveSession?.()` reference

Either implement the function or remove the call (P0.2).

---

## APPENDIX A: Architecture Decision Records

### A.1 Why search-and-replace over diff-based editing

Search-and-replace (`old_string` / `new_string`) is preferred over diff-based editing for AI code generation because:

1. **Deterministic:** The AI specifies exactly what text to replace. If the text moved due to earlier edits, the operation fails cleanly instead of applying a patch to the wrong location.
2. **Self-documenting:** The old_string serves as documentation of what was there. A diff is harder to reason about.
3. **Idempotent:** If the model retries the same edit, it fails on the second attempt (old_string no longer exists) rather than applying the same diff twice.
4. **Claude/Codex compatible:** Both Claude Code and Codex CLI use this approach. Compatible tool schemas mean prompts are portable.

Use diff-based editing ONLY for the diff review UI (visual diff display), never for the execution path.

### A.2 Why multi-agent architecture over single-agent

Multi-agent provides:
1. **Isolation:** Each role has its own tool permissions, model config, and conversation buffer. A coding agent can't accidentally call browser tools.
2. **Parallelism:** With proper orchestration, a research agent can search while a coder edits.
3. **Specialization:** Each role has a focused prompt and toolset (e.g., QA agent doesn't need FileEditTool).

But adds complexity:
1. **Synthesis:** Results from multiple agents must be combined, which can create conflicts.
2. **Orchestration overhead:** Managing agent lifecycle (spawn, monitor, kill) adds latency.
3. **Context fragmentation:** Each agent sees only its own conversation, not the full picture.

**Tradeoff accepted:** Multi-agent is AgenticOS's identity. The complexity is justified by the feature differentiation from Claude Code and future capabilities (browser agent, device agent).

### A.3 Why 29 Zustand stores instead of a single store

Each store manages a specific domain:
- `workspace-store`: File tree + editor state
- `timeline-store`: Conversation events + agent sessions
- `agent-store`: Per-role conversations + agent assignments
- `diff-store`: Diff review state
- `approval-store`: Permission approval state
- `browser-store`: Browser automation state
- `design-store`: Design system state
- `plan-store`: Plan generation state
- `sandbox-store`: Sandbox configuration
- etc.

Benefits:
- **Isolation:** A bug in `workspace-store` doesn't crash `timeline-store`
- **Performance:** Components subscribe only to the store slice they need
- **Testability:** Each store is independently testable

Drawbacks:
- **Cross-store coordination:** Actions that touch multiple stores (like diff accept/reject) require manual orchestration
- **Store size:** Two stores exceed 800 lines, indicating they should be split further

---

## APPENDIX B: Key File Index

This maps every identified code location, sorted by tier.

| Tier | File | Issue | Line |
|------|------|-------|------|
| P0 | `EditFileTool.ts` | Never writes to disk | execute() |
| P0 | `workspace-store.ts` | Calls undefined saveSession() | ~640 |
| P0 | `CommandExecutionPolicy.ts` | Catch-all regex precedes specific rules | ~50 |
| P0 | `ToolValidation.ts` | Required fields not checked | validate() |
| P0 | `WebSearchTool.ts` | Google scraping (fragile) | execute() |
| P0 | `WriteFileTool.ts` | changesetByTrace memory leak | module scope |
| P1 | — | New FileEditTool (search-and-replace) | New file |
| P1 | — | New FileStateCache (read-before-edit) | New file |
| P1 | `UnifiedExecutor.ts` | 1027 lines, should be 5-6 files | entire file |
| P1 | — | Micro-compaction utility | New file |
| P1 | — | Auto-compact summarizer | New file |
| P1 | `ToolPoolAssembler.ts` | Assembly-time deny filtering | assemble() |
| P1 | Various tools | Cross-layer Zustand imports | per tool |
| P2 | — | StreamingToolExecutor | New file |
| P2 | `approval-gate.tsx` | Speculative permission classifier | New hook |
| P2 | `ProviderGateway.ts` | Stream idle watchdog | stream() |
| P2 | — | Tool result disk persistence | Pipeline hook |
| P2 | Various tools | Per-tool UI rendering | per tool |
| P2 | `approval-store.ts` | Per-rule always-allow | store types |
| P2 | `ProviderGateway.ts` | Cost tracking | per call |
| P2 | `app-store.ts` | Data-driven role config | init |
| P2 | — | Client-side token bucket rate limiter | New file |
| P3 | System prompt | Git diff injection | assembly |
| P3 | BashTool | Auto-backgrounding | execute() |
| P3 | BashTool | Sed command interception | validateInput() |
| P3 | Provider layer | Prompt caching | request build |
| P3 | Provider layer | Beta header latching | headers |
| P3 | `ProviderGateway.ts` | tiktoken estimation | per call |
| P3 | PermissionEngine | Audit logging | evaluate() |
| P3 | Background tasks | OS notifications | completion handler |
| P3 | Provider layer | Cancellation propagation | fetch calls |
| P3 | Diff rendering | Consolidate 3 approaches | all diff files |
| P4 | `SideBySideDiff.tsx` | Hardcoded 300px | style |
| P4 | `approval-gate.tsx` | Keyboard shortcuts | handle input |
| P4 | — | Approval queue | parallel |
| P4 | `EditFileTool.ts` | Remove _simulatedSedEdit | execute() |
| P4 | `ToolPoolAssembler.ts` | Remove superadmin bypass | assembleForRole() |
| P4 | `workspace-store.ts` | Recursive tree ops | enter/removeFileEntry |

---

## APPENDIX C: Verification Checklist

Before marking any P0-P1 item as "done":
1. Code compiles (`npm run build`)
2. TypeScript typecheck passes (`npm run typecheck`)
3. Lint passes (`npm run lint`)
4. Tests pass for the affected area (`npm test -- --grep <related test>`)
5. Manual verification of the exact scenario that triggered the bug
6. A test exists that would catch a regression (new tests for bug fixes)
7. Comment explaining WHY at every non-trivial change

---

## APPENDIX D: Dependency Graph

```
P0.1 (EditFileTool write) ──────────────────┐
P0.2 (undefined saveSession)                 │
P0.3 (catch-all ordering)                    │
P0.4 (required field validation)             │
P0.5 (Google scraping)                       │
P0.6 (memory leak)                           │
                                             │
P1.1 (search-and-replace EditFileTool) ◄─────┘
P1.2 (read-before-edit enforcement) ◄────────┘
P1.3 (split UnifiedExecutor) ◄───────────────┤
P1.4 (micro-compaction)                      │
P1.5 (auto-compact) ◄────────────────────────┤
P1.6 (assembly-time filtering)               │
P1.7 (cross-layer coupling fix) ◄────────────┤
                                             │
P2.1 (streaming executor) ◄──────────────────┤
P2.2 (speculative classifier)                │
P2.3 (stream watchdog)                       │
P2.4 (tool result persistence)               │
P2.5 (per-tool rendering) ◄──────────────────┤
P2.6 (per-rule always-allow) ◄───────────────┤
P2.7 (cost tracking)                         │
P2.8 (data-driven roles) ◄───────────────────┤
P2.9 (rate limiter)                          │
                                             │
P3.x (enhancements) ──── depend on P1 fixes  │
P4.x (polish) ────────── depend on P2 fixes  │
```

**Key insight:** P1.1 (search-and-replace EditFileTool) is the highest-value architectural addition. It unblocks: read-before-edit enforcement, the diff system consolidation, per-tool rendering for edits, and replaces the broken EditFileTool entirely.

---

*End of document. Work through TIER P0 completely before starting TIER P1. Report progress after each tier.*
