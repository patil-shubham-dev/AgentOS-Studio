# AgenticOS

**Your AI Operating System for Development**

AgenticOS is a next-generation development environment that combines an intelligent AI coding assistant with a full-featured Electron desktop application. It provides multi-agent orchestration, browser automation, terminal integration, and deep code intelligence — all within a unified interface.

[![Build Status](https://github.com/agenticos/agenticos/actions/workflows/ci.yml/badge.svg)](https://github.com/agenticos/agenticos/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.1.0-blue.svg)](package.json)

---

## Features

### 🧠 Multi-Agent AI Engine
- **Orchestrated agents** — Manager, Coder, Research, QA, Browser, and Memory agents collaborate on complex tasks
- **Streaming responses** — Real-time token delivery with activity indicators
- **Multi-model support** — Connect to OpenAI, Anthropic, or any OpenAI-compatible provider
- **MCP protocol** — Extend capabilities with the Model Context Protocol

### 🔍 Code Intelligence
- **Symbol indexing** — Extract functions, classes, interfaces from 8+ languages
- **Dependency scanning** — Visualize import graphs and call hierarchies
- **Semantic search** — Find code by meaning, not just text
- **Project map** — Architecture-aware file exploration

### 🌐 Browser Workspace
- **Headless browser** — Automate web interactions via CDP (Chrome DevTools Protocol)
- **Live viewport** — Embedded browser view with console, network, and annotation tools
- **Session persistence** — Save and restore browser sessions
- **Multi-tab management** — Navigate complex web applications

### 💻 Terminal & Execution
- **PTY integration** — Full terminal emulation with xterm.js
- **Command streaming** — Real-time command output with approval gates
- **Safety controls** — Command allowlists, path validation, and sandboxing

### 🗄️ Memory & Context
- **Tiered memory system** — Ephemeral, session, project, and global scopes
- **Context compression** — Intelligent compaction to stay within token budgets
- **Workspace awareness** — Automatically surfaces relevant files and symbols

---

## Getting Started

### Prerequisites

- **Node.js** ^18.0.0
- **npm** ^9.0.0
- **Chrome/Chromium** (for browser features)

### Installation

```bash
# Clone the repository
git clone https://github.com/agenticos/agenticos.git
cd agenticos

# Install dependencies
npm install

# Start in development mode
npm run dev
```

### Quick Start

1. Launch AgenticOS: `npm run dev`
2. Add an AI provider in **Settings → Providers**
3. Open a workspace folder
4. Start coding — ask the AI to explain code, refactor, or build features

### Headless CLI

```bash
# Run a single prompt
npm run cli -- --print "Explain the event system"

# Pipe input
echo "Hello" | npm run cli -- --stdin

# Structured JSON output
npm run cli -- --file prompt.txt --json
```

---

## Architecture

```
src/
├── cli/                    # Headless CLI mode
├── main/                   # Electron main process
├── preload/                # Electron preload bridge
└── renderer/               # React application
    ├── core/               # Kernel, routing, error boundaries
    ├── components/         # UI components
    ├── pages/              # Route pages
    ├── runtime/            # Execution engine & agent system
    │   ├── execution/      # Orchestrator, sessions, steps
    │   ├── agents/         # Agent executor & resolver
    │   ├── streaming/      # Token streaming
    │   ├── memory/         # Memory architecture (unified)
    │   ├── context/        # Context management
    │   ├── tools/          # Tool registry & execution
    │   ├── mcp/            # MCP protocol support
    │   └── skills/         # Skill system
    ├── stores/             # Zustand state stores
    ├── lib/                # Utilities & services
    ├── performance/        # Leak detection & assertions
    └── types/              # TypeScript type definitions
tests/
├── agent-system/           # Agent lifecycle & routing tests
├── browser/                # Browser automation tests
├── memory/                 # Memory engine tests
├── reliability/            # Circuit breaker, retry, watchdog tests
├── sessions/               # Session durability & production readiness
├── search/                 # Search index benchmarks
└── ...
packages/
├── providers/              # Standalone provider transport
├── shared/                 # Shared types & utilities
└── ui/                    # Shared UI components
```

### Event Flow

```
User Input → ExecutionOrchestrator → RuntimeOS → AgentExecutor
    ↓                                                        ↓
ExecutionSessionManager ← ExecutionEvent (21-event protocol)
    ↓
StreamManager → TimelineStore → React UI (assistant responses)
```

---

## Key Concepts

### Agents & Roles
| Role | Purpose |
|------|---------|
| **Manager** | Coordinates multi-agent workflows, delegates tasks |
| **Coder** | Writes and edits code |
| **Research** | Searches codebase, web, and documentation |
| **Browser** | Interacts with web pages |
| **QA** | Validates changes, runs tests |
| **Memory** | Manages conversation and project memory |

### Provider System
Connect any OpenAI-compatible API. Configure in Settings or via environment:
```bash
export AGENTIC_API_KEY="sk-..."
export AGENTIC_MODEL="gpt-4o"
export AGENTIC_PROVIDER="openai"
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm test` | Run all tests |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint code quality checks |
| `npm run dist` | Build distribution packages |

---

## Testing

AgenticOS has **880+ passing tests** across 68 test files:

```bash
# Run all tests
npm test

# Run specific test suites
npx vitest run tests/agent-system
npx vitest run tests/reliability
npx vitest run tests/browser
npx vitest run tests/memory
```

### Benchmark Results
| Operation | p50 | p95 | p99 |
|-----------|-----|-----|-----|
| Search (1k files) | 0.4ms | 5.1ms | 17.3ms |
| Search (10k files) | 2.7ms | 10.7ms | 83.5ms |
| Search (50k files) | 7.3ms | 22.9ms | 30.6ms |

---

## Project Status

**Production Readiness Score: 82%** (weighted across 11 categories)

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

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- AI providers powering the agent system
- The open-source community
