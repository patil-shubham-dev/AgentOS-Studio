# Trust Audit

**Goal:** Identify moments where user trust is broken.

---

## Trust Dimensions

| Dimension | Definition | Measured By |
|-----------|------------|-------------|
| Confidence Scores | Does the user believe the tool's self-assessment? | Accuracy of confidence vs actual outcome |
| Verification Results | Does the user trust that verification catches all issues? | False negative rate |
| Repair Results | Does the user trust that auto-repair fixes correctly? | Breakage rate of auto-fixes |
| Tool Execution | Does the user trust tool calls execute correctly? | Tool failure rate |
| Code Changes | Does the user trust edits won't corrupt code? | Silent no-op edit rate |
| Recommendations | Does the user trust suggestions are relevant? | Acceptance rate |

---

## Trust-Breaking Moments

### Moment 1: Silent Error — Empty Catch Blocks

**Evidence:** 50+ empty `catch {}` blocks across the codebase. When services
fail (e.g., `WorkspaceManager.ts:13` catch blocks), errors are swallowed.
The user sees no indication anything went wrong.

**Trust Impact:** User believes operation succeeded. State may be corrupted.
On next interaction, unexpected behavior erodes trust.

**Severity:** HIGH

**Fix Status:** Recommended for post-RC1 (P0)

---

### Moment 2: Generic Error Messages

**Evidence:** `UnifiedExecutor.ts:250` — all errors funneled through:
```
catch (err) {
  const errMsg = err instanceof Error ? err.message : String(err)
  yield { type: "EXECUTION_FAILED", executionId, error: errMsg, ...
}
```

No structured error codes. No suggested fix. No "what happened" explanation.

**Trust Impact:** User sees "Execution failed: something broke" with no
actionable information. Cannot determine if it's their fault, provider's
fault, or product's fault.

**Severity:** HIGH

**Fix Status:** Recommended for post-RC1 (P1)

---

### Moment 3: Unconfirmed Agent Assignment

**Evidence:** `ExecutionOrchestrator.execute()` starts immediately when called.
No confirmation dialog. No "I'm about to do X, proceed?" prompt.

**Trust Impact:** User types a request and the product immediately acts.
If the action is wrong, user has no chance to cancel before execution starts.

**Severity:** MEDIUM

**Fix Status:** Unaddressed

---

### Moment 4: Edit Preview Missing

**Evidence:** `EditFileTool.ts:127` — `applyEdits()` executes immediately.
No diff preview shown to user before write.

**Trust Impact:** User cannot review changes before they're applied.
Must trust the tool got the edit right. One bad edit breaks trust permanently.

**Severity:** HIGH

**Fix Status:** Unaddressed (UX score gap contributor)

---

### Moment 5: Verification Not Rendered

**Evidence:** `VERIFY_PASSED` / `VERIFY_FAILED` events are generated but
`ExecutionTimeline.tsx` doesn't render them.

**Trust Impact:** User told "verification will catch issues" but never sees
verification results. Cannot confirm code quality. Trust in the safety net
erodes.

**Severity:** MEDIUM

**Fix Status:** Unaddressed

---

### Moment 6: Confidence Score Not Displayed

**Evidence:** `EngineeringResult.confidence` field exists (nullable number)
but no UI displays it.

**Trust Impact:** The product computes confidence internally but doesn't
share it with the user. User cannot calibrate their trust based on the
tool's own self-assessment.

**Severity:** LOW

**Fix Status:** Unaddressed

---

### Moment 7: No Undo for Edits

**Evidence:** `WorkspaceSnapshotManager.ts` supports rollback on failure
but no user-facing undo mechanism exists.

**Trust Impact:** Every edit is permanent from user's perspective. One bad
edit = manual revert. User becomes reluctant to use auto-edit features.

**Severity:** HIGH

**Fix Status:** Unaddressed

---

## Trust Score

| Dimension | Score | Gap |
|-----------|-------|-----|
| Confidence Scores | 3/10 | Not displayed to user |
| Verification Results | 4/10 | Events generated but not rendered |
| Repair Results | 5/10 | Auto-rollback works but user not informed |
| Tool Execution | 6/10 | Silent catch blocks hide failures |
| Code Changes | 3/10 | No preview, no undo |
| Recommendations | 6/10 | No acceptance tracking |

**Overall Trust Score: 4.5/10** — Target: 8+

---

## Key Insights

1. **The product has the mechanisms** (snapshots, verification, rollback)
   but **hides them from the user**. The gap is UI, not engineering.

2. **Silence erodes trust.** Every empty catch block, every unrendered event,
   every hidden verification result is a trust-deficit moment.

3. **Fix order:** Preview edits → Show verification → Enable undo →
   Show confidence → Structured errors → Kill silent catches
