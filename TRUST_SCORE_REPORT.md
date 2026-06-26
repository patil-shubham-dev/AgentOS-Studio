# Trust Score Report

> Generated: 2026-06-24 (baseline)
> Updated: [TBD — after RC1 data collection]
> Purpose: Measure user trust in AgenticOS's code changes

---

## Trust Score Definition

Trust Score is a weighted composite of behavioral signals (what users do) and survey responses (what users say).

### Behavioral Component (60%)

| Signal | Weight | Measurement | Ideal |
|--------|--------|-------------|-------|
| Edit Acceptance Rate | 40% | `preview.approved / (preview.approved + preview.rejected)` | >80% |
| Undo Rate (inverse) | 20% | `1 - (undo.restored / undo.created)` | >90% (low undo) |
| Verification Viewing Rate | 20% | `verify.viewed / verify.completed` | >80% |
| Confidence Badge Interaction | 10% | `trust.confidence_viewed / trust.layer.opened` | >50% |
| Repair Auto-Approval Rate | 10% | `repair.approved / repair.started` | >70% |

### Survey Component (40%)

| Signal | Weight | Source | Ideal |
|--------|--------|--------|-------|
| Trust rating | 50% | Exit survey Q1: "How much do you trust AgenticOS?" | >8/10 |
| Edit acceptance self-report | 25% | Exit survey Q16: "How often accept without modification?" | >7/10 |
| Verification confidence | 25% | Exit survey Q17: "Rate verification thoroughness" | >8/10 |

---

## Scoring Formula

```
Behavioral Score = Σ(signal_i × weight_i)
Survey Score = Σ(signal_i × weight_i)
Trust Score = (Behavioral × 0.6) + (Survey × 0.4)

Normalized to 0–10 scale.
```

---

## Baseline (Pre-RC1)

| Signal | Baseline | Notes |
|--------|----------|-------|
| Edit Acceptance Rate | UNMEASURED | No user data yet |
| Undo Rate | UNMEASURED | No user data yet |
| Verification Viewing Rate | UNMEASURED | No user data yet |
| Confidence Badge Interaction | UNMEASURED | No user data yet |
| Repair Auto-Approval Rate | UNMEASURED | No user data yet |
| Trust Score | UNMEASURED | No user data yet |

**Current estimate (internal):** 4.5/10

---

## Target

| Metric | RC1 Target | Stretch Goal |
|--------|------------|--------------|
| Trust Score | 8.0/10 | 9.0/10 |
| Edit Acceptance Rate | 80% | 90% |
| Undo Rate (files not reverted) | 90% | 95% |
| Verification Viewing Rate | 80% | 90% |
| Survey Trust Rating | 8/10 | 9/10 |

---

## Dashboard

```
Trust Score Dashboard (Week X)
═══════════════════════════════

Overall Trust Score: 7.2/10 ◐ (target: 8.0)

Signals:
  Edit Acceptance Rate:  76%  ◐ (target: 80%)
  Undo Rate (inverse):   88%  ◐ (target: 90%)
  Verification Viewing:  72%  ○ (target: 80%)
  Conf. Badge Interact:  45%  ● (target: 50%)

Survey (n=12):
  Trust rating:          7.8  ◐ (target: 8.0)
  Edit acceptance:       7.2  ○ (target: 7.0)
  Verification conf:     7.5  ○ (target: 8.0)

Weekly Change: +0.3
Trend: ↗ Improving
```

---

## Trust-Building Interventions

If trust score drops below 6/10 at any checkpoint:

### Level 1: Passive (score 5–6)
- Show verification results more prominently
- Add "Why this change?" explanation to preview
- Highlight undo availability

### Level 2: Active (score 4–5)
- All of Level 1, plus:
- Add explicit confidence indicator to each edit
- Show diff with inline annotations
- Reduce autonomous mode scope (require more approvals)

### Level 3: Manual (score <4)
- All of Level 2, plus:
- Default to manual approval mode
- Require user confirmation for every write
- Show detailed impact analysis before each step

---

## Why Trust Matters

| Scenario | Trust Score | User Behavior |
|----------|-------------|---------------|
| High trust | 8+ | Auto-approves edits, rarely undoes, recommends to others |
| Moderate trust | 6-8 | Reviews most edits, occasional undo, neutral recommendation |
| Low trust | 4-6 | Reviews all edits, frequent undo, would not recommend |
| No trust | <4 | Does not use AI features, uninstalls |

The goal of RC1 is to move from "no trust" (estimated 4.5) to "moderate trust" (8.0).

---

## Per-User Tracking

Each participant gets a personal trust score trajectory:

```
User #A7: Trust Trajectory
  Week 1: 5.2 (cautious)
  Week 2: 6.8 (trying more features)
  Week 3: 7.5 (approving more edits)
  Week 4: 8.1 (recommending to team)
  Trend: ↗ Strong improvement
```

This identifies:
- Power users (fast trust growth)
- Skeptics (slow/no trust growth — interview to understand why)
- Churn risks (declining trust — intervene early)
