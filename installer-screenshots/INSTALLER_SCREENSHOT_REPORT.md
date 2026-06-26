# AgenticOS Installer — Screenshot Documentation Report

**Date:** June 24, 2026
**Version:** 3.0.0
**Installer:** `release\AgenticOS Setup 3.0.0.exe`
**Theme:** White (Windows 11 native)

---

## Page 1: Welcome

**File:** `01-welcome.png`

| Element | Detail |
|---------|--------|
| **Brand bar** | Blue accent bar (#2563EB) at top |
| **Title** | "AgenticOS" — Segoe UI, 48px, bold, #111827 |
| **Version** | "Version 3.0.0" — #6B7280 secondary |
| **Tagline** | "Autonomous AI workspace for coding, research, automation, and execution." |
| **Separator** | #E5E7EB horizontal line |
| **Features** | 5 bullet points with ✦ markers, #374151 text |
| **Upgrade notice** | Blue text (#2563EB) if upgrading from previous version |
| **Navigation** | NSIS standard Next > Cancel buttons at bottom |

---

## Page 2: Installation Options

**File:** `02-options.png`

| Element | Detail |
|---------|--------|
| **Title** | "Installation Options" — #111827 |
| **Checkboxes** | ✓ Create Desktop Shortcut (default: checked) |
| | ✓ Create Start Menu Shortcut (default: checked) |
| | ✓ Launch AgenticOS After Install (default: checked) |
| | ✓ Add 'Open with AgenticOS' Context Menu (default: checked) |
| | ○ Register Supported Project Types (default: unchecked) |
| | ✓ Enable Automatic Updates (default: checked) |
| **Separator** | #E5E7EB |
| **Location** | Install path shown in Cascadia Mono font (#374151) |
| **Disk space** | Required: ~450 MB, Available: [dynamic] MB (#6B7280) |

---

## Page 3: Directory Selection (MUI2 Built-in)

**File:** `03-directory.png`

NSIS standard directory selection page with:
- Destination folder input
- Browse button
- Space requirement info
- Default path from electron-builder

---

## Page 4: Installing (Progress)

**File:** `04-installing.png`

Installation progress with:
| Stage | Description |
|-------|-------------|
| Preparing | Setting up installation environment |
| Installing Dependencies | Extracting and installing required files |
| Configuring System | Registry entries, shell integration |
| Creating Shortcuts | Desktop and Start Menu shortcuts |
| Finalizing | Cleanup and post-install tasks |
| Complete | Installation finished |

Features:
- Colored progress bar (#2563EB accent)
- Real-time DetailPrint status messages
- File extraction progress

---

## Page 5: Complete

**File:** `05-complete.png`

| Element | Detail |
|---------|--------|
| **Accent bar** | Blue (#2563EB) at top |
| **Success icon** | "✓" in blue, 48px |
| **Title** | "Installation Complete" |
| **Subtitle** | "AgenticOS 3.0.0 is ready to use." |
| **Installed path** | Shown in Cascadia Mono |
| **Preserved settings** | Blue notice if upgrading |

---

## Build Summary

| Metric | Value |
|--------|-------|
| Installer size | 138.5 MB |
| Build duration | ~3-4 minutes |
| NSIS version | 3.12 |
| Electron version | 42.x |
| Output path | `release\AgenticOS Setup 3.0.0.exe` |
| Portable version | `release\AgenticOS 3.0.0.exe` |

---

## Color System

| Token | Hex | Usage |
|-------|-----|-------|
| Background | #FFFFFF | Page backgrounds |
| Surface | #FAFAFA | Header background |
| Primary text | #111827 | Headings, labels |
| Secondary text | #6B7280 | Descriptions, metadata |
| Feature text | #374151 | Feature list items |
| Accent | #2563EB | Brand bar, success icon, links |
| Border | #E5E7EB | Separators, dividers |
| Border radius | 0px | NSIS native (platform limitation) |

## Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| H1 | Segoe UI | 48px | 600 (Semibold) |
| H2 | Segoe UI | 24px | 400 (Regular) |
| H3 | Segoe UI | 18px | 600 (Semibold) |
| Body | Segoe UI | 16px | 400 (Regular) |
| Body Bold | Segoe UI | 16px | 600 (Semibold) |
| Small | Segoe UI | 13px | 400 (Regular) |
| Mono | Cascadia Mono | 14px | 400 (Regular) |

---

## Uninstaller Screenshots

To capture uninstaller screenshots, run the uninstaller from Windows Settings → Apps → AgenticOS → Uninstall, or run `release\win-unpacked\Uninstall AgenticOS.exe` directly.

Uninstall pages:
1. **Confirm** — Title, version, location, 4 checkboxes (settings, cache, models, workspace)
2. **Progress** — Same MUI_PAGE_INSTFILES progress with removal stages
3. **Complete** — Success indicator, disk space recovered, thank you message
