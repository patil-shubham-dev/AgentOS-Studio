# Beta Failure Analysis

> Generated: 2026-06-24
> Purpose: Track, categorize, and analyze failures during RC1

---

## What We Track

Every failed task, abandoned session, and user-reported problem is recorded with:

| Field | Source | Example |
|-------|--------|---------|
| Event ID | Telemetry | `exec_20260624_001` |
| Timestamp | Telemetry | `2026-06-24T14:30:00Z` |
| Task ID | Beta task list | `1.3` |
| Failure type | Classification | `verification_failed` |
| Root cause category | Analysis | `execution` |
| Error code | Structured error | `PROVIDER_TIMEOUT` |
| User impact | PM assessment | `minor` |
| Recovered? | Telemetry | `true` |

---

## Failure Types

### Task Failures

| Type | Definition | Example |
|------|------------|---------|
| execution_failed | Execution threw an error | Provider API key invalid |
| verification_failed | Execution succeeded, verification failed | Lint error not caught |
| incorrect_edit | Edit was applied but was wrong | Wrong variable renamed |
| incomplete_edit | Edit was partial | Only 1 of 3 files changed |
| rejected_edit | User rejected the preview | Edit was not what user wanted |
| timed_out | Execution took too long | LLM stalled |
| crashed | App crashed during execution | OOM error |

### Abandoned Tasks

| Type | Definition | Example |
|------|------------|---------|
| user_cancelled | User explicitly cancelled | "Never mind" |
| user_abandoned | User closed app or navigated away | Left mid-execution |
| stalled_no_input | No user input for 5+ min | Walked away from desk |

---

## Root Cause Categories

### UX (User Experience)

| Sub-category | Indicator | Fix |
|-------------|-----------|-----|
| Unclear instructions | User asked "what should I do?" | Improve onboarding wizard |
| Hidden features | User didn't know feature existed | Add tooltips, discovery UI |
| Confusing error | Error message didn't help | Improve structured error text |
| Missing feedback | User unsure if app is working | Add progress indicators |
| Too many steps | User abandoned during multi-step flow | Reduce friction, batch steps |

### Execution

| Sub-category | Indicator | Fix |
|-------------|-----------|-----|
| Provider failure | PROVIDER_TIMEOUT, PROVIDER_API_KEY_INVALID | Better provider health checks |
| Wrong model | LLM output doesn't match request | Improve prompt engineering |
| Context overflow | Execution fails on large codebase | Improve context window management |
| Tool failure | File write fails, command times out | Better tool error handling |
| Circuit breaker | Execution blocked by circuit breaker | Adjust circuit breaker thresholds |

### Trust

| Sub-category | Indicator | Fix |
|-------------|-----------|-----|
| Wrong edit | Edit changed wrong thing | Improve impact analysis |
| Over-engineering | Edit added unnecessary complexity | Adjust agent instructions |
| Missing context | Edit didn't consider related code | Improve context assembly |
| Preview inaccurate | Preview didn't match actual change | Fix preview generation |
| Verification missed | Bug passed verification | Improve verification checks |

### Performance

| Sub-category | Indicator | Fix |
|-------------|-----------|-----|
| Slow startup | App takes >5s to launch | Optimize initialization |
| Slow execution | Response takes >30s | Optimize provider calls |
| Slow verification | Verification takes >60s | Parallelize checks |
| Memory leak | Memory grows over time | Fix leak sources |
| High CPU | Fan spins up during idle | Optimize background tasks |

### Reliability

| Sub-category | Indicator | Fix |
|-------------|-----------|-----|
| Crash | App terminates unexpectedly | Fix crash source |
| Freeze | App becomes unresponsive | Fix render-blocking operations |
| Data loss | Edits not saved | Fix persistence |
| State corruption | App shows wrong state | Fix state management |
| Network failure | Can't reach provider | Add retry + offline mode |

### Onboarding

| Sub-category | Indicator | Fix |
|-------------|-----------|-----|
| Install failure | Installer errors | Fix installer |
| Setup confusion | User stuck on provider setup | Improve wizard clarity |
| First prompt failure | First LLM call fails | Add first-prompt smoke test |
| Missing AGENTIC.md | User skipped generation | Make generation mandatory or auto |
| No value perceived | User didn't finish onboarding | Reduce time to first success |

---

## Analysis Process

### Step 1: Collect
```
Source: Telemetry events, error reports, user feedback, session recordings
Frequency: Continuous during RC1
```

### Step 2: Classify
```
For each failure:
  1. Assign failure type
  2. Assign root cause category
  3. Assign sub-category
  4. Assign severity: critical / major / minor / cosmetic
  5. Link to error code if available
```

### Step 3: Aggregate
```
Weekly aggregation:
  Total failures by category
  Failure rate (failures / total tasks)
  Most common failure types
  Most common root causes
  Trend (increasing / stable / decreasing)
```

### Step 4: Diagnose
```
For top 3 failure categories:
  1. Review 5 random samples
  2. Identify common pattern
  3. Propose fix
  4. Estimate impact (what % of failures would this fix address?)
```

### Step 5: Prioritize
```
Priority matrix:
  High impact + High frequency → Do immediately
  High impact + Low frequency → Plan for RC2
  Low impact + High frequency → Plan for RC2
  Low impact + Low frequency → Monitor
```

---

## Reporting

### Daily (internal)
```
- Total failures (last 24h)
- Crash count
- Critical failures (list)
```

### Weekly (PM + Engineering)
```
- Failure rate vs baseline
- Top 5 failure types
- Top 5 root causes
- Fixes deployed
- Fixes planned
- Trend analysis
```

### Final (RC1 review)
```
- Total failure count
- Failure rate by category
- Root cause distribution
- Recovery rate
- Top 10 issues found
- Top 10 improvements needed
- Recommendations for RC2
```

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Task failure rate | <10% |
| Abandonment rate | <5% |
| Crash rate | 0 |
| Recovery rate | >80% |
| User-reported issues logged | 100% |
| Issues triaged within 48h | 100% |

---

## Template: Failure Record

```yaml
id: "FAIL-20260624-001"
timestamp: "2026-06-24T14:30:00Z"
task_id: "1.3"
failure_type: "execution_failed"
root_cause:
  category: "execution"
  sub_category: "provider_failure"
  error_code: "PROVIDER_TIMEOUT"
severity: "major"
user_impact: "Could not complete task. Error message shown with retry option."
recovered: true
recovery_action: "retry"
user_comment: "It worked after retry"
notes: "Provider was rate limited. Circuit breaker triggered after 3 retries."
```
