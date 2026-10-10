# Development

## Prerequisites

- Node.js 18 or newer; CI uses Node.js 24.
- npm
- A separate Obsidian test vault

## Setup

```bash
git clone <your-repository-url>
cd live-canvas
npm ci
npm run check
```

`npm run build` type-checks the source and writes the production bundle to `main.js`. `npm test` bundles the pure core module and runs deterministic behavior tests.

## Development loop

Run:

```bash
npm run dev
```

This watches the TypeScript source and rebuilds `main.js`. Copy or symlink `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/live-canvas/` in a test vault. Reload Obsidian after changes.

## Packaging

```bash
npm run package
```

This runs tests and a production build, then creates:

- `live-canvas-<version>.zip` — installable plugin files.
- `live-canvas-<version>-source.zip` — source snapshot.
- `live-canvas-<version>-github-repository.zip` — clean repository upload bundle.

## Architecture

- `src/main.ts` integrates with Obsidian, reads metadata, exposes settings and commands, handles events, and performs safe Canvas writes.
- `src/core.ts` contains deterministic filtering, graph construction, Canvas validation, layout, node preservation, and rename handling.
- `scripts/test.mjs` tests the core without launching Obsidian.
- `scripts/package-release.mjs` creates reproducible user-facing bundles.

The plugin writes only the configured `.canvas` file. Keep data transforms in `core.ts` when possible so they remain easy to test.

## Versioning

Use Semantic Versioning. `npm version patch`, `npm version minor`, or `npm version major` updates `package.json`, `manifest.json`, and `versions.json` through the version script. Update `CHANGELOG.md` before tagging.
