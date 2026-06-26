# CHARAT_AUDIT.md — `.charAt()` Risk Audit

**Date:** 2026-06-23
**Scope:** All `.charAt()` calls in `src/`
**Total occurrences found:** 12

---

## Risk Classification

| Risk Level | Meaning |
|------------|---------|
| **CRITICAL** | Will crash with `Cannot read properties of undefined (reading 'charAt')` |
| **HIGH** | Likely to crash in common edge cases |
| **MEDIUM** | May crash with specific bad input |
| **LOW** | Guarded but could fail if assumptions change |
| **SAFE** | Properly protected |

---

## Occurrence #1 — control-center.tsx:630

```ts
agentState.state.charAt(0).toUpperCase() + agentState.state.slice(1)
```

| Question | Answer |
|----------|--------|
| Can the variable be undefined? | **YES** — `getAgentState()` at line 361 returns `status.state` without a fallback when `status` exists but `status.state` is undefined (line 367: `status && status.state !== "idle"` passes even when `state` is undefined) |
| Is there validation? | **NO** — No guard before the `.charAt()` call. The surrounding ternary at line 621-628 only compares against known values and falls through silently if `state` is unknown. |
| Is there a default value? | **NO** — The code assumes `.state` is a defined string |
| Is TypeScript protecting this path? | **NO** — The return type is `{ state: string; task: string | null }` but `getAgentState()` at line 367 returns unguarded `status.state` which can be `undefined` at runtime |
| **RISK** | **CRITICAL** |

**Root cause analysis:** `getAgentState()` (line 367) returns `{ state: status.state }` when `status && status.state !== "idle"` evaluates true. If `status` exists but `status.state` is `undefined`, the condition `undefined !== "idle"` is `true`, so the function returns `{ state: undefined, ... }`. The JSX then calls `.charAt()` on `undefined`.

---

## Occurrence #2 — code-canvas.tsx:218

```ts
title: p.type.charAt(0).toUpperCase() + p.type.slice(1),
```

| Question | Answer |
|----------|--------|
| Can the variable be undefined? | **YES** — `p.type` comes from `visiblePanes` which is a state array. If a pane has no `type` property, this crashes. |
| Is there validation? | **NO** |
| Is there a default value? | **NO** — No fallback if `p.type` is undefined or empty string |
| Is TypeScript protecting this path? | **PARTIAL** — `PaneConfig` likely types `type` as string, but runtime data could violate the type |
| **RISK** | **MEDIUM** — Only triggers if a malformed pane config is added |

---

## Occurrence #3 — performance-dashboard.tsx:215

```ts
health.status.charAt(0).toUpperCase() + health.status.slice(1)
```

| Question | Answer |
|----------|--------|
| Can the variable be undefined? | **YES** — `health` comes from runtime state which could be uninitialized |
| Is there validation? | **PARTIAL** — The preceding JSX (lines 195-214) renders a conditional that checks `health`, but doesn't validate `health.status` |
| Is there a default value? | **NO** |
| Is TypeScript protecting this path? | **PARTIAL** |
| **RISK** | **HIGH** — During initialization or error states, `health.status` could be undefined |

---

## Occurrence #4 — performance-dashboard.tsx:394

```ts
status.charAt(0).toUpperCase() + status.slice(1)
```

| Question | Answer |
|----------|--------|
| Can the variable be undefined? | **YES** — `status` comes from iterating `health.subsystems` which could have entries with no status property |
| Is there validation? | **NO** — No guard before the `.charAt()` call |
| Is there a default value? | **NO** |
| Is TypeScript protecting this path? | **PARTIAL** |
| **RISK** | **HIGH** — If a subsystem entry is missing its status field |

---

## Occurrence #5 — NetworkInspector.tsx:45

```ts
String(code).charAt(0)
```

| Question | Answer |
|----------|--------|
| Can the variable be undefined? | **SAFE** — `code` is optional (`code?: number`), and the function at line 44 returns early `if (!code) return "text-white/30"`. `String(undefined)` would produce `"undefined"` but the early return prevents that. |
| Is there validation? | **YES** — Early return on falsy code |
| Is there a default value? | **YES** — `"text-white/30"` on undefined/null |
| Is TypeScript protecting this path? | **YES** |
| **RISK** | **SAFE** |

---

## Occurrence #6 — AgentActivityMapper.ts:88

```ts
role.charAt(0).toUpperCase() + role.slice(1)
```

| Question | Answer |
|----------|--------|
| Can the variable be undefined? | **YES** — Called from multiple places with user-provided or store-derived role strings that could be undefined |
| Is there validation? | **NO** — No null/undefined check before `.charAt()` |
| Is there a default value? | **NO** — The fallback template literal will crash if `role` is undefined |
| Is TypeScript protecting this path? | **NO** — Parameter is `string` type, but callers may pass `string \| undefined` |
| **RISK** | **CRITICAL** — The fallback path is designed to handle unknown roles, but crashes instead |

---

## Occurrence #7 — OutputPanel.tsx:75

```ts
l.charAt(0).toUpperCase() + l.slice(1)
```

| Question | Answer |
|----------|--------|
| Can the variable be undefined? | **YES** — `l` comes from iterating `logLevels` array which could contain undefined entries |
| Is there validation? | **PARTIAL** — Checks `l === "all"` but not for undefined |
| Is there a default value? | **NO** |
| Is TypeScript protecting this path? | **PARTIAL** |
| **RISK** | **MEDIUM** — Only if `logLevels` has undefined entries |

---

## Occurrences #8, #9 — models-tab.tsx:165, 277

```ts
provider.name.charAt(0).toUpperCase()
```

| Question | Answer |
|----------|--------|
| Can the variable be undefined? | **YES** — `provider.name` could be undefined if a provider config is malformed |
| Is there validation? | **NO** |
| Is there a default value? | **NO** |
| Is TypeScript protecting this path? | **PARTIAL** — `GatewayProvider.name` is typed as `string` but runtime data like loaded configs may not conform |
| **RISK** | **HIGH** — Provider configs from localStorage or file could be corrupted |

---

## Occurrence #10 — UnifiedExecutor.ts:252

```ts
wired.runtimeRole.charAt(0).toUpperCase() + wired.runtimeRole.slice(1)
```

| Question | Answer |
|----------|--------|
| Can the variable be undefined? | **UNLIKELY BUT POSSIBLE** — `wired` is checked at line 245 (`if (!provider) return`), but `wired` itself is dereferenced at line 252 without a null check. However, `wired` comes from `runtimeState.wiredAgents.find(...)` (line 245 context) and `runtimeRole` is always populated in `computeGraphRaw` line 141 |
| Is there validation? | **PARTIAL** — Provider is checked, but `wired.runtimeRole` is not validated |
| Is there a default value? | **NO** |
| Is TypeScript protecting this path? | **YES** — WiredAgent.runtimeRole is typed as `RuntimeRole` (string) |
| **RISK** | **LOW** — Graph computation always assigns runtimeRole |

---

## Occurrence #11 — UnifiedExecutor.ts:362

```ts
runtimeRole.charAt(0).toUpperCase() + runtimeRole.slice(1)
```

| Question | Answer |
|----------|--------|
| Can the variable be undefined? | **NO** — Line 355-356: `const runtimeRole = normalizeRole(role) ?? role; if (!runtimeRole) continue` provides an explicit guard |
| Is there validation? | **YES** — Line 356 guards against null/undefined |
| Is there a default value? | **YES** — `normalizeRole(role) ?? role` provides fallback |
| Is TypeScript protecting this path? | **YES** |
| **RISK** | **SAFE** |

---

## Occurrence #12 — CodeBlockWithActions/index.tsx:71

```ts
lang.charAt(0).toUpperCase() + lang.slice(1)
```

| Question | Answer |
|----------|--------|
| Can the variable be undefined? | **YES** — `lang` comes from `block.language` which could be undefined for non-code blocks |
| Is there validation? | **NO** — No guard before `.charAt()`. The `labels[lang]` lookup would return undefined for unknown langs, then the `||` fallback calls `.charAt()` on the original `lang` which could be undefined |
| Is there a default value? | **PARTIAL** — The `labels[lang]` lookup serves as a map, but the `||` fallback `lang.charAt(0)...` is unguarded |
| Is TypeScript protecting this path? | **PARTIAL** |
| **RISK** | **HIGH** — Non-code blocks or blocks with missing language metadata will crash |

---

## Summary

| # | File | Line | Risk | Root Cause |
|---|------|------|------|------------|
| 1 | control-center.tsx | 630 | **CRITICAL** | `getAgentState()` returns `status.state` without fallback |
| 2 | code-canvas.tsx | 218 | MEDIUM | Unguarded `p.type` access |
| 3 | performance-dashboard.tsx | 215 | HIGH | Unguarded `health.status` |
| 4 | performance-dashboard.tsx | 394 | HIGH | Unguarded subsystem `status` |
| 5 | NetworkInspector.tsx | 45 | **SAFE** | Early return on falsy code |
| 6 | AgentActivityMapper.ts | 88 | **CRITICAL** | Unguarded `role` parameter |
| 7 | OutputPanel.tsx | 75 | MEDIUM | Unguarded `l` from array |
| 8 | models-tab.tsx | 165 | HIGH | Unguarded `provider.name` |
| 9 | models-tab.tsx | 277 | HIGH | Unguarded `provider.name` |
| 10 | UnifiedExecutor.ts | 252 | LOW | Graph always populates runtimeRole |
| 11 | UnifiedExecutor.ts | 362 | **SAFE** | Guarded by `if (!runtimeRole) continue` |
| 12 | CodeBlockWithActions/index.tsx | 71 | HIGH | Unguarded `lang` from block metadata |

**CRITICAL sites: 2** (#1, #6)
**HIGH sites: 5** (#3, #4, #8, #9, #12)
**MEDIUM sites: 2** (#2, #7)
**LOW sites: 1** (#10)
**SAFE sites: 2** (#5, #11)
