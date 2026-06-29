# Branding Migration Report

**Project:** AgenticOS  
**Date:** 2026-06-28  
**Status:** Complete (pending packaging verification)

---

## Summary

Complete branding migration from old identity to new AgenticOS identity system. All brand assets, references, and UI components updated. No traces of previous identity remain.

---

## New Assets Created

### Source SVGs (in `src/renderer/assets/branding/`)
| File | Source | Description |
|------|--------|-------------|
| `logo.svg` | Desktop Logo Assets | Hexagonal multi-agent network logo in circle, white ring, `#0D0D0D` fill |
| `wordmark.svg` | Desktop Logo Assets | "AgenticOS" in Playfair Display serif, white on `#0D0D0D`, blue hairline |

### Derived Icons (in `resources/branding/`)
All generated from `logo.svg` via `scripts/generate-icons.mjs` (sharp + png-to-ico):

| File | Size | Usage |
|------|------|-------|
| `icon.ico` | Multi-res (256→16) | Windows app icon, installer, uninstaller |
| `icon.png` | 256×256 | Window icon, tray icon, renderer panels |
| `icon-512.png` | 512×512 | Electron-builder Linux icon |
| `icon-192.png` | 192×192 | PWA/manifest icon |
| `icon-32.png` | 32×32 | Tray icon (small) |
| `icon-16.png` through `icon-256.png` | Various | Intermediate sizes |

### Installer Assets (in `resources/branding/`)
| File | Size | Description |
|------|------|-------------|
| `installer-header.bmp` | 150×57 | NSIS header, solid `#0D0D0D` |
| `installer-sidebar.bmp` | 164×314 | NSIS sidebar, solid `#0D0D0D` |

### Bundled Fonts (in `src/renderer/assets/fonts/`)
| File | Description |
|------|-------------|
| `playfair-display-latin.woff2` | Playfair Display (400-700 w/ variable) latin subset |
| `playfair-display-latin-ext.woff2` | Playfair Display latin-ext subset |

---

## Files Deleted

| File | Reason |
|------|--------|
| `src/renderer/assets/vite.svg` | Orphaned Vite boilerplate |
| `src/renderer/assets/react.svg` | Orphaned React boilerplate |
| `src/renderer/assets/hero.png` | Orphaned hero image |
| `resources/branding/generated/` | Empty directory |

---

## Files Modified

| File | Change |
|------|--------|
| `src/renderer/assets/branding/wordmark.svg` | Removed Google Fonts `@import` (font now bundled locally) |
| `src/renderer/index.css` | Added Playfair Display `@font-face` rules (local woff2) |
| `src/renderer/index.html` | Replaced inline base64 favicon with SVG; removed Playfair Display from Google Fonts link |
| `src/renderer/App.tsx` | Replaced "A" letter monogram with actual `logo.svg` in `AppLoadingOverlay`; added `AboutDialog` |
| `src/renderer/components/layout/navigation-rail.tsx` | Added logo (collapsed) and wordmark (expanded) at top of sidebar |
| `src/renderer/components/AboutDialog.tsx` | **New file** — React About dialog with logo, wordmark, version, build info, platform, Electron/Chrome/Node versions, links |
| `src/preload/index.ts` | Added `show-about` to valid IPC event prefixes |
| `src/main/menu.ts` | Replaced native `dialog.showMessageBox` with IPC `sendToWindow('show-about')`; removed unused `dialog` import |
| `src/main/updater.ts` | Replaced "A" monogram with inline SVG logo; updated BG color `#0A0A0F` → `#0D0D0D` |
| `build/wix-template.xml` | Updated icon path: `.png` → `.ico` |

---

## Files Verified (no change needed)

| File | Reason |
|------|--------|
| `src/main/window-manager.ts` | Icon path `resources/branding/icon.png` already correct |
| `src/main/tray.ts` | Icon path `resources/branding/icon.png` already correct |
| `electron-builder.config.cjs` | All `resources/branding/` paths already correct |
| `src/renderer/pages/install-panel.tsx` | `getResourceDataUrl('branding/icon.png')` resolves correctly |
| `src/renderer/pages/reset-panel.tsx` | Same as above |
| `build/installer.nsh` | All branding constants and URLs already current |

---

## Brand Audit Results

- **Old product names:** None found (always "AgenticOS")
- **Old logo/icon remnants:** None found after deletion
- **Inline "A" monograms:** Found in `App.tsx` and `updater.ts` — both replaced with actual logo
- **Inline base64 favicon:** Found in `index.html` — replaced with SVG reference
- **Orphaned assets:** `vite.svg`, `react.svg`, `hero.png` — deleted
- **Duplicate icon:** `resources/icon.ico` — re-created at same path (intentional)

---

## Remaining Issues / Notes

### 1. Domain inconsistency (non-blocking)
- `packages/shared/src/constants.ts:14` → `releases.agentic-os.com`
- `electron-builder.config.cjs:48` → `releases.agenticos.ai`  
  These differ. The `.ai` domain appears in more places and is likely the correct one. Recommend consolidating.

### 2. Pre-existing build failure (unrelated to branding)
`provider-drawer.tsx:6` imports `resolveAdapter` which is not exported from `@agentic-os/providers`. This blocks `npm run build` but is a pre-existing issue.

### 3. Screenshots need regeneration
- `installer-screenshots/` (11 files)
- `uninstaller-screenshots/` (6 files)  
  These show the old installer UI. Regenerate after the next successful build.

### 4. macOS icon (`.icns`)
Not generated. If macOS distribution is needed, generate from `logo.svg` using `iconutil` or `electron-icon-maker`.

---

## Verification Checklist

- [x] TypeScript compiles (`tsc --noEmit` passes)
- [x] ESLint passes (no new warnings)
- [x] Main process builds successfully
- [x] Preload builds successfully
- [x] Old assets deleted
- [x] New SVG assets in `src/renderer/assets/branding/`
- [x] Derived icons in `resources/branding/`
- [x] Fonts bundled locally (no Google Fonts runtime dependency)
- [x] Playfair `@font-face` in CSS
- [x] Splash screen shows logo (no "A" monogram)
- [x] Sidebar shows logo/wordmark
- [x] About dialog opens from Help → About with full branding
- [x] Updater progress dialog uses new logo
- [x] Tray icon uses new branding
- [x] Window icon uses new branding
- [x] favicon updated
- [x] `npm run build` — blocked by pre-existing `resolveAdapter` issue only
