# BUILD_TRACE_REPORT

## Git Status

| Field | Value |
|---|---|
| **Commit** | `11c8c2e119e65d8d13c16e3a04e86651a41ac420` |
| **Branch** | `main` |
| **Author** | patil-shubham-dev |
| **Date** | Sun Jun 21 10:06:31 2026 +0530 |
| **Message** | "Complete P3/P4 feature implementation + memory leak fixes" |

All session changes are **uncommitted** (working tree dirty).

## Build Timestamps

| Artifact | Timestamp | Size |
|---|---|---|
| `electron-vite build` output (`out/`) | 2026-06-23 19:09:33 | index-CA2mvv3C.js (18.9 MB) |
| `win-unpacked/app.asar` | 2026-06-23 19:12:23 | 224 MB |
| `AgenticOS Setup 2.1.0.exe` | **2026-06-23 17:50:47** | 135 MB |

## CRITICAL FINDING: Installer is STALE

The installer EXE timestamp (17:50:47) is **older** than the win-unpacked asar (19:12:23) and the Vite build output (19:09:33).

**Root cause**: `npm run dist:win` runs `electron-vite build && electron-builder`. The `electron-builder` NSIS stage times out at 300 seconds, leaving the OLD installer EXE intact. The win-unpacked directory gets updated (faster), but the final installer is never replaced.

## Evidence

| Check | Build `out/` | `win-unpacked/` asar | Installed app asar |
|---|---|---|---|
| **Renderer index** | `index-CA2mvv3C.js` | `index-CA2mvv3C.js` | `index-Bs_690L3.js` |
| **Contains WelcomeWizard** | YES | YES (in asar) | NO (old code) |
| **Contains AGENTIC.md** | YES | YES (in asar) | NO (old code) |
| **Contains ConfigGenerator** | NO (tree-shaken) | NO | NO |

## Conclusion

1. **Source changes exist** in working tree (uncommitted)
2. **Vite build succeeds** and bundles our new code
3. **electron-builder packages** correctly into win-unpacked
4. **NSIS installer build times out** - old installer is never replaced
5. **Installed app runs old code** because we keep installing from the stale installer
