# AgenticOS Design System 2.0

> An operating system for AI agents.
> 
> Not a chat. Not an IDE. Not a terminal.
> 
> A mission control center for parallel intelligence.

---

## Table of Contents

1. Design Philosophy & Principles
2. Color System
3. Typography
4. Thinking Experience
5. Tool Card System
6. Motion System
7. Illustration Language
8. Component Library
9. Icon System
10. Layout & Spacing
11. Empty States
12. Light Theme

---

## 1. Design Philosophy & Principles

### The Operating System Metaphor

AgenticOS is not another AI chat wrapper. It is an operating system purpose-built for orchestrating AI agents. This metaphor drives every design decision:

- **Tools are applications** — Each tool (file editor, terminal, search, git, browser) is a distinct "app" running in the OS. They have their own visual identity, window chrome, and interaction model.
- **The workspace is the desktop** — Agents create windows, arrange panes, and manage resources. The user is the orchestrator, not a chat participant.
- **The timeline is a system log** — Clean, structured, filterable. Not a conversation transcript.
- **Thinking is a process** — Visible, legible, alive. Not a loading spinner.

### Core Principles

**Intelligent** — The interface knows what to show and when. Progressive disclosure is not a design pattern; it's a cognitive necessity. Show signal, hide noise. Surface the thinking path, not every token.

**Calm** — Parallel agents are inherently chaotic. The interface absorbs that chaos. Motion is slow, gentle, and purposeful. Nothing flashes, pulses aggressively, or demands attention without reason. The UI breathes at a human pace while the agents work at machine speed.

**Premium** — Every pixel is intentional. The interface feels machined, not generated. Typography is precise. Spacing is generous. Colors are curated. The app feels like it was crafted by people who care about the difference between 4px and 6px.

**Creative** — AgenticOS is a tool for builders. The interface should feel like a creative studio, not a corporate dashboard. There is room for delight, personality, and visual surprise — but only when it serves the creative process.

**Futuristic** — Not in a sci-fi, neon-glow sense. In a "this is what an OS looks like when designed for the age of intelligence" sense. The visual language should feel inevitable — as if this is simply what agent operating systems look like.

**Trustworthy** — The interface tells the truth. If an agent is stuck, it shows you. If a tool failed, it shows you why. No fake confidence, no glossing over errors. Transparency builds trust.

### Design Commitments

| We will | We will not |
|---------|-------------|
| Design for parallel agent workflows | Design single-turn chat interfaces |
| Use motion to reduce uncertainty | Animate for decoration |
| Show the thinking path | Hide the process behind spinners |
| Give each tool a distinct visual identity | Reuse one generic card for everything |
| Make the UI feel alive | Make the UI feel "loading" |
| Respect user attention | Demand attention without reason |
| Use one coherent design language | Mix design system dialects |
| Be transparent about agent state | Fake confidence |

---

## 2. Color System

### 2.1 Dark Theme (Default)

#### Surface Elevation Model — The Deep Space Stack

AgenticOS uses a surface elevation stack inspired by Raycast's luminance-step approach but adapted for a wider, multi-panel application. Each level emits more light, creating depth without shadows.

| Level | Name | Hex | OkLCH | Purpose |
|-------|------|-----|-------|---------|
| 0 | Canvas | `#08080A` | L 2.5% C 0.005 H 260 | Root background |
| 1 | Panel | `#0C0C0E` | L 4.5% C 0.008 H 260 | Default surface |
| 2 | Elevated | `#111114` | L 6.5% C 0.010 H 260 | Cards, tool containers |
| 3 | Overlay | `#18181B` | L 9% C 0.012 H 260 | Modals, popovers, dropdowns |
| 4 | Tooltip | `#1E1E22` | L 11.5% C 0.015 H 260 | Tooltips, floating UI |
| 5 | Bright | `#27272A` | L 15% C 0.018 H 260 | Active states, inputs |

The hue remains at 260° (cool blue-violet) across all levels, keeping the system cool-tech rather than warm-amber. Chroma increases very slightly at higher levels to create a subtle "lighting" effect — surfaces feel lit from above.

**Key rule:** Never use pure black (`#000000`). The canvas is the darkest element, not a void.

#### Accent — Signal Blue

One accent color carries all primary action. It appears on approximately 8% of any view.

| Token | Hex | OkLCH | Usage |
|-------|-----|-------|-------|
| Signal | `#5B9BFF` | L 62% C 0.16 H 260 | Primary CTAs, active indicators, thinking glow |
| Signal Muted | `rgba(91, 155, 255, 0.12)` | — | Background tints, selection |
| Signal Dim | `rgba(91, 155, 255, 0.3)` | — | Borders, focus rings |
| Signal Text | `#5B9BFF` | L 62% C 0.16 H 260 | Icon fills, accent text |

#### Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| Success | `#34D399` | File writes, tool completion, positive status |
| Warning | `#FBBF24` | Approaching limits, non-critical issues |
| Error | `#F87171` | Failures, cancellations, critical issues |
| Info | `#60A5FA` | Informational states, metadata |

#### Tool Identity Colors

Each tool type has a dedicated hue for card backgrounds, icon fills, and status indicators. These are desaturated, muted tones — they identify without shouting.

| Tool | Hex | OkLCH | Visual Metaphor |
|------|-----|-------|-----------------|
| File Read | `#5B9BFF` / L 62% C 0.16 H 260 | Cool blue — document, information |
| File Write | `#34D399` / L 65% C 0.14 H 160 | Green — creation, growth |
| File Edit | `#A78BFA` / L 60% C 0.17 H 270 | Violet — transformation, refinement |
| Terminal | `#22D3EE` / L 72% C 0.15 H 190 | Cyan — command, interface |
| Search | `#FBBF24` / L 75% C 0.18 H 85 | Gold — discovery, scanning |
| Browser | `#FB923C` / L 65% C 0.16 H 50 | Orange — web, navigation |
| Git | `#F472B6` / L 65% C 0.18 H 330 | Pink — versioning, branches |
| Build | `#38BDF8` / L 68% C 0.15 H 210 | Sky blue — compilation, pipeline |
| Thinking | `#A78BFA` / L 60% C 0.17 H 270 | Violet — contemplation, processing |
| Memory | `#FBBF24` / L 75% C 0.18 H 85 | Gold — knowledge, recall |
| Diagnostics | `#FB923C` / L 65% C 0.16 H 50 | Orange — analysis, health |

#### Text

| Token | Opacity | Usage |
|-------|---------|-------|
| Primary | 0.92 | Headlines, body text |
| Secondary | 0.65 | Labels, captions |
| Tertiary | 0.40 | Metadata, timestamps |
| Quaternary | 0.22 | Placeholder, disabled |
| On-Accent | 0.95 | Text on colored fills |

All text values are `rgba(255, 255, 255, <opacity>)` on dark theme. Never use pure white text — the slight transparency creates visual depth and prevents glare during long sessions.

#### Borders

| Token | Opacity | Usage |
|-------|---------|-------|
| Default | 0.06 | Panel dividers, card edges |
| Subtle | 0.03 | Hairline separators |
| Hover | 0.10 | Interactive element borders on hover |
| Active | 0.15 | Selected/focused border |

All border values use the surface luminance from Level 5 (`#27272A`) at the specified opacity.

---

## 3. Typography

### 3.1 Type Family

**Primary: Inter** — At weight 400 for all UI text, including headlines. AgenticOS follows the weight-400 discipline established by Cursor and Warp: authority comes from scale and letter-spacing, not weight.

- UI: Inter Regular (400), Medium (500) for emphasis only
- Display: Inter Regular (400) with negative letter-spacing
- Code: JetBrains Mono Regular (400)

**Font stack for CSS:**

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
```

### 3.2 Type Scale

| Token | Size | Weight | Letter-Spacing | Line-Height | Usage |
|-------|------|--------|----------------|-------------|-------|
| Hero | 20px | 400 | -0.4px | 1.2 | Page titles, workspace names |
| Heading | 15px | 400 | -0.2px | 1.3 | Section headers, card titles |
| Subhead | 13px | 500 | 0 | 1.4 | Panel headers, tool names |
| Body | 13px | 400 | 0 | 1.5 | Primary reading text |
| Small | 11px | 400 | 0.01em | 1.4 | Labels, metadata |
| Micro | 10px | 500 | 0.02em | 1.3 | Badges, timestamps |
| Caption | 9px | 500 | 0.03em | 1.2 | Tiny UI, keyboard hints |
| Code Body | 12px | 400 | 0 | 1.6 | Code blocks, diffs |
| Code Small | 11px | 400 | 0 | 1.4 | Inline code, terminal |

### 3.3 Typography Principles

**Weight 400 is the default.** Do not use bold (700+) anywhere in the interface. Hierarchy is expressed through size, color opacity, and letter-spacing — never weight.

**Negative tracking on large text.** As text grows, tighten letter-spacing proportionally. The 20px hero tracks at -0.4px. The 15px heading tracks at -0.2px. This creates a compressed, engineered feel.

**Color opacity for hierarchy.** Secondary text (`rgba(255,255,255,0.65)`) creates clear hierarchy without changing weight or size. Use opacity as the primary hierarchy tool.

**Code is UI.** JetBrains Mono appears on all code surfaces, file paths, CLI commands, diffs, and technical metadata. It is a first-class citizen of the typographic system, not a fallback.

**Measure (line length).** Body text containers should not exceed 65-75 characters per line. Code blocks can be wider.

**Text-wrap balance.** Use `text-wrap: balance` on headings to prevent orphans.

---

## 4. Thinking Experience

### 4.1 The Thinking Container

There is one thinking element per agent response. It is not a card. It is a living progress display.

**Structure:**

```
┌─ Thinking ───────────────────────────────── 3.2s ─┐
│                                                    │
│  ● Understanding request                            │
│  ● Planning approach                                │
│  ● Searching project files...                       │
│  ○ Executing tools                                   │
│  ━━━━━━━━━━━━━━░░░░░░░░░░░░░░  42%                  │
│                                                    │
│  ────────────────────────────────────────────────  │
│  🔍 Searching src/ for API endpoint references      │
│   • Found 12 matches in 4 files                     │
│   • Analyzing usage patterns...                     │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Layout:**
- Minimal header: "Thinking" + elapsed time (right-aligned, micro type)
- Step list: completed steps show animated checkmark, current step pulses softly
- Progress bar: thin, gradient-filled, moving left-to-right
- Expandable detail area: click to reveal current reasoning, search context, intermediate results
- Collapsed state: single line — "Thinking..." with gentle pulse animation

### 4.2 Step States

Each step in the thinking timeline has four visual states:

| State | Visual | Animation |
|-------|--------|-----------|
| Pending | ○ — dim circle, low opacity | Static |
| Active | ● — glowing circle + animated pulse | Soft breathing pulse (1.5s cycle) |
| Complete | ✓ — checkmark, shift to green-tinted | Icon morphs from circle to check (200ms ease-out) |
| Error | ✕ — red tint, subtle shake on failure | Single gentle horizontal shake (150ms) |

### 4.3 Thinking Animations

**Pulse:** The active step circle breathes — scale oscillates between 1.0 and 1.08 with opacity varying from 0.6 to 1.0 over 1.5 seconds. CSS: `ease-in-out` at 1.5s cycle.

**Progress bar:** A thin (2px) line below the active step fills gray as steps complete. A gradient-tinted segment (Signal Blue → light violet) tracks current progress. The glow from the active segment is a soft 6px blur, not a harsh neon halo.

**Completion ripple:** When all steps finish, a single gentle ripple emanates from the ✓ icon — a circle that scales from 1.0 to 2.0 with opacity 0.4 → 0 over 400ms `ease-out`. Nothing else happens. No flash, no fanfare.

**Step transition:** Steps do not flash or slide. When a step completes, the checkmark fades in over 100ms and the next step's pulse begins. The transition should feel like a line of text being read, not a notification appearing.

### 4.4 Progressive Detail

The thinking container defaults to collapsed. In collapsed state:
```
Thinking...  ── 3.2s
```

When expanded:
```
✓ Understanding request
✓ Planning approach
● Searching project files...
  ── Running grep for "API_URL" across 12 files
  ── 3 matches in src/config.ts
  ── 2 matches in src/api/client.ts
○ Executing tools
```

The detail area streams in naturally. Each line fades in `opacity: 0 → 1` over 150ms with a 50ms stagger between lines. Text in the detail area uses secondary opacity.

### 4.5 Collapse on Completion

When thinking completes, the container auto-collapses after 1500ms. The collapse is a smooth height transition (300ms `ease-out`), not a sudden disappearance. During collapse, the checkmark scales up slightly (1.0 → 1.1) then fades.

---

## 5. Tool Card System

### 5.1 Design Principles for Tool Cards

Every tool card is a purpose-built visual element with:

1. **A distinct visual identity** — color, icon, layout, and motion per tool type
2. **Immediate signal** — What happened? Why? Result? Duration?
3. **Actionable state** — Shows what happened and what to do next
4. **Living animation** — Cards breathe during execution, settle on completion
5. **Consistent structure** — Header (icon + name + status) + Content + Footer (metadata)

### 5.2 Card Anatomy

```
┌─ [icon] Tool Name ────────── status ● ───── 1.2s ─┐
│                                                     │
│  Content area (varies by tool type)                 │
│                                                     │
│  ────────────────────────────────────────────────  │
│  Metadata | Duration | Details →                    │
└─────────────────────────────────────────────────────┘
```

**Header:** Always contains tool icon (16px), tool name (13px, weight 500), status indicator (colored dot + text), and duration (right-aligned, micro type, tertiary opacity).

**Content:** Varies by tool type. See tool-specific sections below.

**Footer:** Optional. Contains metadata tags, file paths, line counts, or a "details" expand trigger.

**Corners:** 8px radius on all cards.

**Entry animation:** Cards slide in from the bottom with `opacity: 0, y: 12` → `opacity: 1, y: 0` over 300ms `ease-out`. A 50ms stagger between sequential cards creates a natural cascade.

**Completion animation:** When a tool finishes, the status dot transitions with a soft pulse. No sudden green flash — the color shifts smoothly over 200ms.

### 5.3 File Creation

```
┌─ + File Read ─────────────────────────── ✓ 0.4s ─┐
│                                                    │
│  src/components/NewFeature.tsx                      │
│  TypeScript · 142 lines · 3.2 KB                    │
│                                                    │
│  ┌─────────────────────────────────────────────┐   │
│  │  import { useState } from "react"            │   │
│  │  import { motion } from "framer-motion"      │   │
│  │  ...                                         │   │
│  └─────────────────────────────────────────────┘   │
│                                                    │
│  ──────────────────────────────────────────────── │
│  src/components/   Created    Expand preview →     │
└────────────────────────────────────────────────────┘
```

**Visual:** Clean, document-like. File path is prominent (code font, small size). Language badge (TypeScript, Rust, etc.) as a tinted pill. Preview shows first ~6 lines of the file with a subtle gradient fade at the bottom.

**Creation animation:** A "drawing" effect — the file path appears character by character (typewriter effect at 20ms/char), then the preview fades in. This communicates "something is being created."

### 5.4 File Read

```
┌─ File Read ──────────────────────────── ✓ 0.3s ─┐
│                                                   │
│  src/config/index.ts                               │
│  Read 142 lines · 3.2 KB                           │
│                                                   │
│  src/config/index.ts  ── 4.6 KB ── 142 lines      │
│  ┌────────────────────────────────────────────┐   │
│  │  export const API_URL = "https://..."      │   │
│  │  export const TIMEOUT = 30000              │   │
│  │  ...                                       │   │
│  └────────────────────────────────────────────┘   │
│                                                   │
│  Key values extracted:                             │
│  • API_URL, TIMEOUT, RETRY_COUNT                  │
│                                                   │
└───────────────────────────────────────────────────┘
```

**Visual:** Left-aligned file icon (16px) + full path. Key-value pairs extracted from the file shown as compact pills below the preview. This communicates "the agent understood what it read."

### 5.5 File Edit

```
┌─ Edit File ─────────────────────────── ● 1.8s ─┐
│                                                  │
│  src/components/Header.tsx — 3 edits             │
│                                                  │
│  ┌─ + ───────────────────────────────────────┐  │
│  │  + import { UserMenu } from "./UserMenu"  │  │
│  └───────────────────────────────────────────┘  │
│  ┌─ ~ ───────────────────────────────────────┐  │
│  │  - const title = "Old Name"               │  │
│  │  + const title = "New Name"               │  │
│  └───────────────────────────────────────────┘  │
│  ┌─ - ───────────────────────────────────────┐  │
│  │  - console.log("debug:", result)          │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│  Symbols changed: renderTitle, handleClick       │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Visual:** The diff is the centerpiece. Each change is a compact block with a thin left border in the edit color (violet). Insertions have green left border, deletions have red, modifications have amber.

**Diff blocks:** Each block shows 2-4 lines max. For longer diffs, show first/last 2 lines with "… 24 more lines …" collapsed in between. Click to expand.

**Duration display:** Live counter during edit, final duration on completion.

### 5.6 Terminal

```
┌─ Terminal ─────────────────────────── ● running ─┐
│                                                    │
│  $ npm run build                                   │
│                                                    │
│  > project@1.0.0 build                             │
│  > tsc --noEmit && vite build                      │
│                                                    │
│  ✓ TypeScript compiled (142 files)                 │
│  ✓ Build complete (3.2s)                           │
│                                                    │
│  Exit code: 0                        Runtime: 3.2s │
│                                                    │
│  ──────────────────────────────────────────────── │
│  Run again    View output →                        │
└────────────────────────────────────────────────────┘
```

**Visual:** The terminal canvas is slightly darker than the card (Level 0 or between Level 0-1). Command text uses JetBrains Mono at 12px. Output streams in line by line (fade-in, 50ms stagger per line).

**Live output:** The terminal area auto-scrolls. A "scroll to bottom" button appears if the user has scrolled up. Exit code is prominently displayed (green for 0, red for non-zero).

**Terminal animation:** Each new output line fades in from bottom with `opacity: 0, y: 4` → `opacity: 1, y: 0` over 100ms. On rapid output, batch lines every 100ms rather than animating each individually.

### 5.7 Search

```
┌─ Search ───────────────────────────── ● 1.2s ─┐
│                                                 │
│  🔍 "API_ENDPOINT" in src/                      │
│                                                 │
│  ━━━━━━━━━━━━━━━━░░░░░░░░░░  62%               │
│                                                 │
│  Scanned: 142 files                             │
│  Matches: 12 in 4 files                         │
│                                                 │
│  src/config.ts ── 5 matches                     │
│    Line 23: export const API_ENDPOINT = ...      │
│    Line 47:     url: API_ENDPOINT + "/users"     │
│    Line 89:     baseUrl: API_ENDPOINT,           │
│                                                 │
│  src/api/client.ts ── 3 matches                  │
│    Line 12: import { API_ENDPOINT } from "...    │
│    Line 15: fetch(`${API_ENDPOINT}/auth`)        │
│                                                 │
│  ───────────────────────────────────────────── │
│  src/    Copy results    Open in finder →        │
└──────────────────────────────────────────────────┘
```

**Visual:** Search icon prominently displayed (24px). Query shown as a highlighted pill. Progress bar during scanning. Results grouped by file with line numbers. Match context shown inline (1 line before, the match, 1 line after).

**Search animation:** The progress bar has a scanning effect — small light travels left-to-right. When a file is scanned, it fades into the results list. The animation communicates "something is happening" without making the user wait.

### 5.8 Browser

```
┌─ Browser ──────────────────────────── ✓ 2.1s ─┐
│                                                  │
│  🔗 https://docs.example.com/api                 │
│  📄 Documentation                                │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │                                            │   │
│  │   # API Reference                          │   │
│  │                                            │   │
│  │   The API supports the following           │   │
│  │   endpoints: /users, /posts, /comments     │   │
│  │                                            │   │
│  │   ## Authentication                        │   │
│  │   All requests require a Bearer token...    │   │
│  │                                            │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  Extracted: 320 words · 3 main sections          │
│                                                  │
│  ────────────────────────────────────────────── │
│  Preview page    Copy content                    │
└──────────────────────────────────────────────────┘
```

**Visual:** The browser tool card shows a clean preview of the fetched content. The URL is prominent at the top with a favicon placeholder. Content is extracted cleanly — no raw HTML, no clutter. Key information extracted is called out in the footer.

### 5.9 Git

```
┌─ Git ──────────────────────────────── ✓ 0.8s ─┐
│                                                  │
│  main ◇ 2 commits ahead                           │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │  feat: add user authentication module    │   │
│  │  ├── src/auth/           ── 3 files       │   │
│  │  ├── src/components/     ── 1 file        │   │
│  │  └── src/utils/          ── 1 file        │   │
│  │                                            │   │
│  │  fix: resolve timeout issue               │   │
│  │  └── src/config.ts       ── 1 file        │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  5 files changed · 142 insertions · 23 deletions │
│                                                  │
│  Branch: feat-auth    Status: clean              │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Visual:** Commit history as a vertical timeline with dots and connecting lines. Each commit shows message, files changed, and summary stats. Branch name in a pill. Files count prominently displayed.

### 5.10 Build

```
┌─ Build ──────────────────────────── ● 4.2s ─┐
│                                                │
│  tsc --noEmit && vite build                    │
│                                                │
│  ╭──────────────╮  ╭──────────────╮  ╭──────╮ │
│  │  TypeScript  │─▶│    Vite     │─▶│ Done │ │
│  │  ✓ 142 files │  │  ✓ 262 mods │  │   ✓  │ │
│  ╰──────────────╯  ╰──────────────╯  ╰──────╯ │
│                                                │
│  Duration: 4.2s                                │
│  Output: dist/ (2.4 MB)                        │
│                                                │
│  ──────────────────────────────────────────── │
│  Run again    View output →                    │
└────────────────────────────────────────────────┘
```

**Visual:** Pipeline cards arranged horizontally with connecting arrows (→). Each stage is a card showing its name, status icon, and key metric. The pipeline flows left to right. Stages that haven't started yet are shown in dimmed outline.

**Pipeline animation:** As each stage completes, its card fills in with color and a ripple animation moves to the next card. The connecting arrow glows briefly during transition.

### 5.11 Failure State (All Tools)

When a tool fails, the card does not flash or shake aggressively. Instead:

1. The status indicator smoothly transitions to red (200ms ease-out)
2. The error message appears below the content in a subtle red-tinted area
3. The icon in the header shifts to an alert variant (same icon, slightly modified)
4. No sound, no modal, no aggressive animation

```
┌─ File Edit ────────────────────────── ✕ 0.6s ─┐
│                                                  │
│  src/components/Header.tsx                        │
│                                                  │
│  ┌─ ✕ ───────────────────────────────────────┐  │
│  │  File is read-only. Cannot write changes.  │  │
│  │  Suggestion: make writable or create new   │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│  ────────────────────────────────────────────── │
│  Retry    Dismiss                                │
└──────────────────────────────────────────────────┘
```

---

## 6. Motion System

### 6.1 Motion Philosophy

> Motion in AgenticOS has one job: reduce uncertainty. If an animation cannot answer "what is happening right now?" about the system state, it does not belong in the interface.

All motion follows the standards established by Emil Kowalski's design engineering framework. Key decisions:

- **Entering/exiting:** `ease-out` (starts fast, feels responsive)
- **Moving/morphing:** `ease-in-out`
- **Hover/color:** `ease` (CSS default)
- **Constant (progress):** `linear`
- **Default:** `ease-out`

### 6.2 Duration Table

| Element | Duration | Easing | Notes |
|---------|----------|--------|-------|
| Button press feedback | 100ms | ease-out | scale(0.97) |
| Tooltip appear | 125ms | ease-out | 200ms delay before appearing |
| Dropdown open | 150ms | ease-out | |
| Card entry (tool) | 300ms | ease-out | y: 12 → 0, stagger 50ms |
| Thinking step complete | 200ms | ease-out | Icon morph + color shift |
| Thinking container collapse | 300ms | ease-out | Height transition |
| Page/section transition | 250ms | ease-in-out | |
| Modal open | 250ms | ease-out | scale 0.96 → 1 |
| Focus ring | 200ms | ease-out | Border color + shadow |
| Completion ripple | 400ms | ease-out | scale 1 → 2, opacity fades |

**Key rule:** UI animations stay under 300ms. A 150ms dropdown feels more responsive than a 400ms one. Only decorative or celebratory animations exceed 300ms.

### 6.3 Easing Curves

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-default: cubic-bezier(0.4, 0, 0.2, 1);
--ease-spring-gentle: cubic-bezier(0.34, 1.56, 0.64, 1);
```

The "gentle spring" curve (`--ease-spring-gentle`) is reserved for moments of delight: completion checkmarks, success confirmation, subtle entrance of the illustration system. It introduces a tiny bounce. Use it sparingly — at most 2-3 times per session.

### 6.4 Enter/Exit Patterns

**Cards:** `y: 12 → 0`, `opacity: 0 → 1`, 300ms ease-out. Stagger sequential cards by 50ms.

**Modals:** `scale: 0.96 → 1`, `opacity: 0 → 1`, 250ms ease-out. Origin: center of viewport.

**Dropdowns:** `y: -4 → 0`, `opacity: 0 → 1`, 150ms ease-out. Origin-aware: scale from trigger element.

**Tooltips:** `opacity: 0 → 1`, 125ms ease-out, 200ms delayed trigger. No movement — tooltips should not "fly in."

**Notifications:** `x: 100% → 0`, 250ms ease-out. Stack upwards.

### 6.5 Micro-interactions

**Button press:** `transform: scale(0.97)` on `:active`, 100ms ease-out. Applies to all pressable elements.

**Hover state:** Color shifts at 150ms ease. Border appears at 150ms ease. No scale on hover (only on press).

**Focus ring:** Inner `box-shadow` transitions at 200ms ease-out. Smooth, not instantaneous.

**Thinking pulse:** Scale 1.0 ↔ 1.08, opacity 0.6 ↔ 1.0, 1.5s cycle, `ease-in-out`. The pulse is barely perceptible — it should feel like breathing, not throbbing.

**Progress bar:** Continuous `linear` movement for indeterminate progress. Discrete step fills for determinate progress (200ms ease-out per step).

**Success indicator:** Color transitions smoothly (200ms ease-out). A single subtle ripple emanates from the indicator (400ms ease-out, scale 1→1.5, opacity 0.4→0).

### 6.6 Page Transitions

- Sidebar navigation items: content area crossfades at 250ms ease-in-out
- Workspace switching: subtle opacity crossfade at 300ms ease-in-out, no slide
- Settings page: content slides right on enter, left on exit (to communicate depth)

### 6.7 Accessibility

- All motion respects `prefers-reduced-motion`: animations are reduced to opacity-only transitions at 50ms
- No auto-playing video or looping animations
- All animated elements have `aria-live` regions for screen reader announcements
- Focus indicators are never animated — they appear instantly on keyboard navigation

---

## 7. Illustration Language

### 7.1 Philosophy

AgenticOS uses an abstract geometric illustration system. No people, no robots, no brains, no circuit boards, no sparkles. The language communicates technical concepts through shape, color, and motion.

**Visual vocabulary:**
- Circles and arcs → communication, connection, flow
- Rectangles and grids → code, structure, organization
- Triangles and angles → transformation, building, creation
- Waves and sine curves → data, signals, processing
- Networks and nodes → agents, collaboration, linking

### 7.2 Illustration Types

**Workspace Empty State:**
```
A geometric "window" frame in the center of the canvas.
Inside, a faint grid recedes into perspective.
A single node pulses at the center.
Two orbiting rings circle the node at different speeds.
Subtle gradient from Signal Blue to violet.
```
This communicates: "Your workspace is ready. Agents are waiting."

**Thinking State:**
```
A vertical stack of three horizontal lines, each slightly offset.
The top line pulses slowly.
A soft ambient glow radiates behind.
```
This communicates: "Processing. Something is being assembled."

**Searching State:**
```
A grid of dots (16×16) with one column highlighted.
The highlight moves left to right at a steady pace.
Occasional dots light up briefly behind the scanning column.
```
This communicates: "Scanning. Data is being examined."

**Success State:**
```
A circle that draws itself (stroke-dasharray animation).
Inside, a smaller concentric circle expands and fades.
The entire mark glows briefly before settling.
```

**Error State:**
```
A hexagon with one jagged side.
The jagged section glows red briefly, then fades to dim.
The shape remains — imperfect but stable.
```

**Empty File List:**
```
A stack of three rectangles, progressively smaller.
The top rectangle has a fold in the top-right corner.
A faint grid pattern inside suggests content.
The stack casts a subtle shadow to the right.
```

**No Project Selected:**
```
A large empty window frame made of thin lines.
Inside, a circular "cursor" that blinks patiently.
Text centered below: "Open a workspace to begin."
```

### 7.3 Color for Illustrations

All illustrations use the existing color tokens:
- Primary shapes: `rgba(255,255,255,0.06)` — barely visible base
- Active elements: Signal Blue with `rgba(91,155,155,0.4)` glow
- Grid/dots: `rgba(255,255,255,0.03)` — faint structural elements
- Success wash: Green at `rgba(52,211,153,0.15)`
- Error wash: Red at `rgba(248,113,113,0.12)`

---

## 8. Component Library

### 8.1 Buttons

| Variant | Visual | Usage |
|---------|--------|-------|
| Primary | Signal Blue fill, white text, 8px radius | Primary action per view (send, save, confirm) |
| Secondary | Transparent, 1px border (`opacity 0.1`), 8px radius | Secondary actions |
| Ghost | No border, fills on hover at `opacity 0.04` | Toolbar buttons, inline actions |
| Danger | Red tint at `opacity 0.12`, red text | Destructive actions (cancel, delete) |
| Icon | 28×28px, ghost variant | Icon-only toolbar actions |

**Button sizing:**
- Default: 32px height, 12px horizontal padding
- Small: 24px height, 8px horizontal padding
- Micro: 20px height, 6px horizontal padding

**Button text:** 12px, weight 500, Inter.

**Press feedback:** `scale(0.97)` at 100ms ease-out.

### 8.2 Inputs

| Variant | Visual | Usage |
|---------|--------|-------|
| Text | 32px height, 8px radius, border `opacity 0.06` | Primary input fields |
| Textarea | 8px radius, same border pattern | Multi-line input |
| Search | Same as text with search icon prefix | Search fields |

**Focus state (all inputs):** Border shifts to Signal Blue at `opacity 0.3`, subtle glow (`box-shadow: 0 0 0 1px var(--signal-dim)`).

**Disabled state:** Opacity 0.4, no focus interactions.

**Placeholder:** Tertiary opacity.

### 8.3 Tabs

Horizontal tab bar with 32px height. Tabs are spaced 24px apart. Active tab has a 2px bottom bar in Signal Blue with 200ms ease-out width transition on switch. Inactive tabs use tertiary opacity.

### 8.4 Accordion

32px header height. Rotating chevron (90° → 0° on open). Content area height-animates at 200ms ease-out. Background fill: none — accordion sections are distinguished by top/bottom borders only (1px, `opacity 0.04`).

### 8.5 Tooltips

125ms fade-in, 200ms delay before appearing. Background: Level 3 (Overlay). Text: 11px, secondary opacity. 6px padding horizontal, 3px vertical. 6px radius. Arrow pointing toward trigger element.

### 8.6 Dropdowns

150ms entry animation. Background: Level 3 (Overlay). 8px radius. Border: 1px at `opacity 0.08`. Shadow: `0 8px 24px rgba(0,0,0,0.4)`. Items: 28px height, 8px horizontal padding. Hover: `opacity 0.04` fill. Selected: Signal Blue tint.

### 8.7 Command Palette (⌘K)

Full-width overlay (not a modal). Background: Level 3 at `rgba(24,24,27,0.95)` with `backdrop-filter: blur(20px)`. 12px radius. Centered at 50% viewport height. Max-width: 640px. Search input at top with autofocus. Results list below with keyboard navigation (↑↓, enter to select). Actions shown inline with ⌘1, ⌘2 shortcuts.

### 8.8 Dialogs

Centered modal. Background: Level 3 (Overlay). 12px radius. 1px border at `opacity 0.08`. Shadow: `0 24px 64px rgba(0,0,0,0.5)`. Entry: scale 0.96 → 1 at 250ms ease-out. Backdrop: `rgba(0,0,0,0.4)` with `backdrop-filter: blur(2px)`.

### 8.9 Notifications

Top-right toast stack. Background: Level 3 (Overlay). 8px radius. 1px border at `opacity 0.06`. Entry: `x: 100% → 0` at 250ms ease-out. Auto-dismiss after 4s (success/info) or persist (error/warning). Stack upwards with 8px gap.

### 8.10 Progress Indicators

| Variant | Visual | Usage |
|---------|--------|-------|
| Linear determinate | 2px height, Signal Blue fill, `linear` transition | Build progress, file operations |
| Linear indeterminate | 2px height, Signal Blue gradient that sweeps left-right | Thinking, searching |
| Dot | 4px circle, thinking pulse animation | Inline status indicators |
| Spinner | 16px, 1.5px stroke, animated 360° rotation, transparent center | Button loading states |

### 8.11 Workspace Panel

The main workspace panel has:
- Left sidebar: Session list (240px width, resizable)
- Center: Timeline/conversation area (flex)
- Right: Optional context panel (320px, toggleable)
- Bottom: Composer (fixed height, variable based on content)

Sidebar uses Level 1 background, center uses Level 0, right panel uses Level 1.

### 8.12 Explorer

File tree in the sidebar or right panel. Indentation: 16px per level. File icon: 14px, quaternary opacity. Folder icon: 14px, expand/collapse chevron. Selected file: Signal Blue tint background. Hover: subtle tint (`opacity 0.03`). File path truncation at parent level.

### 8.13 Context Menus

Right-click context menus use the same styling as dropdowns. 150ms entry. Group separators: 1px line at `opacity 0.04` with 4px vertical margin.

---

## 9. Icon System

### 9.1 Principles

- **Source:** Lucide icons (already in use, consistent stroke width)
- **Stroke width:** 1.5px on all icons
- **Size:** All UI icons are 14px (inline) or 16px (toolbar/button). Tool icon headers use 18px.
- **Corner radius:** All icons use the same corner treatment — 1.5px stroke with 2px internal round
- **Fill:** None. AgenticOS uses outline-only icons. The absence of fill creates a clean, technical look.
- **Color:** Icons use text color tokens, not accent colors. Only tool identity icons use their dedicated hue.

### 9.2 Tool Icons

Each tool type has a paired icon concept:

| Tool | Icon | Concept |
|------|------|---------|
| File Read | `FileText` | Document with text lines |
| File Write | `FilePlus` | Document with + indicator |
| File Edit | `FileEdit` | Document with pencil |
| Terminal | `Terminal` | Command prompt brackets |
| Search | `Search` | Magnifying glass |
| Browser | `Globe` | Earth grid |
| Git | `GitBranch` | Branch fork |
| Build | `Hammer` | Construction |
| Thinking | `Brain` or `Sparkles` | Neural/creative |
| Memory | `Database` | Storage cylinder |

### 9.3 System Icons

| Icon | Usage |
|------|-------|
| `ChevronRight` / `ChevronDown` | Accordion, expand/collapse |
| `X` | Close, dismiss |
| `Plus` | Add, create |
| `MoreHorizontal` | Overflow menu |
| `Settings` | Configuration |
| `Search` | Find |
| `Command` | Command palette |
| `ArrowRight` / `ArrowLeft` | Navigation |
| `Check` | Confirmation |
| `AlertCircle` | Warning |
| `AlertTriangle` | Error |
| `Info` | Information |
| `Loader` | Loading |
| `Copy` | Duplicate |
| `Trash2` | Delete |
| `ExternalLink` | Open in external |

---

## 10. Layout & Spacing

### 10.1 Spacing Scale

The spacing scale follows an 8px base unit with 4px micro increments.

| Token | Value | Usage |
|-------|-------|-------|
| 2 | 2px | Micro adjustments |
| 4 | 4px | Tight gaps, icon padding |
| 6 | 6px | Compact label padding |
| 8 | 8px | Standard padding, card padding |
| 12 | 12px | Comfortable padding |
| 16 | 16px | Section spacing |
| 20 | 20px | Panel padding |
| 24 | 24px | Card inner padding |
| 32 | 32px | Section margin |
| 40 | 40px | Large section spacing |
| 48 | 48px | Page section spacing |
| 56 | 56px | Hero spacing |
| 64 | 64px | Major section gap |

### 10.2 Component Sizing

- **Sidebar:** 240px (resizable, min 200px, max 320px)
- **Right panel:** 320px (resizable, min 280px, max 400px)
- **Composer:** 44px minimum height, expands to max 200px with content
- **Tool cards:** Full width of the timeline column (flex basis 100%)
- **Modals:** `min(640px, 90vw)` width, `min(480px, 80vh)` height
- **Command palette:** `min(480px, 640px)` width

### 10.3 Grid

The timeline area uses a single-column layout with tool cards as full-width blocks. Each card has 8px vertical gap. Cards stack naturally in reading order.

The sidebar uses a two-level list structure: sessions at Level 1, with optional grouping headers (by project, by status).

### 10.4 Responsive Behavior

AgenticOS is a desktop application. Responsive rules apply to panel layouts, not screen sizes:

| Breakpoint | Behavior |
|------------|----------|
| >1400px | All panels visible: sidebar + timeline + right panel |
| 1000-1400px | Right panel collapses to overlay (button to show) |
| <1000px | Sidebar collapses to compact icon mode |

---

## 11. Empty States

Every empty state in AgenticOS is an opportunity to communicate purpose and guide action.

### 11.1 Empty Workspace

```
┌──────────────────────────────────────────┐
│                                          │
│              [Illustration]               │
│         A geometric window frame          │
│         with a pulsing center node        │
│              and orbiting rings           │
│                                          │
│        No workspace selected              │
│        Open a project folder to begin     │
│        working with AI agents.            │
│                                          │
│        [ Open Workspace ]                 │
│                                          │
│        Or drop a folder anywhere          │
│        to get started                    │
│                                          │
└──────────────────────────────────────────┘
```

### 11.2 Empty Chat

```
┌──────────────────────────────────────────┐
│                                          │
│              [Illustration]               │
│         A dot grid with one column        │
│         highlighted, scanning left-right  │
│                                          │
│        Ask anything...                    │
│        Start with a question, a           │
│        file path, or a command.           │
│                                          │
│    /fix    /generate    /explain          │
│    /test    /design     /browse           │
│                                          │
└──────────────────────────────────────────┘
```

### 11.3 No Search Results

```
┌──────────────────────────────────────────┐
│                                          │
│              [Illustration]               │
│         A grid with all dots dimmed       │
│         except one, very faint            │
│                                          │
│        No results found                   │
│        Try a different search term        │
│        or broaden your query.             │
│                                          │
└──────────────────────────────────────────┘
```

### 11.4 Agent Idle

When the workspace has an agent but no task is running:

```
┌──────────────────────────────────────────┐
│                                          │
│        Agent ready                        │
│        Connected and waiting for          │
│        your instruction.                  │
│                                          │
│        Suggested:                         │
│        • Explain this codebase            │
│        • Find and fix bugs                │
│        • Generate tests                   │
│        • Refactor the project             │
│                                          │
└──────────────────────────────────────────┘
```

---

## 12. Light Theme

### 12.1 Surface Elevation (Light)

| Level | Name | Hex | Usage |
|-------|------|-----|-------|
| 0 | Canvas | `#F5F4F2` | Root background |
| 1 | Panel | `#F0EFED` | Default surface |
| 2 | Elevated | `#FFFFFF` | Cards, tool containers |
| 3 | Overlay | `#FFFFFF` | Modals, popovers |
| 4 | Tooltip | `#FFFFFF` | Tooltips |
| 5 | Bright | `#FFFFFF` | Active states |

### 12.2 Text (Light)

| Token | Value | Usage |
|-------|-------|-------|
| Primary | `#1C1B1A` | Headlines, body |
| Secondary | `rgba(28,27,26,0.6)` | Labels, captions |
| Tertiary | `rgba(28,27,26,0.35)` | Metadata, timestamp |
| Quaternary | `rgba(28,27,26,0.18)` | Placeholder, disabled |

### 12.3 Accent (Light)

Signal Blue adjusts to `#4A7FCC` (slightly darker to maintain contrast on light backgrounds). All tool identity colors darken proportionally.

### 12.4 Borders (Light)

| Token | Value |
|-------|-------|
| Default | `rgba(28,27,26,0.08)` |
| Subtle | `rgba(28,27,26,0.04)` |
| Hover | `rgba(28,27,26,0.12)` |
| Active | `rgba(28,27,26,0.18)` |

---

## Appendix A: Design Review Checklist

Before shipping any UI change:

- [ ] Does this feel like an operating system, not a chat app?
- [ ] Is the accent color used on <10% of visible elements?
- [ ] Are all text values using the correct opacity token (not hardcoded hex)?
- [ ] Do all animations stay under 300ms (except decorative)?
- [ ] Is motion purposeful (reduces uncertainty)?
- [ ] Does `prefers-reduced-motion` work correctly?
- [ ] Are tool card visuals distinct by tool type?
- [ ] Is the thinking container a single element?
- [ ] Are all spacing values from the token scale?
- [ ] Is the typography using weight 400 as default?
- [ ] Are icons outline-only with 1.5px stroke?
- [ ] Does this component match the design language? (Not generic Tailwind)

## Appendix B: Design Decisions vs Competitors

| Decision | AgenticOS | Claude Code | Cursor | Warp |
|----------|-----------|-------------|--------|------|
| Canvas | Cool deep charcoal | Warm dark (#2b2b2b) | Warm cream (#f7f7f4) | Warm dark (#2b2622) |
| Accent | Signal Blue (cool) | Amber (#c47156) | Orange (#f54e00) | Off-white (none) |
| Display weight | 400 | 400 | 400 | 400 |
| Thinking | One container | Multiple cards | Timeline pills | Terminal output |
| Tool cards | Purpose-built per tool | Uniform | Context-dependent | Terminal-native |
| Surface model | Luminance steps | Minimal | Hairline borders | Flat |
| Motion | Calm, alive | Subtle | Minimal | Terminal rhythm |
| Corner radius | 8px | Varies | 4px | 3-4px |
| Icon style | Outline 1.5px | Mixed | Monoline | Filled |
| Typography | Inter 400 | System-ui | CursorGothic | Matter/Inter |

---

*AgenticOS Design System 2.0 — Not a chat. Not an IDE. An operating system for AI agents.*
