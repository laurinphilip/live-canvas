# Troubleshooting

## The plugin does not appear in Obsidian

Check that `main.js`, `manifest.json`, and `styles.css` are directly inside `.obsidian/plugins/live-canvas/`. Restart Obsidian completely. On macOS, use `Command+Q`, not only the red window button.

## The Canvas is empty

- Confirm the folder path is relative to the vault and contains Markdown notes.
- For a tag source, verify the notes actually contain the tag in body text or frontmatter.
- Temporarily remove exclusion rules.
- Check that the maximum-note limit is above zero.
- Run **Live Canvas: Refresh Canvas now**.

## Some arrows are missing

- Both notes must be visible on the managed Canvas.
- The link must resolve inside Obsidian; unresolved links are ignored.
- Check neighbor depth and direction if the target is outside the source filter.
- Several links in one direction between the same notes intentionally become one edge.

## My moved cards returned to an old position

Wait briefly after moving cards so Obsidian saves the Canvas before refreshing. Do not run Smart relayout unless you want managed positions replaced. A note renamed outside a running Obsidian session cannot always be associated with its old card.

## Live Canvas refuses to overwrite the target

This is a safety feature. The configured path already contains a Canvas that Live Canvas does not own. Back it up, check the target path, then use **Adopt explicitly** only if you intend to manage that Canvas.

## Changes do not appear immediately

Live updates are debounced to combine rapid file changes. Confirm that live synchronization is enabled, then try a manual refresh. Live sync only runs while Obsidian and the plugin are active.

## A large Canvas feels slow

Lower the maximum-note limit, reduce neighbor depth, narrow the source folder/tag, or add exclusions. Obsidian must render every visible card and edge, so a focused Canvas is often more useful than a vault-wide one.

## The PDF does not show an image or website preview

PDF export creates a stable vector overview from the saved Canvas structure. Image, attachment, and website nodes are represented as labeled cards rather than embedded previews. Open the original Canvas for interactive content.

## Text is very small in the PDF

The complete Canvas is fitted onto one A4 page. Narrow the source filter or export a smaller Canvas when you need larger labels. Wait briefly after moving cards so Obsidian saves the latest layout before export.

## How to collect diagnostic information

On desktop, open Obsidian's developer tools with `Command+Option+I` on macOS or `Ctrl+Shift+I` on Windows/Linux. Open **Console**, reproduce the problem, and copy only Live Canvas-related errors. Remove private note paths or content before posting.

When filing a bug, include Live Canvas version, Obsidian version, operating system, relevant settings, and a minimal sequence of steps.
