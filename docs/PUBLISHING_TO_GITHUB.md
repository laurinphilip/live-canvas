# Publish the repository on GitHub

This guide starts with the included `live-canvas-1.3.1-github-repository.zip` and ends with a public project page and installable release.

## 1. Create the repository

1. Sign in to GitHub and select **New repository**.
2. Set **Repository name** to `live-canvas`.
3. Add the description: `Keep a native Obsidian Canvas synchronized with filtered notes and their relationships — locally and non-destructively.`
4. Choose **Public** when the project is ready for everyone, or **Private** while testing.
5. Do not add a README, `.gitignore`, or license; they are already included.
6. Select **Create repository**.

## 2. Upload the prepared files

The safest beginner-friendly method is GitHub Desktop because it includes hidden folders such as `.github`.

1. Install and open GitHub Desktop.
2. Extract `live-canvas-1.3.1-github-repository.zip`.
3. In GitHub Desktop, select **File → Add local repository → choose…** and choose the extracted `live-canvas` folder.
4. If GitHub Desktop says it is not a repository, select **create a repository** and keep the existing folder and name.
5. Enter `Prepare Live Canvas 1.3.1` as the summary and commit all files to `main`.
6. Select **Publish repository**. Choose the same visibility as the empty GitHub repository. If GitHub Desktop creates a duplicate instead of connecting to the empty repository, use **Repository → Repository settings → Remote** and set the URL shown on the empty repository page.
7. Select **Push origin**.

Advanced Git users can instead initialize the extracted folder, add the GitHub remote, commit, and push to `main`.

## 3. Configure the GitHub page

On the repository page:

1. Select the gear icon beside **About**.
2. Add the website later if you create one.
3. Add topics: `obsidian`, `obsidian-plugin`, `canvas`, `knowledge-graph`, `visual-notes`, `offline-first`.
4. Enable **Releases**, **Issues**, and **Discussions**.
5. Open **Settings → Security → Code security and analysis** and enable **Private vulnerability reporting**.
6. Open **Settings → Actions → General** and keep Actions enabled. The included workflows need permission to create releases; under **Workflow permissions**, allow read and write permissions if GitHub asks for it.

The repository home page automatically uses `README.md`, including the banner, feature overview, installation section, documentation links, and license.

## 4. Create version 1.3.1

The release automation starts when the exact version tag is pushed.

Using a terminal in the repository folder:

```bash
git tag 1.3.1
git push origin 1.3.1
```

Do not prefix the tag with `v`. Open the **Actions** tab and wait for the **Release** workflow. It validates the plugin, runs Obsidian's community scanner rules, builds the plugin, attests the files, and creates a draft GitHub release.

Open **Releases**, review the `1.3.1` draft and its automatically added changelog notes, test the three attached plugin files in a clean vault, then select **Publish release** as a normal release.

## 5. Verify the public experience

In a private browser window:

1. Open the repository page and check the banner and documentation links.
2. Open the `1.3.1` release.
3. Confirm the individual assets `main.js`, `manifest.json`, and `styles.css` are present.
4. Confirm there are no unsupported extra release files.
5. Follow the macOS installation guide exactly in a test vault.

## 6. Submit to Obsidian later

Once the public release has been tested by several people, follow the [release guide](RELEASING.md) to submit the plugin to Obsidian's community directory. Keep the repository name, plugin ID, release tag, and manifest version consistent.
