# AGENTIC Runtime Trace

> Generated: 2026-06-24
> Verification: Runtime evidence from source code (not documentation)

---

## Phase A: AGENTIC.md Generation

```
User trigger (chat-panel.tsx:425 | ConfigInitBanner.tsx:140 | WelcomePage.tsx:123)
  → configGenerator.generate(rootPath)
    → ConfigGenerator.scan(rootPath)
      reads: package.json, tsconfig.json, lockfiles, directory entries
      returns: ProjectProfile (28 fields: languages, frameworks, build tools, etc.)
    → builds markdown with 10 sections
      - Quick Reference | Build & Test Commands | Project Architecture
      - Technology Stack | Infrastructure | Coding Conventions
      - Agent Commands | Project Structure | Watch Commands | Custom Instructions
  → configGenerator.write(rootPath, content)
    → writes to <root>/AGENTIC.md via Electron/Tauri FS API
  → configLoader.invalidateCache()
```

**Evidence:** `src/renderer/runtime/project-config/ConfigGenerator.ts:78-190` (generate), `:191-340` (scan), `:342-372` (write)

---

## Phase B: Config Loading (Parser)

```
runtime start → RuntimeOS.initialize()
  → configWatcher.start(rootPath)                  // watches AGENTIC.md for changes
  → configWatcher.onChange()                       // invalidates PromptCache + ConfigLoader cache

Any system prompt build →
  configLoader.load(rootPath)
    → reads files in priority order:
      0: .agentic-os/global/AGENTIC.md
      1: .agentic-os/user/AGENTIC.md
      2: root/AGENTIC.md | .agentic/AGENTIC.md
      3: root/AGENTIC.local.md | .agentic/AGENTIC.local.md
    → concatenates with \n\n separators
    → hashes combined content (djb2)
    → parseProjectConfig(combined) → StructuredProjectConfig
      parses sections: architecture, commands, stack, conventions, verification, agentInstructions
    → caches result (30s TTL)
    → returns ConfigLoadResult { configs, combined, hash, structured }
```

**Evidence:** `src/renderer/runtime/project-config/ConfigLoader.ts:124-220` (load), `src/renderer/runtime/project-config/ProjectConfigTypes.ts:43-60` (StructuredProjectConfig), `:56-246` (parseProjectConfig)

---

## Phase C: Planner

```
UnifiedExecutor.runPlanPhase()
  → PlanGenerator.getInstance().generatePlan(userInput)
    → configLoader.load(rootPath)
    → extracts StructuredProjectConfig
    → builds context block:
      - Architecture type, workspaces, entry points
      - Build/test/lint/typecheck commands
      - TypeScript strict mode, conventions
      - Verification rules
    → loads ArchitecturePlanningStrategy context
    → loads EntryPointExplorer repo map
    → appends all context to LLM prompt
    → LLM returns ImplementationPlan (JSON with steps + files)
```

**Evidence:** `src/renderer/runtime/planning/PlanGenerator.ts:57-133` (generatePlan), `src/renderer/runtime/execution/UnifiedExecutor.ts:614-645` (runPlanPhase)

---

## Phase D: ContextManager (System Prompt Assembly)

```
AgentExecutor.execute() → memoryLoader.load()
  → configLoader.load(rootPath)
  → returns projectConfig + projectConfigHash

ContextManager.assembleSystemPrompt(assemblyInput)
  → configLoader.load(rootPath)                               // cached
  → formatForRole(structured, role)                            // role-specific block
    → manager sees architecture + commands
    → coder sees build commands + conventions
    → qa sees test patterns + verification rules
    → research sees stack + entry points
  → VerificationPipeline.applyProjectConfig(structured)        // updates commands
  → workspace-intelligence.applyProjectConfig(structured)      // updates scoring
  → configLoader.loadPathScoped(filePath)                      // path-specific rules
  → composes final system prompt with all sections
```

**Evidence:** `src/renderer/runtime/context/ContextManager.ts:360-414` (assembleSystemPrompt), `src/renderer/runtime/project-config/ProjectConfigTypes.ts:248-356` (formatForRole)

---

## Phase E: Execution

```
messages: [system prompt (with AGENTIC context), conversation history, user input]
  → sent to LLM provider
  → LLM invokes tools based on project context
  → tools execute with project config available
```

---

## Phase F: Verification

```
VerificationPipeline.verifyChanges()
  → uses commands from applyProjectConfig() which originated from AGENTIC.md:
    → typecheckCommand → npx tsc --noEmit
    → lintCommand → npx eslint
    → testCommand → npx vitest run
    → buildCommand → npm run build
  → runs lint → typecheck → build → tests → integration
  → returns VerificationResult (pass/fail per stage)

VerificationRecoveryLoop.run()
  → if verification fails, analyzes failures
  → runs repair plan (up to 3 attempts)
  → FailurePatternMemory stores patterns across sessions
```

**Evidence:** `src/renderer/runtime/verification/VerificationPipeline.ts:502+` (verifyChanges), `src/renderer/runtime/execution/VerificationRecoveryLoop.ts:30+` (run)

---

## File Index

| Module | File Path |
|--------|-----------|
| ConfigGenerator | `src/renderer/runtime/project-config/ConfigGenerator.ts` |
| ConfigLoader | `src/renderer/runtime/project-config/ConfigLoader.ts` |
| ProjectConfigTypes | `src/renderer/runtime/project-config/ProjectConfigTypes.ts` |
| PlanGenerator | `src/renderer/runtime/planning/PlanGenerator.ts` |
| ContextManager | `src/renderer/runtime/context/ContextManager.ts` |
| UnifiedExecutor | `src/renderer/runtime/execution/UnifiedExecutor.ts` |
| VerificationPipeline | `src/renderer/runtime/verification/VerificationPipeline.ts` |
| VerificationRecoveryLoop | `src/renderer/runtime/execution/VerificationRecoveryLoop.ts` |
| RuntimeOS | `src/renderer/runtime/RuntimeOS.ts` |
| AgentExecutor | `src/renderer/runtime/agents/AgentExecutor.ts` |
| Workspace Intelligence | `src/renderer/lib/workspace-intelligence.ts` |
| ConfigWatcher | `src/renderer/runtime/project-config/ConfigWatcher.ts` |

## Verification Status

| Step | Verified | Evidence |
|------|----------|----------|
| Generate AGENTIC.md | VERIFIED | ConfigGenerator.generate() at src:78-190 |
| Parser | VERIFIED | parseProjectConfig() at ProjectConfigTypes.ts:56-246 |
| ProjectConfig | VERIFIED | StructuredProjectConfig at ProjectConfigTypes.ts:43-60 |
| Planner | VERIFIED | PlanGenerator.generatePlan() loads config at PlanGenerator.ts:91-133 |
| ContextManager | VERIFIED | assembleSystemPrompt() loads + formats config at ContextManager.ts:374-414 |
| Execution | VERIFIED | System prompt with AGENTIC config flows to LLM via AgentExecutor |
| Verification | VERIFIED | VerificationPipeline applies commands from AGENTIC.md at VerificationPipeline.ts:502+ |
