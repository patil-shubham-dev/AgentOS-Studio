# User Feedback Framework

> Generated: 2026-06-24
> Purpose: Structured feedback collection from RC1 participants

---

## Collection Methods

| Method | Frequency | Effort | Richness |
|--------|-----------|--------|----------|
| In-app micro-surveys | After key actions | Low (10s) | Medium |
| Weekly check-in form | Weekly | Medium (5min) | High |
| Exit survey | End of program | High (15min) | Very high |
| Feedback channel (Discord/Slack) | Anytime | Low | Very high (conversational) |
| Session recording (opt-in) | Continuous | None | Maximum |

---

## In-App Micro-Surveys

Triggered after specific actions. Max 2 questions each.

### After First Code Edit

```
Q1: How confident are you that the edit was correct?
    [1-5 stars]

Q2: Did the preview accurately show what was going to change?
    [Yes / Partially / No]
```

### After Verification

```
Q1: Did the verification results match your expectations?
    [Yes / Partially / No / I didn't look]

Q2: How would you rate the verification speed?
    [Too slow / Acceptable / Fast]
```

### After Undo

```
Q1: Did the undo work as expected?
    [Yes / Partial / No]

Q2: Was it clear which version you were restoring to?
    [Clear / Confusing]
```

### After Error

```
Q1: Was the error message helpful?
    [1-5 stars]

Q2: Did you understand what caused the error?
    [Yes / Partially / No]
```

### Random (1 per session, max)

```
Q1: How would you rate your experience with AgenticOS today?
    [1-5 stars]

Q2: What is the ONE thing that would make it better?
    [Free text, max 200 chars]
```

---

## Weekly Check-In Form

Sent every 7 days via the feedback channel.

```
Section 1: Overall Experience
  - Days used this week: [0-7]
  - Tasks completed: [number]
  - Overall satisfaction (1-10):
  - Frustration level (1-10):

Section 2: Specific Features
  Rate each 1-5:
  - AGENTIC.md generation
  - Code editing
  - Verification
  - Undo
  - Error messages
  - Speed

Section 3: Open Questions
  - What worked well this week?
  - What was frustrating?
  - What feature would you add or change?
  - Did anything surprise you?

Section 4: Comparison
  - Would you use AgenticOS instead of your current tool for:
    [Bug fixes / Refactors / New features / Analysis / Review]
    Options: [Yes / Maybe / No]
```

---

## Exit Survey

Sent at program end (Day 28).

### Trust

```
Q1: How much do you trust AgenticOS to make correct code changes?
    [1-10]

Q2: How often do you review AgenticOS's changes before accepting?
    [Always / Often / Sometimes / Rarely / Never]

Q3: Have you ever had to manually fix an incorrect change?
    [Yes / No]
    If yes: How many times? [number]
```

### Confidence

```
Q4: How confident are you in AgenticOS's verification results?
    [1-10]

Q5: Do you run verification independently after AgenticOS?
    [Always / Often / Sometimes / Rarely / Never]
```

### Ease of Use

```
Q6: How easy was it to get started?
    [1-10]

Q7: How intuitive is the chat interface?
    [1-10]

Q8: Did you need to consult documentation?
    [Never / Once / A few times / Frequently]
```

### Clarity

```
Q9: Are error messages clear and actionable?
    [1-10]

Q10: Do you understand what AgenticOS is doing at each step?
    [Always / Often / Sometimes / Rarely / Never]
```

### Speed

```
Q11: How would you rate execution speed?
    [1-10 (1=too slow, 10=instant)]

Q12: What is the longest you waited for a response?
    [<5s / 5-15s / 15-30s / 30-60s / 60s+]
```

### Reliability

```
Q13: How often does AgenticOS crash or freeze?
    [Never / Once / A few times / Daily]

Q14: How often does it produce incorrect results?
    [Never / Rarely / Sometimes / Often]
```

### Quality of Edits

```
Q15: Rate the quality of code edits:
    [1-10]

Q16: How often do you accept edits without modification?
    [Always / Often / Sometimes / Rarely / Never]
```

### Verification Confidence

```
Q17: Rate verification thoroughness:
    [1-10]

Q18: Has verification ever missed an error you caught manually?
    [Yes / No]
```

### Repair Quality

```
Q19: When verification fails, how often does repair fix it?
    [Always / Often / Sometimes / Rarely / Never]

Q20: Rate repair quality:
    [1-10]
```

### Adoption Questions

```
Q21: Would you use AgenticOS daily?
    [Yes / Maybe / No]

Q22: Would you replace your current AI coding tool with AgenticOS?
    [Yes / Maybe / No]
    Why or why not? [Free text]

Q23: Would you recommend AgenticOS to a colleague?
    [Yes / Maybe / No]

Q24: What is the #1 reason you would use AgenticOS?
    [Free text]

Q25: What is the #1 reason you would NOT use AgenticOS?
    [Free text]
```

---

## Feedback Channel (Discord/Slack)

### Structure

```
#general          — Introductions, announcements
#feedback         — Structured feedback with templates
#bugs             — Bug reports (with auto-template)
#feature-requests — Feature ideas
#support          — Help with setup/issues
#random           — Off-topic
```

### Bug Report Template

```
**Summary:** [One-line description]
**Steps to reproduce:**
1. 
2. 
3. 
**Expected:** 
**Actual:** 
**Screenshot/Log:** [optional]
**AgenticOS version:** 
**OS version:** 
```

### Feature Request Template

```
**Problem:** [What problem does this solve?]
**Solution:** [What would you like to see?]
**Workaround:** [How do you handle this today?]
**Priority:** [Nice to have / Important / Critical]
```

---

## Scoring

### Net Promoter Score (NPS)
```
Q22 from exit survey: "Would you recommend to a colleague?"
  9-10 → Promoter
  7-8  → Passive
  0-6  → Detractor
  NPS = %Promoters - %Detractors
  Target: NPS ≥ 30
```

### User Satisfaction Score
```
Average of Q7 (overall satisfaction, weekly check-in)
Target: 8+/10
```

### Trust Score
```
Weighted composite:
  50% = Q1 from exit survey (trust)
  25% = Q16 (edit acceptance rate)
  25% = Q17 (verification confidence)
  Target: 8+/10
```

### CSAT (Customer Satisfaction Score)
```
Q1 from random micro-survey: "Rate your experience today"
Target: 4+/5
```

---

## Data Flow

```
In-app survey response
  → PostHog event
  → Dashboard visualization
  → Weekly summary report

Discord/Slack feedback
  → Manual triage by PM
  → Tagged: bug / feature / praise / complaint
  → Weekly summary report

Exit survey
  → Google Form / Typeform
  → Exported to CSV
  → Analyzed for NPS, satisfaction, themes
  → Final RC1 review report
```

---

## Privacy

| Data | Collected? | PII? | Retention |
|------|-----------|------|-----------|
| Survey scores | Yes | No | 90 days |
| Free text responses | Yes | Maybe | 90 days (anonymized) |
| Discord username | Yes | Yes | Program duration |
| Email | Yes | Yes | Program duration |
| Session recording | Opt-in only | Yes | 30 days |

All survey data is stored separately from telemetry data. Free text responses are anonymized before analysis.
