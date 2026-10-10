# Installation

Live Canvas has no server, account, API key, or paid dependency.

## Requirements

- Obsidian 1.13.0 or newer
- A desktop or mobile vault you can back up

## Community plugin installation

1. Open **Settings → Community plugins** in Obsidian.
2. Select **Browse** and search for **Live Canvas**.
3. Select **Install**, then **Enable**.
4. Open **Settings → Live Canvas**, choose a source folder or tag, and select **Refresh and open**.

If Live Canvas is still awaiting directory approval, use the manual installation below.

## Manual macOS installation

1. Open the repository's **Releases** page and download `live-canvas-<version>.zip` from the newest release.
2. Double-click the ZIP to extract it. The extracted folder must be named `live-canvas`.
3. Quit Obsidian completely with `Command+Q`.
4. Open the vault folder in Finder. In Obsidian, **Settings → Files and links → Default location for new attachments** does not show the vault path; use **Show in system explorer** from the vault switcher when needed.
5. Press `Command+Shift+.` in Finder to show hidden files.
6. Open `.obsidian`, then `plugins`. Create the `plugins` folder if it does not exist.
7. Move the extracted `live-canvas` folder into `.obsidian/plugins/`.
8. Confirm this exact structure:

   ```text
   Your Vault/
   └── .obsidian/
       └── plugins/
           └── live-canvas/
               ├── main.js
               ├── manifest.json
               └── styles.css
   ```

9. Reopen Obsidian.
10. Go to **Settings → Community plugins**, turn on community plugins if asked, and enable **Live Canvas**.
11. Open **Settings → Live Canvas**, choose a source folder or tag, and select **Refresh and open**.

If Obsidian does not list the plugin, the most common cause is one extra nested folder such as `live-canvas/live-canvas/main.js`.

## Windows installation

1. Download and extract the release ZIP.
2. Close Obsidian.
3. In File Explorer, enable **View → Show → Hidden items**.
4. Move the extracted `live-canvas` folder to `Your Vault\.obsidian\plugins\`.
5. Reopen Obsidian and enable Live Canvas under **Settings → Community plugins**.

## Linux installation

Extract the release folder to `Your Vault/.obsidian/plugins/live-canvas/`, restart Obsidian, and enable the plugin under **Settings → Community plugins**.

## Mobile installation

Manual mobile installation depends on the operating system's file manager and sync provider. Place the same three files in `.obsidian/plugins/live-canvas/`, reload the vault, and enable the plugin. Large Canvases may be less comfortable on smaller devices.

## Updating

1. Back up the vault.
2. Download the newest release ZIP.
3. Quit Obsidian.
4. Replace `main.js`, `manifest.json`, and `styles.css` inside `.obsidian/plugins/live-canvas/`.
5. Keep `data.json`; it contains your settings.
6. Reopen Obsidian and verify the version in **Settings → Community plugins**.

## Uninstalling

Disable Live Canvas, close Obsidian, then remove `.obsidian/plugins/live-canvas/`. The generated `.canvas` file is a normal Obsidian Canvas and remains usable. Your Markdown notes are unaffected.
