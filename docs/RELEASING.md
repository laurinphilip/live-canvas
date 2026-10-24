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
5. Use a tag exactly equal to the manifest version, such as `1.3.1`. Do not add a `v` prefix.
6. The GitHub release workflow creates a draft release with `main.js`, `manifest.json`, `styles.css`, provenance attestations, and the matching changelog notes.
7. Test the attached files in a clean vault, then publish the draft as a normal release rather than a pre-release.

## Submit to the Obsidian community directory

The first version is submitted through the Obsidian Community directory. Later versions are discovered from GitHub automatically.

1. Publish the GitHub release.
2. Open the Live Canvas management page in the Community directory.
3. Select **Check for new releases** if the new version is not detected automatically.
4. Review the automated scan results.

The plugin ID must remain `live-canvas`, the tag must exactly match `manifest.json`, and every release must attach `main.js`, `manifest.json`, and `styles.css`.
