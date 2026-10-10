# User guide

This guide assumes you have never used Obsidian Canvas.

## What is Canvas?

Canvas is Obsidian's visual workspace. A Canvas is a regular file ending in `.canvas`. It can contain note cards, text cards, web links, groups, and arrows. You can zoom, pan, move cards, resize them, and open a note by double-clicking its card.

Live Canvas creates and maintains note cards automatically while leaving the Canvas editable.

## Five-minute first test

Use a test vault or back up your current vault first.

1. Create a folder named `Live Canvas Test`.
2. Inside it, create three notes:

   `Planets.md`

   ```markdown
   # Planets

   The [[Earth]] is a planet. So is [[Mars]].
   ```

   `Earth.md`

   ```markdown
   ---
   tags: [space, home]
   ---

   # Earth

   Earth has one moon.
   ```

   `Mars.md`

   ```markdown
   ---
   tags: [space]
   ---

   # Mars

   Mars has two small moons.
   ```

3. Open **Settings → Live Canvas**.
4. Set **Source filter** to **Folder**.
5. Set the source folder to `Live Canvas Test`.
6. Leave **Canvas path** as `Live Canvas.canvas`.
7. Select **Refresh and open**.
8. The Canvas should show three note cards and two arrows from `Planets`.

## Learn the Canvas controls

- Scroll or pinch to zoom.
- Drag empty space to pan.
- Drag a card to move it.
- Drag a card edge or corner to resize it.
- Double-click a note card to open that note.
- Right-click empty space to add manual content.
- Use the Canvas toolbar to add a text card, file, link, or group.

Move `Earth` to a new position, wait for Obsidian to save, edit one of the notes, and run **Live Canvas: Refresh Canvas now** from the command palette. The new position should remain unchanged.

## Choosing notes

### Folder source

Enter a vault-relative folder such as `Knowledge/History`. Notes in its subfolders are included. Enter `/` to use the entire vault.

### Tag source

Enter `history` or `#history`. A note tagged `#history/byzantium` also matches `history`.

The source filter creates the initial set of notes. Linked-neighbor settings can add related notes from elsewhere.

## Adding linked neighbors

Choose **None**, **One link away**, or **Two links away**. Then select the direction:

- **Incoming and outgoing** follows both links and backlinks.
- **Outgoing only** follows links created by selected notes.
- **Incoming only** follows notes that link to selected notes.

Source-filter matches are added first. The maximum-note limit is applied after neighbor expansion.

## Excluding notes

Add one rule per line:

```text
folder:Archive
tag:draft
property:status=archived
property:hidden
```

Exclusions are absolute. An excluded note is not reintroduced as a linked neighbor.

## Coloring categories

Add one color rule per line. The first match wins:

```text
folder:Live Canvas Test = 2
tag:home = #2AA198
tag:important = 1
```

Numbers `1` through `6` use Obsidian's native Canvas palette. A six-digit hex color such as `#2AA198` is also supported.

## Relationship labels

Enable **Label relationships** to make edges more descriptive:

- `author: "[[Ada Lovelace]]"` can create an edge labeled `author`.
- `[[Ada Lovelace|inspired by]]` can create `inspired by`.
- `![[Diagram]]` can create `embed`.

Several relationships in the same direction between the same notes are combined on one edge.

## Isolated notes

Enable **Highlight isolated notes** to identify cards with no visible incoming or outgoing edge. Category color rules take priority.

## Manual edits and ownership

You can safely move and resize generated note cards. You can also add your own text, link, file, group, and edge items. Live Canvas recognizes the items it manages by internal IDs and leaves other valid items alone.

If the configured path already contains a Canvas not created by Live Canvas, synchronization stops. Review the path and use **Adopt explicitly** only if you want Live Canvas to manage generated note cards inside that file.

## Smart relayout

Run **Live Canvas: Smart relayout managed cards** or select **Smart relayout** in settings. Confirm the dialog to arrange managed notes in deterministic connection-based layers. Manual nodes stay in place. Unlike ordinary refresh, this action intentionally replaces the saved positions of managed cards.

## Commands

- **Refresh Canvas now** synchronizes immediately.
- **Open managed Canvas** opens the configured file.
- **Smart relayout managed cards** confirms and rearranges managed note cards.

The ribbon dashboard icon also refreshes the Canvas.

## Try the included demo

Copy `examples/demo-vault/Knowledge` from the repository into a test vault. Set the source folder to `Knowledge`, enable relationship labels, add `tag:empire = 1` as a color rule, then select **Refresh and open**.
