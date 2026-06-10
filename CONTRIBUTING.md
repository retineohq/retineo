# Contributing to Retineo Core

Thank you for your interest in contributing! This document outlines the process and guidelines.

## How to Contribute

1. **Fork** the repository on GitHub.
2. **Create a branch** from `main` for your feature or fix:
   ```bash
   git checkout -b feature/my-feature
   ```
3. **Make your changes** following the code style below.
4. **Run tests** and ensure they all pass:
   ```bash
   pnpm test
   ```
5. **Run the linter**:
   ```bash
   pnpm lint
   ```
6. **Build** to verify TypeScript compiles cleanly:
   ```bash
   pnpm build
   ```
7. **Commit** with a clear message describing the change.
8. **Open a Pull Request** against `main`.

## Code Style

- **TypeScript** with `strict: true`.
- Use explicit types for public APIs.
- Prefer `const` and `readonly` where possible.
- Follow existing naming conventions (`camelCase` for variables/functions, `PascalCase` for types/classes).
- Keep functions small and focused.

## Test Requirements

- All tests must pass before merging (`pnpm test`).
- New features must include tests.
- Bug fixes should include a regression test.

## Issue Reporting

- Use [GitHub Issues](https://github.com/retineohq/retineo/issues).
- Search existing issues before opening a new one.
- Include reproduction steps, expected behavior, and actual behavior.
- Specify your environment: OS, Node.js version, and Retineo Core version.

## Development Setup

```bash
# Clone your fork
git clone https://github.com/<your-username>/retineo.git
cd retineo

# Install dependencies
pnpm install

# Run tests
pnpm test

# Build
pnpm build

# Run CLI locally
node bin/retineo.js --help
```

## Questions?

Open a [GitHub Discussion](https://github.com/retineohq/retineo/discussions) or reach out via email: kot.valery@gmail.com
