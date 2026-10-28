# Rules reference

## Source folders

Folder paths are relative to the vault root. `Notes` matches `Notes/A.md` and `Notes/Sub/B.md`, but not `Notebook/C.md`. A trailing slash is optional. `/` selects all Markdown files in the vault.

## Source tags

The leading `#` is optional. Tag matching includes descendants: `history` matches `#history` and `#history/byzantium`, but not `#historical`.

## Exclusion rules

Rules are case-insensitive where appropriate and run after the main source filter.

| Syntax | Effect |
| --- | --- |
| `folder:Archive` | Excludes `Archive` and every descendant folder. |
| `tag:draft` | Excludes `#draft` and nested tags such as `#draft/rough`. |
| `property:hidden` | Excludes a note when the property exists, regardless of value. |
| `property:status=archived` | Excludes when the property value equals `archived`. |

Property-value rules also work when a property is a list. Empty and malformed lines are ignored.

## Color rules

The first matching rule wins.

| Syntax | Effect |
| --- | --- |
| `folder:History = 1` | Applies Obsidian native color 1. |
| `tag:people = 6` | Applies Obsidian native color 6. |
| `tag:project/active = #4A90E2` | Applies a custom six-digit hex color. |

Folder and tag matching follow the same rules as source filters. Existing manually selected card colors remain when no category rule matches, except when an obsolete isolated-note highlight is being cleared.

## Property groups

Enter one exact frontmatter key in **Group cards by property**, for example `status`, `project`, or `type`. Every visible note is wrapped in an automatic native Canvas group named with its value, such as `Status: Active`. Missing, empty, or unsupported object values are placed in `Status: Not set`.

Property lists are shown as one combined group label, for example `Area: Work · Home`. Automatic groups are recalculated on synchronization, while manually created Canvas groups are never changed.

## Link discovery

Live Canvas uses Obsidian's resolved metadata. Standard Wikilinks, Markdown links resolved to notes, embeds, and linked frontmatter properties can create directed relationships. An edge is created only when both source and target notes are visible.

Unresolved or ambiguous links are ignored. Self-links do not create edges. Duplicate links in the same direction are combined.
