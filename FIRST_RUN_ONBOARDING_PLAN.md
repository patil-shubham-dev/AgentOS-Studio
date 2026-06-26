# FIRST-RUN ONBOARDING PLAN

## Current State Audit

- App boots, stores `first_launch` in sessionStorage but **never reads it** for UI routing
- No dedicated welcome wizard or modal
- ControlCenter shows `OnboardingTaskList` widget if providers aren't configured
- ConfigInitBanner shows in workspace when AGENTIC.md is missing
- WelcomePage is static: "Open Folder" / "New File" buttons
- No provider auto-detection flow
- No model assignment flow
- No project analysis on open

## Issues

1. `first_launch` flag is dead data — written but never consumed by renderer
2. No guided first-run experience
3. New users see empty ControlCenter with no direction
4. Provider configuration is manual and intimidating
5. No automatic project analysis when opening a workspace
6. ConfigInitBanner is too technical for first-time users

## Redesign

### New First-Launch Flow

```
┌─────────────────────────────────────────────┐
│  Welcome Wizard — Step 1 of 4               │
│                                              │
│  Welcome to AgenticOS                        │
│                                              │
│  Your Autonomous Development Environment     │
│                                              │
│  Setup takes less than 2 minutes.            │
│                                              │
│  We'll help you configure:                   │
│  ◆ AI Providers (Ollama, OpenAI, etc.)       │
│  ◆ Agent Models (Manager, Coder, Fast)       │
│  ◆ Your first project                        │
│                                              │
│  ┌──────────────────┐  ┌─────────────┐       │
│  │ Skip Setup       │  │ Get Started │       │
│  └──────────────────┘  └─────────────┘       │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Welcome Wizard — Step 2 of 4               │
│                                              │
│  AI Provider Detection                       │
│                                              │
│  Checking for available providers...         │
│                                              │
│  ✓ Ollama detected (running locally)         │
│    → Model: llama3.2, qwen2.5-coder          │
│                                              │
│  ☐ OpenAI — Add API key                      │
│    [sk-...............................]       │
│                                              │
│  ☐ Anthropic — Add API key                   │
│    [sk-ant-............................]      │
│                                              │
│  Connected providers will be available       │
│  to power your agents.                       │
│                                              │
│  ┌──────────┐  ┌──────────────────┐          │
│  │ Back     │  │ Continue          │          │
│  └──────────┘  └──────────────────┘          │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Welcome Wizard — Step 3 of 4               │
│                                              │
│  Model Assignment                            │
│                                              │
│  Choose which models power your agents:      │
│                                              │
│  Manager Model (orchestrates work)           │
│  ┌──────────────────────────────────────┐    │
│  │ gpt-4o          ▼                    │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  Coder Model (writes code)                   │
│  ┌──────────────────────────────────────┐    │
│  │ qwen2.5-coder   ▼                    │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  Fast Model (quick tasks, browsing)          │
│  ┌──────────────────────────────────────┐    │
│  │ gpt-4o-mini     ▼                    │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────┐  ┌──────────────────┐          │
│  │ Back     │  │ Continue          │          │
│  └──────────┘  └──────────────────┘          │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Welcome Wizard — Step 4 of 4               │
│                                              │
│  Open Your Project                           │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ 📁 Open Workspace Folder              │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  Or choose a recent project:                 │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐        │
│  │  my-app (C:\Users\...\my-app)    │        │
│  │  website (C:\Users\...\website)  │        │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘        │
│                                              │
│  ┌──────────┐  ┌──────────────────┐          │
│  │ Back     │  │ Finish Setup      │          │
│  └──────────┘  └──────────────────┘          │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Project Analysis (automatic on workspace   │
│  open)                                       │
│                                              │
│  Analyzing your project...                    │
│                                              │
│  ✓ Framework: React + Vite                   │
│  ✓ Language: TypeScript, CSS                 │
│  ✓ Dependencies: 1,247 packages              │
│  ✓ Entry Points: src/main.tsx                 │
│  ✓ Architecture: SPA with routing            │
│                                              │
│  ┌──────────────────┐                        │
│  │ Open Workspace   │                        │
│  └──────────────────┘                        │
└─────────────────────────────────────────────┘
```

### Implementation Steps

1. **Create `WelcomeWizard.tsx`** — Full-screen modal overlay with 4 steps:
   - Step 1: Welcome splash with brand, tagline, "Get Started" CTA
   - Step 2: Provider Detection — auto-detect Ollama, LM Studio, OpenAI, Anthropic
   - Step 3: Model Assignment — dropdowns for Manager/Coder/Fast
   - Step 4: Open Project — folder picker + recent projects list

2. **Integrate into app shell** — Show wizard on `first_launch` flag in `main.tsx` or `App.tsx` (actually consume the sessionStorage value)

3. **Create `OnboardingProvider.tsx`** — Context provider that tracks wizard completion state

4. **Replace `ConfigInitBanner.tsx` with integrated experience** — After project is opened, automatically scan and generate AGENTIC.md (the "Project Analysis" step in the wizard)

5. **Create `ProjectAnalysisPanel.tsx`** — Shows analysis results after workspace open

### Auto-detection Logic

For Step 2, probe locally for:

| Provider | Detection Method |
|----------|-----------------|
| Ollama | `http://localhost:11434/api/tags` |
| LM Studio | `http://localhost:1234/v1/models` |
| OpenAI | Check if API key exists in store |
| Anthropic | Check if API key exists in store |
| OpenRouter | Check if API key exists in store |
| Nvidia NIM | `http://localhost:8888/v1/models` |

### Files to Create

| File | Purpose |
|------|---------|
| `src/renderer/components/onboarding/WelcomeWizard.tsx` | 4-step wizard component |
| `src/renderer/components/onboarding/ProviderDetector.ts` | Provider auto-detection logic |
| `src/renderer/components/onboarding/ModelAssigner.tsx` | Model selection UI |
| `src/renderer/components/onboarding/ProjectOpener.tsx` | Folder picker + recent projects |
| `src/renderer/components/onboarding/ProjectAnalyzer.tsx` | Analysis results display |
| `src/renderer/components/onboarding/OnboardingProvider.tsx` | Completion state context |

### Files to Modify

| File | Change |
|------|--------|
| `src/renderer/main.tsx` | Actually consume `first_launch` flag, show wizard |
| `src/renderer/components/workspace/ConfigInitBanner.tsx` | Simplify or integrate into wizard |
| `src/renderer/components/workspace/WelcomePage.tsx` | Add analysis integration |
