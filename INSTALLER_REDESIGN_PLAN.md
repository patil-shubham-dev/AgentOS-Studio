# INSTALLER REDESIGN PLAN

## Current State Audit

- `build/installer.nsh` (135 lines) — basic `customInstall` and `customUnInstall` macros with MessageBox data cleanup
- `build/installer-hooks.nsh` (491 lines) — full branded pages (welcome, summary, finish, uninstall radio buttons) but **NOT included** in `electron-builder.config.cjs`
- `electron-builder.config.cjs` — `include` only points to `installer.nsh`
- Branding: 270KB icon.ico, 1.3MB icon.png, 34KB installer-header.bmp, 206KB installer-sidebar.bmp
- Colors: header `#1a1a2e`, light background `#FFFFFF`

## Issues

1. `installer-hooks.nsh` is unused — all its pages are dead code
2. No progress stages (single generic progress bar)
3. No trust-building illustration on welcome
4. No "Launch After Install" checkbox on finish
5. No upgrade detection shown on welcome
6. No installation options (shortcuts, context menu, protocols)

## Redesign

### Architecture

Merge `installer-hooks.nsh` content into `installer.nsh` by adding `!include "installer-hooks.nsh"` at the top of `installer.nsh`. Then fix electron-builder config to include both.

### New Installer Flow

```
┌─────────────────────────────────────────────┐
│  STEP 1: Welcome Screen                      │
│                                              │
│  Logo (text/bmp from resources/branding)     │
│  "AgenticOS"                                 │
│  "Your Autonomous Development Environment"   │
│                                              │
│  Features:                                   │
│  ◆ Local-first, privacy focused              │
│  ◆ Multi-agent AI workspace                  │
│  ◆ Visual canvas + code editor               │
│  ◆ Browser automation + web intelligence     │
│                                              │
│  [Previous version detected: v2.0.x]         │
│  (if upgrading — settings preserved)         │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  STEP 2: Installation Options                │
│                                              │
│  ☑ Desktop Shortcut                          │
│  ☑ Start Menu Shortcut                       │
│  ☑ Launch After Install                      │
│  ☑ Register File Types (.ts .tsx .js .py)    │
│  ☑ Add "Open with AgenticOS" Context Menu    │
│  ☑ Enable agenticos:// Protocol              │
│                                              │
│  Destination: C:\Users\...\AppData\Local\    │
│  [Change...]                                  │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  STEP 3: Installation Progress               │
│                                              │
│  AgenticOS Setup                             │
│                                              │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░  65%               │
│                                              │
│  Stages:                                     │
│  ✓ Preparing Environment                     │
│  ✓ Installing Runtime                        │
│  ▸ Registering Workspace Services            │
│  ☐ Configuring Native Tools                  │
│  ☐ Finalizing Setup                          │
│                                              │
│  (animated stage transitions)                │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  STEP 4: Completion Screen                   │
│                                              │
│  ✅ AgenticOS Installed Successfully         │
│  Version 2.1.0                               │
│                                              │
│  What would you like to do next?             │
│                                              │
│  ☑ Launch AgenticOS                          │
│  ☐ View Quick Start Guide                    │
│  ☐ Open Documentation                        │
│                                              │
│  Thank you for choosing AgenticOS.           │
│  Visit agenticos.ai/support for help.        │
└─────────────────────────────────────────────┘
```

### Implementation Steps

1. **Fix `installer.nsh`**: Add `!include "installer-hooks.nsh"` at line 1 so all branded pages are active
2. **Update `installer-hooks.nsh`**: 
   - Add "Launch After Install" checkbox (already exists as `FinishLaunchCheckbox`)
   - Add progress stage labels (NSIS `DetailPrint` with stage markers)
   - Improve upgrade detection display
3. **Update `electron-builder.config.cjs`**: No change needed — `include: 'build/installer.nsh'` will transitively include `installer-hooks.nsh`
4. **Branding**: Ensure `resources/branding/installer-header.bmp` and `installer-sidebar.bmp` are modern styled

### NSIS Staging System

Use `DetailPrint` with a structured prefix pattern to indicate stages:

```
!define STAGE_PREPARE   "STAGE[1/5] Preparing Environment"
!define STAGE_RUNTIME   "STAGE[2/5] Installing Runtime"
!define STAGE_SERVICES  "STAGE[3/5] Registering Workspace Services"
!define STAGE_NATIVE    "STAGE[4/5] Configuring Native Tools"
!define STAGE_FINALIZE  "STAGE[5/5] Finalizing Setup"
```

Each section/file operation prefixes its DetailPrint with `STAGE[n/5]` for the renderer to parse.

### Files to Modify

| File | Change |
|------|--------|
| `build/installer.nsh` | Add `!include "installer-hooks.nsh"` header |
| `build/installer-hooks.nsh` | Add progress stage labels, improve welcome/options/finish |
| `electron-builder.config.cjs` | Verify `include` path is correct (already is) |
| `resources/branding/installer-header.bmp` | Optional: replace with modern gradient |
| `resources/branding/installer-sidebar.bmp` | Optional: replace with modern illustration |
