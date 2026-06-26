# UNINSTALL REDESIGN PLAN

## Current State Audit

- `installer.nsh` has `customUnInstall` macro with basic MessageBox-based data cleanup options
- `installer-hooks.nsh` has `customUnInit`, `customUnWelcomePage`, and custom `customUnInstall` with radio buttons for 4 removal levels (app only, settings, cache, all) and data size detection
- Uninstall has: app/only → app+settings → app+settings+cache → everything radio buttons
- Data sizes shown: Settings, Cache, Logs, Workspaces
- No feedback collection
- No summary screen after uninstall
- No "Reinstall Later" option

## Issues

1. No "Why are you uninstalling?" feedback step
2. No uninstall summary (files removed, data preserved, etc.)
3. Completion screen is missing — uninstall just closes
4. Data management options are good but could be clearer with "Keep My Data" vs "Remove Everything" framing

## Redesign

### New Uninstall Flow

```
┌─────────────────────────────────────────────┐
│  STEP 1: Uninstall Welcome                   │
│                                              │
│  Uninstall AgenticOS                         │
│  Version 2.1.0                               │
│                                              │
│  Why are you uninstalling? (optional)        │
│                                              │
│  ○ Performance Issues                        │
│  ○ Missing Features                          │
│  ○ Bugs / Crashes                            │
│  ○ Switching Tools                           │
│  ○ Temporary Removal                         │
│  ○ Other: [_________________________]        │
│                                              │
│  Your feedback helps us improve.             │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  STEP 2: Data Management                     │
│                                              │
│  What would you like to do with your data?   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ ○ Keep My Data                        │   │
│  │   Settings, workspaces, session       │   │
│  │   history, AGENTIC.md files, agent    │   │
│  │   preferences preserved for reuse.    │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ ● Remove Everything                   │   │
│  │   Cache, logs, settings, session     │   │
│  │   data, and workspace files removed. │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  Data on this computer:                      │
│  Settings:    12.4 MB                        │
│  Cache:        3.2 MB                        │
│  Logs:         1.8 MB                        │
│  Workspaces:   0 B (not found)               │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  STEP 3: Uninstall Progress                  │
│                                              │
│  Removing AgenticOS...                       │
│                                              │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░  80%                │
│                                              │
│  ✓ Removing application files                │
│  ✓ Removing registry entries                 │
│  ▸ Removing user data                        │
│  ☐ Cleaning up shortcuts                     │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  STEP 4: Completion                          │
│                                              │
│  AgenticOS Removed                           │
│                                              │
│  Summary:                                    │
│  Files Removed:    1,247                     │
│  Settings Removed: 235                       │
│  Data Preserved:   Yes (settings kept)       │
│                                              │
│  ┌──────────────────────────────┐            │
│  │ Reinstall Later              │            │
│  │ (downloads latest version)   │            │
│  └──────────────────────────────┘            │
│                                              │
│  Thank you for trying AgenticOS.             │
│  agenticos.ai/docs                           │
└─────────────────────────────────────────────┘
```

### Implementation Steps

1. **Feedback step**: Add custom NSIS page before uninstall welcome with radio buttons + text input
2. **Data management reframe**: Keep existing radio buttons but re-label as "Keep My Data" / "Remove Everything" with clearer descriptions
3. **Uninstall progress**: Already works via NSIS built-in progress; add structured DetailPrint stages
4. **Completion screen**: Add custom `un.UninstallFinishPage` with summary stats and "Reinstall Later" button
5. **Feedback storage**: Write feedback to `$APPDATA\AgenticOS\uninstall-feedback.log` before removal

### NSIS Variables

```
Var UninstallReason       ; reason code (0-5)
Var UninstallReasonText   ; "Other" text input
Var UninstallFeedbackFile ; path to feedback log
Var UninstallRemovedFiles ; file count for summary
Var UninstallRemovedSettings  ; setting count
Var UninstallDataPreserved    ; "Yes" or "No"
```

### Files to Modify

| File | Change |
|------|--------|
| `build/installer-hooks.nsh` | Add feedback page, completion summary, reinstall link |
| `build/installer.nsh` | No change (delegates to hooks) |
