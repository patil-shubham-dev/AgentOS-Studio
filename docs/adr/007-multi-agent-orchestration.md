# ADR-007: Multi-Agent Internal Protocol & Orchestration

**Status:** Accepted
**Phase:** F
**Date:** 2026-07-02

## Context

Prior to Phase F, the runtime supported only single-agent execution:

1. **One active agent at a time.** The `AgentExecutor` handled a single role per invocation. Multi-role execution (manager → coder) was sequential within `UnifiedExecutor.fullPath()` but each agent was unaware of the others.

2. **No agent-to-agent communication.** Agents could not delegate subtasks, share context, or query each other's state. The only cross-agent data flow was `previousOutput` — the previous agent's full text output passed as input to the next.

3. **No task planning.** There was no explicit plan or task graph. The routing engine decided which roles to run, but what each role should *do* was implicit in the role's system prompt.

4. **No internal agent roles.** The UI exposed a flat list of roles (`coder`, `design`, `manager`) with no concept of internal sub-roles like planner, reviewer, debugger, or tester.

## Decision

### 1. Internal Agent Roles

Define a set of internal agent roles distinct from user-facing roles:

```typescript
type InternalAgentRole = "planner" | "reviewer" | "debugger" | "tester"
```

Each internal role has a dedicated schema in `InternalAgentRoleSchema`:
- `roleName`: Display name
- `description`: Purpose
- `promptKey`: Key into the prompt template registry
- `outputFormat`: Expected output shape (`"plan"` | `"review"` | `"diagnosis"` | `"testPlan"`)

Internal roles are hidden by default via the `showInternalAgentLabels` feature flag (default `false`). When enabled, the chat UI renders a subdued label for internal agent phases.

### 2. MultiAgentMessage Protocol

Agents communicate via a structured message protocol:

```typescript
interface MultiAgentMessage {
  type: "orchestration" | "sync" | "handoff"
  from: InternalAgentRole | RuntimeRole
  to: InternalAgentRole | RuntimeRole
  payload: Record<string, unknown>
  context?: { taskId: string; stepIndex: number }
  traceId: string
}
```

- **`orchestration`**: Task assignment or status update from the orchestrator to an agent.
- **`sync`**: Context sharing between agents (e.g., planner → coder with subtask details).
- **`handoff`**: Completion signal with result data.

### 3. AgentTask Dependency Graph

Tasks are defined and executed in a dependency graph:

```typescript
interface AgentTask {
  id: string
  role: InternalAgentRole | RuntimeRole
  description: string
  input?: string
  dependencies: string[]   // task IDs that must complete first
  status: "pending" | "in_progress" | "completed" | "failed"
  result?: string
}
```

```typescript
// Task dependency edges
interface TaskDependency {
  from: string     // task ID
  to: string       // task ID
  type: "blocks" | "informs"
}
```

The orchestrator resolves the DAG and executes tasks in topological order. Parallel branches execute concurrently within an `AbortController` scope.

### 4. MultiAgentOrchestrator

`MultiAgentOrchestrator` (`src/renderer/runtime/agents/MultiAgentOrchestrator.ts`) owns the multi-agent lifecycle:

1. **`plan(input, roles)`**: Takes user input and selected roles, returns an `AgentTask[]` dependency graph.
2. **`execute(tasks, signal)`**: Consumes the task graph, dispatches each task to the appropriate agent via `AgentExecutor`, and collects results.
3. **`synthesize(results)`**: Combines individual agent outputs into a single coherent response.

The orchestrator emits events tagged with `executionId` for the outer gateway to forward into the event stream.

### 5. Role Permissions

Internal roles have restricted tool access via `ROLE_PERMISSIONS`:

| Role    | Read Tools | Write Tools | Execute Commands | Internet |
|---------|-----------|-------------|-----------------|----------|
| planner | All       | None        | None            | Read-only |
| reviewer| All       | None        | None            | None     |
| debugger| All       | Limited     | Read-only       | None     |
| tester  | All       | None        | None            | None     |
| coder   | All       | All         | All             | All      |
| design  | All       | All         | None            | All      |

Permissions are enforced by `AgentExecutor.filterToolsByCapabilities()` during `executeFull()`. Unknown tools (MCP, plugins) pass through by default since their capabilities are not declared.

### 6. Feature Flag: `showInternalAgentLabels`

Added to `FeatureFlagManager` with default `false`. When disabled:
- Internal agent phases (`AgentPhase`) from `showPhaseLabels` include only user-facing roles.
- Chat UI suppresses the agent phase indicator for internal roles.

## Consequences

### Positive

1. **Structured delegation.** The orchestrator assigns discrete tasks rather than passing full context between agents. This reduces token waste from redundant context inclusion.

2. **Parallel execution.** Independent tasks in the DAG execute concurrently, reducing total wall-clock time for multi-step workflows.

3. **Permission isolation.** Internal roles cannot mutate files or execute commands unintentionally. This provides a safety layer for planning and review phases.

4. **Opt-in visibility.** Internal agent labels are hidden by default, preventing UI clutter for users who don't need multi-agent internals.

### Negative

1. **Overhead for simple queries.** The task planning step adds latency and token cost even for single-agent queries. Mitigation: routing engine selects `"direct"` strategy for simple inputs, bypassing multi-agent setup entirely.

2. **DAG complexity.** Deeply nested task graphs (5+ levels) require careful timeout configuration. A slow upstream task blocks all downstream tasks. Mitigation: per-task timeouts enforced by the orchestrator.

3. **Permission bypass via MCP.** Unknown tools (MCP, plugins) pass through `filterToolsByCapabilities()` by default since their capability metadata is not declared. Internal roles could gain unintended access via these. Mitigation: future work to require capability declarations from all tools.

## Key Files

- `src/renderer/runtime/agents/MultiAgentOrchestrator.ts` — Orchestrator
- `src/renderer/runtime/agents/InternalAgentRole.ts` — Role definitions + schemas
- `src/renderer/runtime/agents/MultiAgentMessage.ts` — Message protocol
- `src/renderer/runtime/agents/AgentTask.ts` — Task + dependency types
- `src/renderer/runtime/execution/UnifiedExecutor.ts` — Multi-agent dispatch
- `src/renderer/runtime/feature-flags/FeatureFlagManager.ts` — `showInternalAgentLabels`
