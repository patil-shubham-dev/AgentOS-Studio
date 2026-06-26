# Onboarding Validation

> Generated: 2026-06-24
> Purpose: Measure and validate user onboarding flow

---

## Onboarding Funnel

Each step must succeed for the user to reach the next. Each failure is recorded with structured error data.

```
Install
  → Launch
    → Welcome Wizard
      → Workspace Open
        → Provider Setup
          → AGENTIC.md Generation
            → First Prompt
              → First Code Edit
                → Verification
                  → Undo
```

---

## Step 1: Install Success

| Metric | Target | Measurement |
|--------|--------|-------------|
| Install completion | 95%+ | Installer exit code 0 |
| Install time | <60s | Timer from launch to finish |
| Post-install launch | 95%+ | First launch within 30s of install |

**Failure tracking:**
- Installer crashes → Sentry error with `installer.crash`
- Anti-virus blocks → user reports via feedback channel
- Permission denied → `INSTALLER_PERMISSION_DENIED`
- Disk space → `INSTALLER_DISK_SPACE`

**Recovery:**
- Provide portable `.zip` as fallback
- Document AV exclusion steps in quick start guide

---

## Step 2: Workspace Open Success

| Metric | Target | Measurement |
|--------|--------|-------------|
| Workspace open | 95%+ | `workspace.open` event |
| First load time | <3s | Timer from click to tree render |

**Failure tracking:**
- Path not found → `WORKSPACE_FILE_NOT_FOUND`
- Permission denied → `WORKSPACE_PERMISSION_DENIED`
- Empty directory → logged but not a failure

**Recovery:**
- Show friendly error with path
- Offer "Choose Another Folder" button
- Log structured error for debugging

---

## Step 3: Provider Setup Success

| Metric | Target | Measurement |
|--------|--------|-------------|
| API key entered | 100% | `provider.api_key_set` event |
| Provider validation | 90%+ | `provider.validation` event (success/fail) |
| Time to setup | <120s | Timer from wizard start to done |

**Failure tracking:**
- Invalid API key → `PROVIDER_API_KEY_INVALID`
- Network timeout → `PROVIDER_TIMEOUT`
- Rate limited → `PROVIDER_RATE_LIMITED`

**Recovery:**
- Show structured error with problem/cause/recovery
- Offer to retry or enter different key
- Provide link to API key dashboard

---

## Step 4: AGENTIC.md Generation Success

| Metric | Target | Measurement |
|--------|--------|-------------|
| Generation triggered | 95%+ | `agentic.generate` event |
| Generation success | 95%+ | `agentic.generated` event |
| Generation time | <5s | Timer from start to write |

**Failure tracking:**
- Scan failed → logged with error details
- Write failed → `WORKSPACE_PERMISSION_DENIED`
- Timeout → logged with duration

**Recovery:**
- Retry with exponential backoff (max 3 attempts)
- Show structured error if all attempts fail
- Offer manual creation option

---

## Step 5: First Prompt Success

| Metric | Target | Measurement |
|--------|--------|-------------|
| First prompt sent | 90%+ | `execution.created` event |
| First response received | 90%+ | `execution.complete` or first agent message |
| Time to first response | <15s | Timer from send to first token |

**Failure tracking:**
- Provider unavailable → `PROVIDER_API_KEY_MISSING` or `PROVIDER_TIMEOUT`
- Execution blocked → `EXECUTION_CONCURRENT_NOT_ALLOWED`
- Circuit breaker open → `EXECUTION_CIRCUIT_BREAKER_OPEN`

**Recovery:**
- Show structured error with clear fix instruction
- Offer retry button

---

## Step 6: First Code Edit Success

| Metric | Target | Measurement |
|--------|--------|-------------|
| Edit preview shown | 90%+ | `preview.shown` event |
| Edit approved | 80%+ | `preview.approved` event |
| Edit applied | 95%+ | `edit.applied` event |

**Failure tracking:**
- Preview generation failed → logged with error
- User rejected → `preview.rejected` (not a failure, but tracked)
- Write failed → `WORKSPACE_PERMISSION_DENIED`

**Recovery:**
- Show structured error for write failures
- Offer retry with elevated permissions
- Log rejection reason (optional user input)

---

## Step 7: Verification Success

| Metric | Target | Measurement |
|--------|--------|-------------|
| Verification triggered | 90%+ | `verify.started` event |
| Verification completed | 90%+ | `verify.passed` or `verify.failed` |
| Verification time | <30s | Timer from start to complete |

**Failure tracking:**
- Build command missing → logged as skipped
- Test command missing → logged as skipped
- Any check failed → `verify.failed` with details

**Recovery:**
- Show verification results panel with pass/fail counts
- Offer repair flow on failure
- Display structured error per failed check

---

## Step 8: Undo Success

| Metric | Target | Measurement |
|--------|--------|-------------|
| Undo available | 100% | Snapshot created before every edit |
| Undo triggered | 50%+ | `undo.triggered` event (at least once) |
| Undo success | 100% | `undo.completed` event |

**Failure tracking:**
- Snapshot missing → logged as error
- Restore failed → logged with file system error
- Partial restore → logged with count of restored files

**Recovery:**
- Show error with list of files that failed to restore
- Offer manual restore instructions

---

## Time-to-Value Tracking

| Milestone | Target | Measurement |
|-----------|--------|-------------|
| Install to first launch | <60s | Timer A |
| Launch to workspace open | <30s | Timer B |
| Workspace to provider setup | <120s | Timer C |
| Provider to first prompt | <60s | Timer D |
| First prompt to first edit | <180s | Timer E |
| **Total: install to first edit** | **<10 min** | **Sum A–E** |

---

## Onboarding Scoring

| Score | Meaning |
|-------|---------|
| 10/10 | All steps completed, all targets met |
| 8/10 | All steps completed, most targets met |
| 6/10 | All steps completed, some targets missed |
| 4/10 | Some steps failed, recovery worked |
| 2/10 | Some steps failed, recovery failed |
| 0/10 | User abandoned during onboarding |

**Target: 8+/10 average across all participants.**

---

## Data Collection

| Data Point | Collection Method | PII? |
|------------|------------------|------|
| Step completion | Telemetry event | No |
| Step duration | Telemetry timer | No |
| Failure type | Structured error code | No |
| Recovery action | Telemetry event | No |
| User feedback | In-app survey | Yes (optional) |
| Screen recording | Optional, consent-only | Yes |

All onboarding data is anonymized. No code content, file paths, or API keys are collected.
