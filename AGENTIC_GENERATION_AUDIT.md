# AGENTIC.MD GENERATION AUDIT

## Current State

**File**: `src/renderer/runtime/project-config/ConfigGenerator.ts` (263 lines)

### What It Detects

| Feature | Status | Quality |
|---------|--------|---------|
| Package manager (npm/pnpm/yarn/bun) | ✅ Detected from lockfiles | Good |
| Build commands (from package.json scripts) | ✅ Detected | Good |
| Test framework | ✅ Detected from devDependencies | Limited (8 frameworks) |
| Frameworks (React, Vue, etc.) | ✅ Detected from dependencies | 15 frameworks |
| Language (TypeScript) | ✅ Detected | Basic |
| Linter (ESLint, Biome, Prettier) | ✅ Detected from config files | Basic |
| tsconfig strict mode | ✅ Detected | Good |
| CSS detection | ✅ Detected from file extensions | Basic |

### What It Does NOT Detect

| Feature | Missing | Impact |
|---------|---------|--------|
| **Monorepo structure** | ❌ Not detected | Major — wrong commands, wrong structure |
| **Entry points** | ❌ Not detected | Major — AI doesn't know app root |
| **Architecture** | ❌ Not analyzed | Major — no context for agent decisions |
| **Dependency graph** | ❌ Not mapped | Medium — no dependency understanding |
| **Directory tree depth** | ❌ Not scanned beyond root | Medium — limited structure view |
| **Testing patterns** | ❌ Not detected | Medium — no test naming conventions |
| **Code conventions** | ❌ Not inferred | Medium — no style/pattern info |
| **Environment files** | ❌ Not detected | Low — `.env.example`, `.gitignore` |
| **CI/CD config** | ❌ Not detected | Low — `.github/`, `.gitlab-ci.yml` |
| **Docker config** | ❌ Not detected | Low — `Dockerfile`, `docker-compose.yml` |
| **Database config** | ❌ Not detected | Low — `prisma/`, `typeorm/` |

### Current Output Quality

The generated AGENTIC.md is minimal:

```markdown
# AgenticOS Project Configuration

## Build & Test Commands
- Build: `npm run build`
- Test: `npm run test`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck` (strict mode)

## Coding Standards
- Language: TypeScript, CSS
- Framework: React, Vite, Tailwind CSS
- Package Manager: npm
- Build Tool: Vite
- Testing: Vitest
- Linting: ESLint

## Project Structure
src/
├── main/
├── renderer/
│   ├── components/
│   ├── pages/
│   ├── lib/
│   ├── runtime/
│   └── stores/
├── packages/
│   ├── shared/
│   └── ui/
└── tests/

## Best Practices & Conventions
<!-- Add project-specific conventions here: -->
- ```
-
-
- ```
```

### Issues

1. **No Architecture section** — Most critical missing piece
2. **Structure is flat** — Only 2 levels deep, no file counts
3. **No entry points** — AI doesn't know where the app starts
4. **No dependency summary** — No understanding of project scale
5. **No agent instructions** — The section most useful to AI agents is just a placeholder
6. **No verification rules** — No guidance on how to verify changes
7. **No important files list** — No indication of key configuration files
8. **No monorepo detection** — Important for multi-package projects

## Redesign: Project Intelligence Generator

### Architecture

```
ConfigGenerator.ts
├── scan()                    → ProjectProfile (expanded)
│   ├── detectPackageManager()  → package manager + monorepo
│   ├── detectFrameworks()      → frameworks + build tools
│   ├── detectLanguages()       → languages + features
│   ├── detectArchitecture()    → entry points, structure
│   ├── detectDependencies()    → dependency count, key deps
│   ├── detectConventions()     → inferred code conventions
│   ├── detectInfrastructure()  → CI/CD, Docker, env
│   └── detectTesting()         → test patterns
│
├── generate()                → AGENTIC.md content (expanded)
│   ├── Project Overview
│   ├── Architecture
│   ├── Development Commands
│   ├── Build Commands
│   ├── Test Commands
│   ├── Repository Structure
│   ├── Coding Conventions
│   ├── Agent Instructions
│   ├── Verification Rules
│   ├── Important Files
│   ├── Entry Points
│   └── Dependency Summary
│
└── write()                   → Write to workspace root
```

### New Output Template

```markdown
# Project Overview

{project_name} — {framework} {language} application
{description}

---

## Architecture

- **Type**: {spa | api | monorepo | library | cli}
- **Entry Points**: {list of entry files}
- **Build System**: {vite | webpack | esbuild | ...}
- **Package Manager**: {npm | pnpm | yarn | bun}
- **Monorepo**: {yes — packages detected | no}

---

## Development Commands

- Build: `{command}`
- Dev: `{command}`
- Test: `{command}`
- Lint: `{command}`
- Typecheck: `{command}`

---

## Repository Structure

```
root/
├── src/           (1,247 files)
│   ├── main/      (89 files)
│   ├── renderer/  (956 files)
│   │   ├── components/  (312 files)
│   │   ├── pages/       (45 files)
│   │   ├── runtime/     (234 files)
│   │   └── ...
│   └── packages/  (202 files)
├── tests/         (156 files)
├── configs/       (23 files)
└── docs/          (12 files)
```

## Dependency Summary

- Total: 1,247 packages
- Production: 892
- Development: 355
- Key dependencies: react, express, vite, vitest, zustand

## Important Files

| File | Purpose |
|------|---------|
| `src/main/index.ts` | Electron main process entry |
| `src/renderer/main.tsx` | Renderer entry point |
| `src/renderer/App.tsx` | Root React component |
| `package.json` | Project manifest |
| `electron-builder.config.cjs` | Build configuration |

## Coding Conventions

- **Language**: TypeScript (strict mode)
- **Framework**: React 19 with functional components
- **State**: Zustand stores
- **Styling**: Tailwind CSS with utility classes
- **Imports**: Path aliases (`@/`) for src/

## Agent Instructions

[Custom instructions for AI agents working on this project]

## Verification Rules

1. Run `npm run typecheck` before committing
2. Run `npm run test` to verify no regressions
3. Run `npm run lint` to check code style
4. Verify build with `npm run build`
```

### Implementation Priority

| Phase | Feature | Effort | Impact |
|-------|---------|--------|--------|
| 1 | Architecture detection (entry points, app type) | Medium | High |
| 1 | Directory tree depth scanning | Medium | High |
| 1 | Dependency summary | Low | Medium |
| 2 | Monorepo detection | Medium | High |
| 2 | Important files detection | Low | Medium |
| 2 | Coding conventions inference | Medium | Medium |
| 3 | CI/CD detection | Low | Low |
| 3 | Docker/env detection | Low | Low |
| 3 | Agent instructions customization | Medium | High |

### Files to Modify

| File | Change |
|------|--------|
| `src/renderer/runtime/project-config/ConfigGenerator.ts` | Full rewrite with expanded detection |
| `src/renderer/components/workspace/ConfigInitBanner.tsx` | Already has cache invalidation + tree refresh |
