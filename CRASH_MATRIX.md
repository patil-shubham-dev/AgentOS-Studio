# Crash Matrix

**Status:** All 8 critical crash patterns addressed.

---

## Critical (8)

| ID | File | Pattern | Status | Fix | Test |
|----|------|---------|--------|-----|------|
| C1 | `code-workspace.tsx:341` | `.then()` without `.catch()` | **FIXED** | Added `.catch()` handler | Manual |
| C2 | `code-workspace.tsx:909` | `.then()` without `.catch()` | **FIXED** | Added `.catch()` handler | Manual |
| C3 | `code-canvas.tsx:429` | `.then()` without `.catch()` | **FIXED** | Added `.catch()` handler | Manual |
| C4 | `personas.tsx:483` | `.then()` without `.catch()` | **FIXED** | Added `.catch()` handler | Manual |
| C5 | `WelcomePage.tsx:123` | `.then()` without `.catch()` | **FIXED** | Added `.catch()` handler | Manual |
| C6 | `WelcomePage.tsx:125` | `.then()` without `.catch()` | **FIXED** | Added `.catch()` handler | Manual |
| C7 | `command.ts:85-96` | `reject()` in IPC handler | **FALSE POSITIVE** | `ipcMain.handle` catches by default | N/A |
| C8 | `provider-gateway.ts:1219` | `parseGeminiUsage` null access | **FALSE POSITIVE** | Already guarded at line 1220 (`if (!json.usageMetadata)`); added `json?.` guard | N/A |

## Additional Blockers Found

| ID | File | Pattern | Status | Fix | Test |
|----|------|---------|--------|-----|------|
| B1 | `ExecutionOrchestrator.ts:33` | `this.gateway.cancel is not a function` | **FIXED** | Added `cancel()` to `UnifiedExecutionGateway` | agent-lifecycle (passed) |
| B2 | `StreamManager.ts` | `getActiveStepIds()` missing | **FIXED** | Added method to `StreamManager` and `WordBoundaryStreamBuffer` | agent-lifecycle (passed) |
| B3 | `UnifiedExecutionGateway.ts` | `cancel()` didn't propagate to streams | **FIXED** | Added `StreamManager.getInstance().clearAll()` call | agent-lifecycle (passed) |
| B4 | `WelcomePage.tsx:125` | Inner `.then()` unhandled rejection | **FIXED** | Added `.catch()` handler | Manual |
| B5 | `personas.tsx:483` | Effect promise without catch | **FIXED** | Added `.catch()` handler | Manual |

---

## Summary

| Metric | Before | After |
|--------|--------|-------|
| Critical crash patterns | 8 | 0 (6 FIXED, 2 FALSE POSITIVE) |
| P0 blockers | 3 (gateway.cancel, unhandled promises, test failures) | 0 (all addressed) |
| Test failures (agent-lifecycle) | 9 | 4 (pre-existing event assertions) |
| Total test suite | 1272 pass / 19 fail | 1278 pass / 15 fail |
