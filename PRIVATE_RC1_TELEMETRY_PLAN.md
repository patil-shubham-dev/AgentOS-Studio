# Private RC1 Telemetry Plan

> Generated: 2026-06-24
> Purpose: Define what to track, how to track it, and how to use the data

---

## Telemetry Architecture

```
User Action
  ↓
Event Emitted (codebase: EventBus / ObservabilityManager)
  ↓
Telemetry Buffer (browser process, in-memory, max 1000 events)
  ↓
Flush every 60s / 100 events / on app close
  ↓
POST to telemetry endpoint (PostHog)
  ↓
PostHog dashboards + Sentry for errors/crashes
```

### Privacy Filter Layer

All events pass through a privacy filter (`TelemetryPrivacyFilter`) before transmission:

| Removed | Kept |
|---------|------|
| File paths | File extension counts |
| Code content | Line counts, character counts |
| API keys | Provider type (e.g., "openai", "anthropic") |
| Prompts | Prompt length (tokens) |
| Edit content | Edit file count, changed lines |
| Error messages | Error code, error category |
| User identity | Anonymous ID (UUID, no PII link) |

---

## Events

### Application Lifecycle

| Event | Properties | Frequency |
|-------|------------|-----------|
| `app.launch` | version, os, os_version, arch | Every launch |
| `app.quit` | session_duration_ms, crash_flag | Every quit |
| `app.crash` | error_code, error_category, stack_hash | On crash |
| `app.error` | error_code, error_category, recoverable | On unhandled error |
| `app.update.available` | new_version | On update check |
| `app.update.installed` | old_version, new_version | On update install |

### Workspace

| Event | Properties | Frequency |
|-------|------------|-----------|
| `workspace.open` | root_depth, file_count, is_git_repo | Every open |
| `workspace.close` | session_duration_ms | Every close |
| `workspace.file_tree.rendered` | node_count, render_ms | After tree render |
| `workspace.file.opened` | extension, size_kb | Per file open (sampled 1:10) |
| `workspace.file.saved` | extension, size_kb | Per file save (sampled 1:10) |

### AGENTIC.md

| Event | Properties | Frequency |
|-------|------------|-----------|
| `agentic.generate.started` | — | Per generation |
| `agentic.generate.completed` | duration_ms, profile_fields | Per generation |
| `agentic.generate.failed` | error_code, duration_ms | Per failure |
| `agentic.load` | hash_prefix, duration_ms | Per load |
| `agentic.parse` | section_count, duration_ms | Per parse |

### Execution

| Event | Properties | Frequency |
|-------|------------|-----------|
| `execution.created` | mode, correlation_id_prefix | Per execution |
| `execution.complete` | duration_ms, event_count, mode | Per execution |
| `execution.failed` | error_code, duration_ms, stage | Per failure |
| `execution.cancelled` | duration_ms, stage | Per cancellation |
| `execution.concurrent.denied` | — | Per block |
| `execution.circuit_breaker.opened` | reason | Per open |
| `execution.circuit_breaker.closed` | — | Per close |

### Tool Execution

| Event | Properties | Frequency |
|-------|------------|-----------|
| `tool.started` | tool_name, input_size | Per tool call |
| `tool.completed` | tool_name, duration_ms, success | Per tool completion |
| `tool.failed` | tool_name, error_code, duration_ms | Per failure |
| `tool.timeout` | tool_name, timeout_ms | Per timeout |

### Edit Preview

| Event | Properties | Frequency |
|-------|------------|-----------|
| `preview.shown` | file_count, risk_score | Per preview |
| `preview.approved` | file_count, risk_score, view_duration_ms | Per approval |
| `preview.rejected` | file_count, risk_score, view_duration_ms, reason? | Per rejection |
| `preview.edited` | — | Per prompt edit |

### Verification

| Event | Properties | Frequency |
|-------|------------|-----------|
| `verify.started` | check_count | Per verification |
| `verify.passed` | duration_ms, check_count, passed_count | Per pass |
| `verify.failed` | duration_ms, check_count, failed_checks | Per failure |
| `verify.check.started` | check_name | Per check |
| `verify.check.passed` | check_name, duration_ms | Per check pass |
| `verify.check.failed` | check_name, duration_ms, error_code | Per check fail |
| `verify.repair.started` | attempt_number | Per repair |
| `verify.repair.completed` | attempt_number, success, duration_ms | Per repair end |
| `verify.repair.failed` | attempt_number, duration_ms | Per repair failure |

### Undo

| Event | Properties | Frequency |
|-------|------------|-----------|
| `undo.snapshot.created` | file_count, size_kb | Per snapshot |
| `undo.snapshot.restored` | file_count, duration_ms | Per restore |
| `undo.snapshot.cleared` | — | Per clear |
| `undo.panel.opened` | — | Per open |
| `undo.list.viewed` | snapshot_count | Per view |

### Trust

| Event | Properties | Frequency |
|-------|------------|-----------|
| `trust.layer.opened` | — | Per open |
| `trust.confidence_viewed` | component | Per view |
| `trust.verification_viewed` | — | Per view |

### User Feedback

| Event | Properties | Frequency |
|-------|------------|-----------|
| `feedback.survey.shown` | survey_name | Per show |
| `feedback.survey.completed` | survey_name, score, duration_ms | Per completion |
| `feedback.survey.dismissed` | survey_name | Per dismiss |
| `feedback.in_app.triggered` | type | Per trigger |
| `feedback.in_app.submitted` | type, category | Per submit |

### Error Recovery

| Event | Properties | Frequency |
|-------|------------|-----------|
| `recovery.attempted` | error_code, recovery_action | Per recovery |
| `recovery.succeeded` | error_code, recovery_action, duration_ms | Per success |
| `recovery.failed` | error_code, recovery_action, duration_ms | Per failure |

---

## Metrics (Derived from Events)

### Daily Active Users
```
Unique anonymous IDs with ≥1 `app.launch` event in 24h window
```

### Session Duration
```
`app.quit.session_duration_ms` — average per user per day
```

### Task Completion Rate
```
execution.complete / (execution.created - execution.concurrent.denied)
```

### Edit Approval Rate
```
preview.approved / (preview.approved + preview.rejected)
```

### Undo Usage Rate
```
undo.snapshot.restored / undo.snapshot.created
```

### Verification Usage Rate
```
verify.started / execution.complete
```

### Repair Usage Rate
```
verify.repair.started / verify.failed
```

### Trust Score
```
Weighted composite:
  40% = edit approval rate
  20% = undo rate (lower is better)
  20% = verification viewing rate
  20% = confidence badge interaction rate
```

### NPS (Net Promoter Score)
```
Survey: "How likely are you to recommend AgenticOS?"
  9-10 = Promoters
  7-8  = Passives
  0-6  = Detractors
  NPS = %Promoters - %Detractors
```

---

## Dashboards

### Dashboard 1: Health
- Crash-free rate (24h)
- Error rate by category
- Active users (24h)
- Session duration (avg, p50, p95)

### Dashboard 2: Onboarding
- Funnel completion rate per step
- Time-to-value (install to first edit)
- Step failure rates
- Recovery success rates

### Dashboard 3: Engagement
- DAU/WAU/MAU
- Sessions per user per day
- Task completion rate
- Edit approval rate
- Verification usage rate
- Undo usage rate

### Dashboard 4: Quality
- Verification pass rate
- Repair success rate
- Trust score
- User satisfaction score
- Error rate by category

---

## Data Retention

| Data Type | Retention | Rationale |
|-----------|-----------|-----------|
| Raw events | 90 days | Program analysis |
| Aggregated metrics | 2 years | Trend comparison |
| Crash reports | 1 year | Debugging |
| Survey responses | 90 days | Feedback analysis |
| PII (email, Discord handle) | 30 days post-program | Participant communication |

---

## Opt-Out

Users can opt out at any time via:
1. Settings → Privacy → Disable Telemetry
2. Reply to invite email with "unsubscribe"

On opt-out:
- Telemetry buffer is flushed immediately
- No further events are collected
- Existing data is retained (anonymized, cannot be re-associated)
