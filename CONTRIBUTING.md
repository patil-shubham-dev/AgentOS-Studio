# Contributing to AgenticOS

We welcome contributions. Please follow these guidelines to keep the project consistent and maintainable.

## Code of Conduct

Be respectful, inclusive, and constructive. Focus on what's best for the project and community.

## Getting Started

```bash
git clone https://github.com/agenticos/agenticos.git
cd agenticos
npm install
npm run typecheck && npm test    # Verify setup
git checkout -b feature/your-feature
```

## Development Workflow

```bash
npm run dev          # Development mode with hot reload
npm run build        # Production build
```

### Commit Guidelines

- Write clear, descriptive commit messages
- Prefix with domain: `[runtime]`, `[browser]`, `[ui]`, `[core]`, `[main]`, `[tests]`
- Reference issues when applicable

### Code Quality (must pass before PR)

```bash
npm run typecheck    # TypeScript strict mode
npm run lint         # ESLint
npm test             # Full test suite
```

## Code Style

- **TypeScript**: strict mode enabled. Avoid `any`.
- **React**: functional components with hooks, no class components.
- **State**: Zustand stores — one store per domain.
- **Styling**: Tailwind CSS v4 with `cn()` utility (`clsx` + `tailwind-merge`).
- **Imports**: `@/` alias for `src/renderer/`. Use `@agentic-os/*` for monorepo packages.
- **Naming**: PascalCase for components/types, camelCase for functions/variables, SCREAMING_SNAKE for constants.

## Pull Request Process

1. All checks must pass (typecheck, lint, tests)
2. Add tests for new functionality
3. Update documentation if needed
4. Create a PR with a clear description linking related issues

## Architecture Principles

- **Single event protocol**: `ExecutionEvent` is the canonical type for all execution lifecycle
- **Single consumer**: `ExecutionSessionManager` is the sole consumer of execution events
- **Store isolation**: UI stores are written only by the session manager, never directly by runtime code
- **EventBus** carries UI/theme/plugin/settings events only — no execution traffic

## Questions?

Open a [discussion](https://github.com/agenticos/agenticos/discussions) or issue.
