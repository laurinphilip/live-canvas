# Releasing

## One-time GitHub setup

1. Create an empty GitHub repository named `live-canvas`.
2. Upload the contents of `live-canvas-<version>-github-repository.zip` or push the repository with Git.
3. Use `main` as the default branch.
4. Enable **Issues**, **Discussions**, and **Private vulnerability reporting** in repository settings.
5. Add a short description, the topic tags `obsidian`, `obsidian-plugin`, `canvas`, `knowledge-graph`, and the MIT license.

Do not add the generated `main.js` to normal commits. The release workflow builds it from source.

## Create a release

1. Update `CHANGELOG.md`.
2. Run `npm ci` and `npm run package` locally.
3. Bump the version, for example `npm version patch`.
4. Push the commit and tag: `git push && git push --tags`.
5. Use a tag exactly equal to the manifest version, such as `1.3.0`. Do not add a `v` prefix.
6. The GitHub release workflow creates a draft release with `main.js`, `manifest.json`, `styles.css`, and an easy-install ZIP.
7. Review the draft, add the matching changelog notes, test the attached files in a clean vault, and publish it.

## Submit to the Obsidian community directory

After the first public GitHub release exists:

1. Read Obsidian's current plugin submission requirements.
2. Fork `obsidianmd/obsidian-releases`.
3. Add one entry to `community-plugins.json` with the plugin ID, name, author, description, and GitHub repository.
4. Open a pull request and complete every checklist item.

The plugin ID must remain `live-canvas`, and every release must attach `main.js`, `manifest.json`, and `styles.css`.
