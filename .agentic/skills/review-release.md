---
name: review-release
description: Review an AgenticOS change, release candidate, pull request, or agent-generated diff for correctness, security, permissions, UX regressions, and verification coverage. Use whenever the user asks to review, audit, assess readiness, check a diff, prepare a release, or validate an implementation before merge.
tags: ["review", "release", "security", "quality"]
aliases: ["review", "audit", "release-check"]
requiresConfirmation: false
---

# Review for release

Review the diff in execution context, not as isolated lines. Read the changed code, call sites, relevant contracts, and tests. Use the project contract to identify intended behavior and the relevant verification commands.

Prioritize findings by user harm:

1. Correctness: wrong behavior, races, stale state, failed error/cancellation paths.
2. Security and permissions: renderer-to-main exposure, path/command validation, secret handling, unsafe plugin or MCP capability expansion.
3. Reliability: retries, timeouts, recovery, persistence, backward compatibility, and false success reporting.
4. UX and maintainability: blocked user flows, inaccessible controls, misleading progress, unclear recovery, and unnecessary complexity.

For every finding, give severity, a precise location, an evidence-backed failure scenario, and a concrete fix. Do not manufacture findings. If none are found, state residual risks and verification gaps rather than offering generic praise.
