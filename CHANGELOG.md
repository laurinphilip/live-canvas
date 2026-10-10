# Changelog

All notable changes to Live Canvas are documented here. The project follows Semantic Versioning.

## [1.3.1] - 2026-10-10

### Changed

- Rebuilt the settings screen with Obsidian's searchable declarative settings API.
- Updated headings and destructive actions to current Obsidian UI APIs.
- Aligned the release manifest author with the repository manifest.
- Added release-asset provenance attestations and automatic release notes.

### Fixed

- Removed an unnecessary TypeScript assertion reported by the community scanner.

## [1.3.0] - 2026-10-10

### Added

- Exclusion rules for folders, tags, properties, and property values.
- Incoming, outgoing, or bidirectional linked-neighbor expansion up to two hops.
- Relationship labels for properties, Wikilink aliases, and embeds.
- Folder and tag color rules using native Canvas colors or hex values.
- Optional highlighting for isolated notes.
- Confirmed, connection-based smart relayout for managed cards.
- GitHub-ready documentation, contribution templates, CI, releases, and demo vault.

### Safety

- Existing Canvas files require explicit adoption.
- Manual Canvas nodes and valid manual edges are preserved.
- Normal refresh preserves the saved position and size of managed cards.
- Markdown notes are never modified or deleted.

## [1.2.0] - 2026-10-10

### Added

- Category color rules and linked-neighbor expansion.
- Better preservation of renamed-note positions while Obsidian is running.

## [1.1.0] - 2026-10-10

### Added

- Tag-based filtering, debounced live refresh, and manual refresh commands.

## [1.0.0] - 2026-10-10

### Added

- Initial stable MVP with folder filtering, native file cards, internal-link edges, and position preservation.
