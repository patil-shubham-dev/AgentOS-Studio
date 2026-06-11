# AgenticOS

> An open-source, AI-powered development operating system with a rich desktop interface, multi-agent orchestration, MCP integration, and an extensible tool ecosystem.

AgenticOS is an **Electron-based desktop application** that turns AI models (Claude, GPT-4o, etc.) into a collaborative agent workforce for software development. It features an interactive file explorer, multi-panel code workspace, chat-based AI assistant, real-time agent orchestration, and granular permission controls.

![AgenticOS](https://img.shields.io/badge/version-2.1.0-blue)
![Electron](https://img.shields.io/badge/Electron-42-47848f)
![React](https://img.shields.io/badge/React-19-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6)

---

## Features

- **Workspace File Explorer** — Browse, open, create, rename, and delete files/folders with a VS Code-style tree view
- **Multi-Panel Code Workspace** — Split-view code editor with Monaco, diff viewer, and file tabs
- **AI Chat Assistant** — Conversational interface with streaming responses, markdown rendering, and syntax-highlighted code blocks
- **Multi-Agent Orchestration** — Autonomous, fastest, most-accurate, research-heavy, human-guided, and safe execution modes
- **Agent Workforce** — Manager, coder, researcher, browser, QA agents that collaborate on tasks
- **Agent Visibility** — Live agent state panel showing what each agent is doing in real-time
- **Extensible Tool System** — Built-in tools: Read, Write, Edit, Glob, Grep, Bash, WebFetch, WebSearch, and more
- **MCP Support** — Connect to Model Context Protocol servers (stdio, SSE, WebSocket, HTTP) for expanded tooling
- **Runtime Execution Engine** — Single-producer, single-consumer event stream with 21 canonical event types
- **Provider Gateway** — Connect OpenAI, Anthropic, Ollama, OpenRouter, and any OpenAI-compatible API
- **Role-Based Configuration** — Assign models and providers to specific agent roles
- **Reliability Layer** — CircuitBreaker, RetryPolicy, ProviderFailover, Watchdog, FaultInjector
- **Browser Workspace** — Headless browser automation with CDP, session persistence, multi-tab support
- **Observability Platform** — Structured logging, metrics (counter/histogram/gauge), error intelligence with fingerprinting
- **Code Intelligence** — Symbol index, dependency graph, call hierarchy, go-to-definition via Babel AST
- **Git Integration** — Basic git operations from within the workspace
- **Auto-Updater** — Built-in update mechanism with Electron auto-updater

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/patil-shubham-dev/AgenticOS.git
cd AgenticOS

# Install dependencies
npm install
```

### Development

```bash
npm run dev
```

Starts the Electron dev server with hot-reload at `http://localhost:5173`.

### Build

```bash
# TypeScript check + Vite build
npm run build

# Production installer for Windows
npm run dist:win
```

Outputs in `release/`:
- `AgenticOS Setup 2.1.0.exe` — NSIS installer (recommended)
- `AgenticOS 2.1.0.exe` — Portable executable

### Other Commands

| Command | Description |
|---------|-------------|
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest tests (680+ passing) |
| `npm run test:e2e` | Run E2E tests |
| `npm run dist` | Build installer for current platform |
| `npm run dist:mac` | Build macOS installer |
| `npm run dist:linux` | Build Linux installer |

---

## Architecture

```
AgenticOS/
├── src/
│   ├── main/                # Electron main process (IPC handlers, window mgmt)
│   │   └── ipc/             # IPC handlers (filesystem, git, browser, etc.)
│   ├── preload/             # Electron preload scripts (context bridge)
│   └── renderer/            # React/TypeScript frontend
│       ├── components/      # UI components
│       │   ├── workspace/   # File tree, code editor, chat, timeline, explorer
│       │   ├── settings/    # Provider, role, tool settings
│       │   └── ui/          # Design system primitives
│       ├── core/            # Kernel, kernel services, error boundaries
│       ├── lib/             # Core libraries (workspace, git, file history, etc.)
│       │   └── tauri-shims/ # Tauri API compatibility layer for Electron
│       ├── pages/           # Route pages
│       ├── runtime/         # Execution engine, agent orchestration, streaming
│       │   ├── agents/      # Agent executor, resolver
│       │   ├── execution/   # ExecutionOrchestrator, SessionManager
│       │   ├── mcp/         # MCP client, registry, server management
│       │   ├── memory/      # Hierarchical memory system
│       │   ├── streaming/   # StreamManager (token coalescer)
│       │   ├── tools/       # Tool registry, pipeline, implementations
│       │   └── skills/      # Skill system (custom prompts)
│       ├── stores/          # Zustand state stores
│       └── performance/     # Performance monitoring, leak detection
├── packages/                # Shared packages
│   ├── providers/           # AI provider gateway
│   ├── shared/              # Common types, constants, utilities
│   └── ui/                  # UI component library
├── release/                 # Build artifacts
├── tests/                   # Browser, journey, durability, stress tests
└── resources/               # Icons, branding, installer assets
```

### Key Architecture Decisions

- **Desktop-first**: Built on Electron 42 for native performance and broad OS support
- **Single Event Stream**: 21-event discriminated union (`ExecutionEvent`) — single producer (`ExecutionOrchestrator`), single consumer (`ExecutionSessionManager`), one store (`timeline-store`)
- **Multi-agent architecture**: Manager agent delegates to specialized sub-agents via `classifyIntent` + routing
- **Provider-agnostic**: Gateway pattern supports any OpenAI-compatible API
- **Real-time streaming**: RAF-buffered token coalescing with append-only DOM rendering
- **State management**: Zustand stores with selector-based subscriptions
- **Security**: Path allowlisting, permission engine, threat model with 12 documented threats

---

## Configuration

### Providers

Connect AI providers in **Settings → Providers**:
- OpenAI (GPT-4o, GPT-4o-mini)
- Anthropic (Claude 3.5 Sonnet, Claude 3 Opus, Claude 4)
- Ollama (local models)
- OpenRouter
- Any OpenAI-compatible API

### Roles

Assign models to agent roles in **Settings → Roles**:
- **Manager** — Orchestrates and delegates tasks
- **Coder** — Writes and edits code
- **Researcher** — Searches codebase and web
- **Browser** — Web automation and browsing
- **QA** — Tests and verifies
- **Memory** — Context management

### Execution Modes

| Mode | Description |
|------|-------------|
| **Autonomous** | AI auto-selects agents and tools |
| **Fastest** | Optimize for speed — parallel execution |
| **Most Accurate** | Multi-agent verification & review |
| **Research** | Deep analysis, extensive searching |
| **Human Guided** | Approve every action before execution |
| **Safe Mode** | Read-only analysis, no mutations |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Desktop Framework** | Electron 42 |
| **UI Framework** | React 19, TypeScript 5.6 |
| **Build Tool** | electron-vite, Vite 6 |
| **Styling** | Tailwind CSS 4 |
| **Code Editor** | Monaco Editor |
| **State Management** | Zustand 5 |
| **Validation** | Zod |
| **Panel Layout** | react-resizable-panels |
| **Routing** | react-router-dom 7 |
| **MCP** | @modelcontextprotocol/sdk |
| **Icons** | Lucide React |
| **Testing** | Vitest, Playwright |
| **Installer** | electron-builder (NSIS) |

---

## Project Status

Production-ready. 79% weighted production readiness score. Active development with focus on security hardening and enterprise features.

### Recent Fixes (v2.1.0)
- Fixed `realpathSync` import error — was incorrectly imported from `path` instead of `fs`
- Migrated renderer filesystem access from `fs` to async Electron IPC bridge
- Fixed `SkillLoader`, `MemoryManager`, `DiskBackedResultStore` for Electron renderer compatibility
- All 680+ tests passing, 0 TypeScript errors, clean production build

---

## License

MIT
