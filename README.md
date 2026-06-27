# AgenticOS

**Your AI operating system for development** — a desktop coding assistant with multi-agent orchestration, browser automation, terminal integration, and deep code intelligence.

[![CI](https://github.com/agenticos/agenticos/actions/workflows/ci.yml/badge.svg)](https://github.com/agenticos/agenticos/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%5E18.0.0-339933)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)

---

## Features

- **Multi-agent AI engine** — Manager, Coder, Research, Browser, QA, and Memory agents collaborate on complex tasks with streaming responses, multi-model support (OpenAI, Anthropic, MCP), and tool orchestration.
- **Code intelligence** — Symbol indexing across 8+ languages, dependency graph visualization, semantic code search, and architecture-aware project mapping.
- **Browser workspace** — Headless browser automation via CDP with an embedded live viewport, console/network inspector, annotation tools, and session persistence.
- **Terminal & execution** — Full PTY terminal emulation with real-time command streaming, approval gates, command allowlists, and sandboxing.
- **Memory & context** — Tiered memory system (ephemeral, session, project, global scopes) with intelligent context compression and workspace-aware relevance.

---

## Getting Started

```bash
git clone https://github.com/agenticos/agenticos.git
cd agenticos
npm install
npm run dev
```

1. Add an AI provider in **Settings → Providers**
2. Open a workspace folder
3. Start coding — ask the AI to explain code, refactor, or build features

### Headless CLI

```bash
npm run cli -- --print "Explain the event system"
echo "Hello" | npm run cli -- --stdin
npm run cli -- --file prompt.txt --json
```

---

## Project Structure

```
src/
├── main/           # Electron main process (IPC, window management, services)
├── preload/        # Context bridge (preload script)
└── renderer/       # React application
    ├── core/       # Kernel, routing, error boundaries
    ├── components/ # UI components organized by domain
    ├── pages/      # Route pages
    ├── runtime/    # AI execution engine (agents, tools, memory, context, streaming)
    ├── stores/     # Zustand state stores
    ├── lib/        # Utilities and services
    └── types/      # TypeScript type definitions
packages/
├── providers/  # Provider transport layer
├── shared/     # Shared types and utilities
└── ui/         # Shared UI components
tests/          # Test files organized by domain
```

### Architecture

```
User Input → RuntimeOS → AgentExecutor → Tools → File System / Browser / Terminal
    ↓                                                                        ↓
ExecutionSessionManager ← ExecutionEvent protocol
    ↓
StreamManager → TimelineStore → React UI
```

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| Desktop | Electron 42 |
| UI | React 19, Tailwind CSS 4, Radix UI, Framer Motion |
| Language | TypeScript 6 (strict mode) |
| State | Zustand |
| Editor | Monaco Editor |
| Terminal | xterm.js + node-pty |
| Browser | Playwright Core (CDP) |
| Testing | Vitest 3 |
| Build | Vite 6 + electron-vite + electron-builder |
| AI | Multi-provider (OpenAI, Anthropic, MCP) |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development mode with hot reload |
| `npm run build` | TypeScript check + production build |
| `npm test` | Run all tests (vitest) |
| `npm run typecheck` | TypeScript strict type checking |
| `npm run lint` | ESLint code quality |
| `npm run dist` | Build distribution packages |
| `npm run cli` | Headless CLI mode |

---

## Testing

**880+ passing tests** across 68 test files.

```bash
npm test                                    # Full suite
npx vitest run tests/agent-system           # Agent tests
npx vitest run tests/reliability            # Reliability tests
npx vitest run tests/browser                # Browser tests
npx vitest run tests/memory                 # Memory tests
```

### Performance Benchmarks

| Operation | p50 | p95 | p99 |
|-----------|-----|-----|-----|
| Search (1k files) | 0.4ms | 5.1ms | 17.3ms |
| Search (10k files) | 2.7ms | 10.7ms | 83.5ms |
| Search (50k files) | 7.3ms | 22.9ms | 30.6ms |

---

## Project Status

**Production Readiness Score: 82%**

| Category | Score |
|----------|-------|
| Agent System | 93% |
| Reliability | 90% |
| Architecture | 85% |
| Code Intelligence | 85% |
| UX | 86% |
| Security | 60% |
| Scalability | 62% |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on code of conduct, development workflow, commit conventions, and pull request process.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

Built with [Electron](https://www.electronjs.org/), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), and the open-source community.
