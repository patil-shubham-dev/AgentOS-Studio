# RC2 Planning

> Generated: 2026-06-24 (framework)
> Updated: [TBD — after RC1 feedback analysis]
> Purpose: Define RC2 scope based solely on user evidence

---

## Rule

**No speculative features.**

**No architecture-driven work.**

**No intelligence-driven work.**

**Only user-driven priorities.**

Every RC2 feature must be supported by evidence from RC1 user feedback, telemetry, or failure analysis. If no user asked for it, it does not go into RC2.

---

## Evidence Sources

| Source | Weight | Used For |
|--------|--------|----------|
| Exit survey open responses | High | Feature requests, pain points |
| Failure analysis | High | Reliability improvements |
| Telemetry (usage patterns) | Medium | UX optimization |
| Weekly check-in responses | Medium | Satisfaction tracking |
| Feedback channel | High | Bug reports, suggestions |
| Session recordings (opt-in) | Low | Deep UX analysis |

---

## Candidate Categories

### P0: Critical (must fix for RC2)

Identified by:
- Crashes (frequency > 2% of sessions)
- Data loss (any incident)
- Task failure rate > 20%
- Trust score < 6/10
- NPS < 0

### P1: High Priority (should fix for RC2)

Identified by:
- User explicitly requested (≥3 users)
- Task failure rate 10–20%
- Trust score 6–7/10
- Satisfaction score < 7/10

### P2: Nice to Have (if time permits)

Identified by:
- User explicitly requested (<3 users)
- Performance p95 > 2x target
- UX friction identified in session recordings

### P3: Deferred (post-RC2)

Identified by:
- No user request
- Internal team idea only
- Speculative improvement

---

## Planning Process

### Step 1: Collect Evidence (Weeks 1–4)

```
During RC1 program:
  - Log every user request, complaint, and suggestion
  - Tag with category and frequency
  - Record failure analysis results
  - Track satisfaction scores
```

### Step 2: Categorize (End of Week 4)

```
For each evidence item:
  - Assign category (P0/P1/P2/P3)
  - Assign domain (execution/ux/trust/performance/etc.)
  - Estimate effort (small/medium/large)
  - Write one-sentence justification citing specific evidence
```

### Step 3: Prioritize (End of Week 4)

```
Rank P0 + P1 items by:
  1. User impact (how many users affected)
  2. Severity (how bad is the problem)
  3. Effort (how hard to fix)
  
  Top 10 items → RC2 scope
```

### Step 4: Scope RC2 (Week 5)

```
RC2 scope document:
  - Items: Top 10 P0/P1
  - Effort: Total engineering weeks
  - Timeline: Target release date
  - Success criteria: How we'll know it's fixed
```

---

## Examples of Evidence-Driven RC2 Items

### Good (evidence-supported)
```
"Fix provider timeout handling"
  Evidence: 23 timeout failures across 8 users (failure analysis)
  Category: P0
  Domain: execution
```

```
"Add inline diff view to edit preview"
  Evidence: 5 users requested "see what changed" (feedback channel)
  Category: P1
  Domain: ux
```

### Bad (speculative, NOT allowed)
```
"Add knowledge graph visualization"
  Evidence: No user asked for this. Internal team idea.
  Category: P3 (deferred)
  Rule: No architecture-driven work
```

```
"Rewrite planner for better multi-step reasoning"
  Evidence: No user reported planning issues.
  Category: P3 (deferred)
  Rule: No intelligence-driven work
```

---

## Success Criteria

RC2 is approved when:
1. All P0 items from RC1 are fixed and verified
2. Top 10 P0/P1 items from user evidence are scoped
3. Total effort ≤ 6 engineering weeks
4. Target release date within 6 weeks of RC2 start
5. No items without user evidence in the scope

---

## Timeline

| Milestone | Date | Action |
|-----------|------|--------|
| RC1 program ends | D+28 | Collect all feedback, export all data |
| Evidence analysis | D+28 to D+35 | Analyze, categorize, prioritize |
| RC2 scope defined | D+35 | Document top 10 items |
| RC2 development | D+35 to D+77 | 6 weeks of dev |
| RC2 internal QA | D+77 to D+84 | Dogfood + fix bugs |
| RC2 release | D+84 | Public beta or expanded RC2 |

---

## Template: RC2 Feature Request

```yaml
id: "RC2-FR-001"
title: "Fix provider timeout handling"
evidence:
  source: "failure_analysis"
  data_point: "23 timeout failures across 8 users"
  user_requests: 4
category: "P0"
domain: "execution"
effort: "medium"  # small / medium / large
justification: >
  Provider timeouts are the #1 cause of task failure.
  Structured error handling exists but retry logic is
  insufficient. Users report frustration when a simple
  request fails due to transient network issues.
proposed_solution: >
  Add exponential backoff retry with configurable max
  attempts. Show retry progress in UI. If all retries
  fail, offer to switch provider.
success_criteria:
  - Timeout failure rate drops by 50%
  - No user reports timeout frustration in RC2
  - Recovery rate for timeout errors > 90%
```

---

## Anti-Patterns to Avoid

| Anti-pattern | Why | Instead |
|-------------|-----|---------|
| "This would be cool" | No user need | Wait for user to ask |
| "Our architecture needs this" | Engineering-driven | Fix what users report |
| "Benchmark X would look better" | Vanity metric | Focus on user satisfaction |
| "Competitor Y has this" | Feature parity trap | Solve real user problems |
| "We already built most of it" | Sunk cost fallacy | Only ship if users want it |
