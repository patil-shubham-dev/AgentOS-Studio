---
name: debug-evidence
description: Diagnose a bug, failed test, unreliable agent run, IPC problem, provider issue, browser failure, or performance regression in AgenticOS. Use whenever something is broken, flaky, slow, fails intermittently, logs an error, or behaves differently from expectation. Produces a reproducible root-cause diagnosis and a verified fix when requested.
tags: ["debugging", "diagnosis", "tests", "reliability"]
aliases: ["debug", "investigate", "fix-regression"]
requiresConfirmation: false
---

# Debug with evidence

Treat the report as a hypothesis, not a cause. Preserve the failing state long enough to collect evidence.

1. Capture expected versus actual behavior, scope, environment, and a minimal reproduction.
2. Inspect errors, logs, event/replay records, and the narrow execution path before editing.
3. Form a small set of ranked hypotheses. Use a targeted test, trace, or inspection that can disprove each one.
4. Identify the root cause only when the evidence explains the symptom and the proposed fix changes that causal path.
5. Add a regression test when the behavior can be expressed deterministically; otherwise document the diagnostic signal and manual verification.
6. Run the reproduction after the fix and report both the original failure and the post-fix evidence.

Do not bury pre-existing failures. Separate them from regressions introduced by the current change.
