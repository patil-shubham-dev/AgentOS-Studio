# Private RC1 Deployment Plan

> Generated: 2026-06-24
> Status: Ready for execution

---

## Build Artifacts

| Artifact | Format | Location |
|----------|--------|----------|
| Windows Installer | `.exe` (NSIS) | `dist/AgenticOS-Setup-{version}.exe` |
| Windows Portable | `.zip` | `dist/AgenticOS-Portable-{version}.zip` |
| Windows Update | `.exe` (delta) | `dist/AgenticOS-Update-{version}.exe` |
| Latest Metadata | `.json` | `dist/latest.json` |

### Build Commands

```bash
npm run build          # Production build
npm run package        # Create installer
npm run package:portable  # Create portable zip
```

### Versioning

```
Version: 0.12.0-rc1.{build}
Tag:     v0.12.0-rc1
Branch:  release/rc1
```

---

## Distribution Channels

### Channel A — Direct Download (primary)
- Signed installer hosted on private S3/CloudFlare R2
- Access-controlled URL per participant
- Expiring links (7 days)

### Channel B — Sideload (fallback)
- Portable `.zip` for users who cannot run installer
- Requires manual unzip to `%LOCALAPPDATA%\AgenticOS`

### Channel C — In-App Update
- Update check on launch via `latest.json`
- Delta updates for subsequent releases
- Full installer for initial install

---

## Participant Management

### Invite Flow
```
1. Program admin adds participant to roster
2. System generates unique invite link + access token
3. Email sent to participant with:
   - Download link
   - Access token
   - Quick start guide
   - Feedback channel (Discord/Slack)
4. Participant downloads, installs, enters token
5. Telemetry activates, onboarding begins
```

### Participant Roster

| Group | Type | Count | Recruiting Channel |
|-------|------|-------|--------------------|
| A | Claude Code users | 10 | Twitter/X, Reddit r/claudeai |
| B | Cursor users | 10 | Twitter/X, Reddit r/cursor |
| C | Codex users | 5 | GitHub Discussions |
| D | Senior developers | 5 | LinkedIn, personal network |
| E | OSS maintainers | 5 | GitHub Sponsors, maintainer communities |
| F | AI power users | 5 | AI newsletters, Discord communities |

### Access Tiers

| Tier | Privileges | Groups |
|------|------------|--------|
| Standard | All features, telemetry ON | A, B, C, F |
| Extended | Standard + early builds | D, E |

---

## Rollout Schedule

| Day | Milestone | Action |
|-----|-----------|--------|
| D-7 | Build verification | Run full test suite, create installer, smoke test on clean Windows VM |
| D-3 | Internal dogfood | Team installs RC1, runs onboarding flow, reports issues |
| D-1 | Invite batch 1 | Send invites to Groups A + D (15 users) |
| D+1 | Monitor | Check install success rate, crash reports, onboarding metrics |
| D+3 | Invite batch 2 | Send invites to Groups B + E (15 users) |
| D+5 | Invite batch 3 | Send invites to Groups C + F (10 users) |
| D+7 | Checkpoint | Review install success, crash rate, onboarding metrics. Pause if <90% success |
| D+14 | Mid-program review | Full metrics review, adjust if needed |
| D+28 | Program end | Collect final feedback, generate RC2 plan |

### Rollback Plan

If critical crash rate exceeds 2% or data loss is reported:
1. Notify all participants immediately
2. Provide rollback instructions (reinstall previous stable version)
3. Fix issue, rebuild, notify participants of updated build
4. Update installer with fixed version

---

## Telemetry Infrastructure

| Component | Service |
|-----------|---------|
| Error tracking | Sentry (self-hosted or cloud) |
| Usage analytics | PostHog (self-hosted) |
| Crash reporting | Sentry |
| Performance | PostHog `$performance` events |
| Feedback | In-app survey (PostHog) + Discord |

### Privacy

- All telemetry is opt-in (consent dialog on first launch)
- No code content collected (file paths, edit content, prompts are excluded)
- Only metadata: event type, duration, success/fail, counters
- Users can opt out at any time via Settings
- Telemetry data retained for 90 days post-program

---

## Post-Launch Checklist

| Item | Owner | Timeline |
|------|-------|----------|
| Monitor Sentry for new errors | On-call | Daily |
| Check onboarding completion rate | PM | Daily (D+1 through D+7) |
| Review feedback channel | PM | Daily |
| Triage critical bugs | Engineering | Within 4 hours |
| Patch release for critical bugs | Engineering | Within 24 hours |
| Weekly progress summary | PM | Every Monday |
| Participant check-in | PM | Every participant at D+7 |

---

## Success Criteria (Deployment)

| Metric | Target |
|--------|--------|
| Install success rate | 95%+ |
| Participants enrolled | 30+ |
| Crash-free rate | 98%+ |
| Data loss incidents | 0 |
| Patch turnaround (critical) | <24 hours |
