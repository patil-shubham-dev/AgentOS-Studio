# Error Experience Report

**Goal:** Validate that every error communicates: Problem, Cause, Fix, Recovery.

---

## Error Categories

### Provider Errors

| Scenario | Error Shown | Problem Clear? | Cause Clear? | Fix Clear? | Recovery Clear? |
|----------|-------------|----------------|-------------|------------|------------------|
| API key missing | `EXECUTION_FAILED` with "Provider not found" | ⚠️ Partial | ❌ No | ❌ No | ❌ No |
| API key invalid | `EXECUTION_FAILED` with HTTP 401 | ⚠️ Partial | ⚠️ Partial | ❌ No | ❌ No |
| Provider timeout | `EXECUTION_FAILED` with "Provider timed out" | ✅ Yes | ⚠️ Partial | ❌ No | ❌ No |
| Rate limited | Generic HTTP 429 passthrough | ❌ No | ❌ No | ❌ No | ❌ No |

**Verdict:** Provider errors lack structured error codes and fix instructions.
User sees raw error text with no guidance.

### Network Errors

| Scenario | Error Shown | Problem Clear? | Cause Clear? | Fix Clear? | Recovery Clear? |
|----------|-------------|----------------|-------------|------------|------------------|
| Offline | Exception thrown at provider call | ❌ No | ❌ No | ❌ No | ❌ No |
| DNS failure | `fetch` throws `TypeError: Failed to fetch` | ❌ No | ❌ No | ❌ No | ❌ No |

**Verdict:** Network errors are indistinguishable from provider errors. User
cannot tell if the problem is their network or the provider's API.

### Workspace Errors

| Scenario | Error Shown | Problem Clear? | Cause Clear? | Fix Clear? | Recovery Clear? |
|----------|-------------|----------------|-------------|------------|------------------|
| File not found | `read_file` tool returns error | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ Partial |
| File locked by another process | `write_file` throws OS error | ❌ No | ❌ No | ❌ No | ❌ No |
| Permission denied | OS error passthrough | ⚠️ Partial | ⚠️ Partial | ❌ No | ❌ No |

**Verdict:** File tool errors are handled but OS-level errors (lock, perm)
pass through raw with no user-friendly wrapping.

### Agent Errors

| Scenario | Error Shown | Problem Clear? | Cause Clear? | Fix Clear? | Recovery Clear? |
|----------|-------------|----------------|-------------|------------|------------------|
| No agents configured | `EXECUTION_FAILED` "No agents configured" | ✅ Yes | ✅ Yes | ⚠️ Partial | ❌ No |
| Role not wired | `[UnifiedExecutor] Role "coder" is not wired` | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| Agent execution timeout | Exception in agent executor | ✅ Yes | ✅ Yes | ❌ No | ❌ No |

**Verdict:** Agent errors are the most clear, thanks to explicit checks
at UnifiedExecutor.ts:171-182. Still lacks recovery guidance.

### Verification Errors

| Scenario | Error Shown | Problem Clear? | Cause Clear? | Fix Clear? | Recovery Clear? |
|----------|-------------|----------------|-------------|------------|------------------|
| Lint error found | VERIFY_FAILED event (not rendered in UI) | ✅ Yes (in events) | ✅ Yes | ❌ No | ❌ No |
| Build failure | VERIFY_FAILED event (not rendered in UI) | ✅ Yes (in events) | ✅ Yes | ❌ No | ❌ No |
| Test failure | VERIFY_FAILED event (not rendered in UI) | ✅ Yes (in events) | ✅ Yes | ❌ No | ❌ No |

**Verdict:** Verification results exist in event stream but are NOT rendered
in any UI component. The user cannot see them.

### Build Errors

| Scenario | Error Shown | Problem Clear? | Cause Clear? | Fix Clear? | Recovery Clear? |
|----------|-------------|----------------|-------------|------------|------------------|
| TypeScript error | `tsc` output in logs only | ❌ No | ⚠️ Partial | ❌ No | ❌ No |
| Build command fails | Error passthrough | ❌ No | ❌ No | ❌ No | ❌ No |

**Verdict:** Build errors are not surfaced in the product UI at all.

### Test Failures

| Scenario | Error Shown | Problem Clear? | Cause Clear? | Fix Clear? | Recovery Clear? |
|----------|-------------|----------------|-------------|------------|------------------|
| `npm test` fails | Raw test runner output | ⚠️ Partial | ⚠️ Partial | ❌ No | ❌ No |

**Verdict:** Test output is raw stdout — no structured error report.

---

## Score Summary

| Category | Average Score | Assessment |
|----------|--------------|------------|
| Provider Errors | 2.8/10 | Raw API error passthrough |
| Network Errors | 1.5/10 | Indistinguishable from provider errors |
| Workspace Errors | 4.5/10 | File tools good; OS errors bad |
| Agent Errors | 6.0/10 | Best category; still lacks recovery guidance |
| Verification Errors | 5.0/10 | Events exist but hidden from UI |
| Build Errors | 2.0/10 | Not surfaced in product |
| Test Failures | 2.0/10 | Raw output only |

**Overall Error Experience Score: 3.4/10**

---

## Recommendations

1. **Create structured error schema** with fields: `code`, `message`,
   `cause`, `fixHint`, `documentationUrl`, `recoverable`
2. **Surface verification events** in ExecutionTimeline UI
3. **Wrap OS/file errors** with user-friendly messages
4. **Add recovery buttons** to error UI ("Retry", "Reconfigure", "View Logs")
5. **Render build/test failures** as structured reports, not raw text
