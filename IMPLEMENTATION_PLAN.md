# IMPLEMENTATION PLAN

## Overview

Complete redesign of the installer, uninstaller, first-launch onboarding, and AGENTIC.md generation experience for AgenticOS.

## Implementation Order

1. **Installer/Uninstaller (NSIS)** — Low risk, self-contained, immediate impact
2. **Onboarding Wizard (React)** — Medium risk, new components
3. **Project Intelligence Generator (AGENTIC.md v2)** — High risk, core logic change
4. **Build & Verify** — Integration test

---

## PHASE 1: Installer + Uninstaller (NSIS)

### Step 1.1 — Merge installer hooks

**File**: `build/installer.nsh`

Add at line 1:
```nsis
!include "installer-hooks.nsh"
```

This activates all the branded pages (welcome, summary, finish, uninstall) that were written but never included.

### Step 1.2 — Add progress stages

**File**: `build/installer-hooks.nsh`

At line 9 (brand constants section), add:
```nsis
!define STAGE_PREPARE   "STAGE[1/5] Preparing Environment"
!define STAGE_RUNTIME   "STAGE[2/5] Installing Runtime"
!define STAGE_SERVICES  "STAGE[3/5] Registering Workspace Services"
!define STAGE_NATIVE    "STAGE[4/5] Configuring Native Tools"
!define STAGE_FINALIZE  "STAGE[5/5] Finalizing Setup"
```

In the `PreInstall` and `PostInstall` macros, add `DetailPrint` calls with stage markers. In the `Files` section between sections, add `DetailPrint` stage markers.

### Step 1.3 — Add uninstall feedback + completion

**File**: `build/installer-hooks.nsh`

Add:
- `un.UninstallFeedbackPage` — radio buttons for reason + optional text
- `un.UninstallFinishPage` — summary: files removed, data preserved, "Reinstall Later" button
- `un.SaveFeedback` function — writes feedback to APPDATA before removal

### Step 1.4 — Update electron-builder config

**File**: `electron-builder.config.cjs`

Verify NSIS config already supports one-click=false, perMachine=false, allowToChangeInstallationDirectory=true (all ✅).

---

## PHASE 2: First-Launch Onboarding Wizard (React)

### Step 2.1 — Create OnboardingProvider

**File**: `src/renderer/components/onboarding/OnboardingProvider.tsx`

Context provider that tracks:
- Whether wizard has been completed
- Current step (0-4)
- Provider selections
- Model assignments

### Step 2.2 — Create WelcomeWizard

**File**: `src/renderer/components/onboarding/WelcomeWizard.tsx`

Full-screen centered modal with 4 steps:

1. **Welcome Step**: Logo + tagline + "Get Started" CTA
2. **Provider Detection**: Auto-detect Ollama (localhost:11434), LM Studio (localhost:1234), show API key inputs for OpenAI/Anthropic/OpenRouter
3. **Model Assignment**: Dropdown selectors for Manager/Coder/Fast models
4. **Open Project**: Folder picker button + recent projects list

### Step 2.3 — Create ProviderDetector

**File**: `src/renderer/components/onboarding/ProviderDetector.ts`

Pure async functions that probe local endpoints:
```typescript
async function detectOllama(): Promise<OllamaResult | null>
async function detectLMStudio(): Promise<LMStudioResult | null>
```

### Step 2.4 — Integrate into app shell

**File**: `src/renderer/main.tsx`

Actually consume the `first_launch` sessionStorage value. If true:
```tsx
const isFirstLaunch = sessionStorage.getItem("first-launch") === "true"
```

In App component or a higher-order wrapper, show `<WelcomeWizard />` overlay before main content when `isFirstLaunch && !wizardCompleted`.

### Step 2.5 — Create ProjectAnalyzer

**File**: `src/renderer/components/onboarding/ProjectAnalyzer.tsx`

Shows analysis results after workspace is opened:
- Framework/language badges
- Entry points list
- Dependency count
- Architecture type
- Automatically triggers AGENTIC.md generation

---

## PHASE 3: Project Intelligence Generator (AGENTIC.md v2)

### Step 3.1 — Expand ProjectProfile interface

Add to `ConfigGenerator.ts`:
```typescript
export interface ProjectProfile {
  // ...existing fields...
  
  // NEW:
  architectureType: "spa" | "api" | "monorepo" | "library" | "cli" | "unknown"
  entryPoints: string[]
  importantFiles: { path: string; purpose: string }[]
  dependencyCount: number
  devDependencyCount: number
  keyDependencies: string[]
  isMonorepo: boolean
  monorepoPackages: string[]
  directoryTree: DirectoryNode[]
  hasCI: boolean
  hasDocker: boolean
  hasEnvExample: boolean
  testPattern: string | null
  inferredConventions: string[]
}
```

### Step 3.2 — Add depth scanning

Private method `scanDirectoryTree(rootPath, maxDepth=4)`:
- Recursively read directories up to depth 4
- Count files per subdirectory
- Build a hierarchical structure string

### Step 3.3 — Add entry point detection

Look for common entry points:
- `src/main.tsx`, `src/index.tsx`, `src/app.tsx`, `src/index.ts`
- `main.js`, `index.js`
- Check package.json `main` field
- Check electron-vite config for entry points

### Step 3.4 — Add monorepo detection

Check for:
- Workspace config in package.json (`workspaces` field)
- `pnpm-workspace.yaml`
- `lerna.json`
- `nx.json`
- `turbo.json`

### Step 3.5 — Add infrastructure detection

Check for:
- `.github/` directory → GitHub Actions
- `.gitlab-ci.yml` → GitLab CI
- `Dockerfile` → Docker
- `docker-compose.yml` → Docker Compose
- `.env.example` → Environment template

### Step 3.6 — Rewrite generate() method

New output sections:

| Section | Content |
|---------|---------|
| Project Overview | Name, type, framework, language |
| Architecture | Type, entry points, build system, monorepo status |
| Development Commands | build, dev, test, lint, typecheck |
| Repository Structure | Depth-scanned directory tree with file counts |
| Dependency Summary | Total packages, production/dev split, key deps |
| Important Files | Table of critical files with purposes |
| Coding Conventions | Inferred from project config |
| Agent Instructions | Generated defaults + placeholder for custom |
| Verification Rules | Commands to run to verify changes |

---

## PHASE 4: Build & Verify

### Step 4.1 — Build NSIS installer

```bash
npm run dist:win
```

Verify:
- Installer shows welcome with branding ✓
- Progress shows stages ✓
- Finish shows options ✓
- Uninstall shows feedback + data management + completion ✓

### Step 4.2 — Run tests

```bash
npm run test
```

Verify:
- ConfigGenerator tests pass (existing)
- New tests for expanded detection pass
- No TypeScript errors

### Step 4.3 — Manual verification

1. Run installed app
2. First launch shows welcome wizard
3. Wizard detects providers
4. Models can be assigned
5. Project can be opened
6. AGENTIC.md auto-generates
7. Uninstall works with feedback and data management

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| NSIS syntax errors | Medium | High — installer broken | Test with `npm run pack` before final build |
| First-launch flag not consumed correctly | Medium | Medium — wizard doesn't show | Log `first_launch` value, add debug mode |
| Provider detection fails silently | High | Low — wizard still works | Fallback to manual API key entry |
| AGENTIC.md generation breaks existing flows | Medium | High — users rely on it | Keep old `generate()` as fallback, extensive testing |
