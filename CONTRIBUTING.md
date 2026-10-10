# Contributing to Live Canvas

Thank you for improving Live Canvas. Contributions should preserve its central promise: a local-first, understandable, and non-destructive way to keep a native Obsidian Canvas synchronized.

## Before you start

- Search existing issues before opening a new one.
- Use a discussion or feature request for a substantial behavior change.
- Keep unrelated changes in separate pull requests.
- Never test risky changes on your only copy of an important vault.

## Local setup

Install Node.js 18 or newer, clone the repository, then run:

```bash
npm ci
npm run check
```

For development with automatic rebuilding:

```bash
npm run dev
```

Copy or symlink `main.js`, `manifest.json`, and `styles.css` into a test vault at `.obsidian/plugins/live-canvas/`. Reload Obsidian after rebuilding.

## Code expectations

- Prefer documented Obsidian APIs.
- Keep Canvas generation deterministic and covered by tests.
- Preserve user-created Canvas content and card geometry unless an action explicitly says otherwise.
- Do not add analytics, telemetry, remote services, advertisements, or required accounts.
- Treat paths and note contents as private local data.
- Add a changelog entry for user-visible changes.

## Pull requests

Explain the user problem, the chosen behavior, and how you tested it. The automated checks must pass. Interface changes should include a screenshot or small example Canvas when possible.

By contributing, you agree that your contribution is licensed under the MIT License.
