# Contributing to AgenticOS

We welcome contributions! This document outlines the guidelines for contributing to AgenticOS.

## Code of Conduct

By participating, you agree to maintain a respectful and inclusive environment. Please:
- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community

## Getting Started

1. **Fork the repository** and clone locally
2. **Install dependencies**: `npm install`
3. **Verify setup**: `npm run typecheck && npm test`
4. **Create a branch**: `git checkout -b feature/your-feature-name`

## Development Workflow

### Running the app
```bash
npm run dev          # Development mode with hot reload
npm run build        # Production build
npm run dev:renderer # Renderer-only dev mode
```

### Code Quality
```bash
npm run typecheck    # TypeScript type checking (must pass)
npm run lint         # ESLint (must pass)
npm test             # All tests (must pass)
```

### Testing
- Write tests for new features
- Run relevant test suites first, then the full suite
- Tests are located in `tests/` organized by domain
- Test files use `*.test.ts` or `*.test.tsx` naming

### Commit Guidelines
- Use clear, descriptive commit messages
- Prefix with the domain: `[runtime]`, `[browser]`, `[ui]`, etc.
- Reference issues when applicable

## Code Style

- **TypeScript**: Strict mode enabled, avoid `any` types
- **React**: Functional components with hooks
- **Zustand**: For state management
- **Tailwind CSS**: For styling (v4 with v4 plugin)
- **Imports**: Use `@/` alias for `src/renderer/` paths
- **Formatting**: Follow ESLint and TypeScript conventions

## Pull Request Process

1. Ensure all checks pass (typecheck, lint, tests)
2. Update documentation if needed
3. Add tests for new functionality
4. Create a PR with a clear description of changes
5. Link any related issues

## Architecture Overview

See [README.md](README.md#architecture) for the project structure and event flow.

### Key Design Principles
- **Single event protocol**: ExecutionEvent is the canonical event type for all execution lifecycle
- **Single consumer**: ExecutionSessionManager is the sole consumer of execution events
- **Store isolation**: UI stores are written only by the session manager
- **EventBus** carries only UI/theme/plugin/settings events — no execution traffic

## Questions?

Open a [discussion](https://github.com/agenticos/agenticos/discussions) or issue for any questions.
