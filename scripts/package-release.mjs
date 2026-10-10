import { copyFile, cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const releaseDirectory = path.join(root, "release");
const installDirectory = path.join(root, manifest.id);
const stagingDirectory = path.join(root, ".package-staging", manifest.id);
const sourceStagingDirectory = path.join(root, ".package-staging", `${manifest.id}-source`);
const repositoryStagingDirectory = path.join(root, ".repository-staging", manifest.id);
const zipPath = path.join(root, `${manifest.id}-${manifest.version}.zip`);
const sourceZipPath = path.join(root, `${manifest.id}-${manifest.version}-source.zip`);
const repositoryZipPath = path.join(
  root,
  `${manifest.id}-${manifest.version}-github-repository.zip`
);

await rm(path.dirname(stagingDirectory), { recursive: true, force: true });
await rm(path.dirname(repositoryStagingDirectory), { recursive: true, force: true });
await mkdir(stagingDirectory, { recursive: true });
await mkdir(releaseDirectory, { recursive: true });
await mkdir(installDirectory, { recursive: true });

for (const file of ["manifest.json", "styles.css"]) {
  await copyFile(path.join(root, file), path.join(releaseDirectory, file));
}
await copyFile(path.join(root, "main.js"), path.join(releaseDirectory, "main.js"));
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  await copyFile(path.join(releaseDirectory, file), path.join(stagingDirectory, file));
  await copyFile(path.join(releaseDirectory, file), path.join(installDirectory, file));
}

await rm(zipPath, { force: true });
execFileSync("zip", ["-q", "-r", zipPath, manifest.id], {
  cwd: path.dirname(stagingDirectory)
});

await mkdir(sourceStagingDirectory, { recursive: true });
for (const file of [
  ".gitignore",
  ".editorconfig",
  ".nvmrc",
  "CHANGELOG.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "SUPPORT.md",
  "esbuild.config.mjs",
  "manifest.json",
  "package-lock.json",
  "package.json",
  "styles.css",
  "tsconfig.json",
  "versions.json"
]) {
  await copyFile(path.join(root, file), path.join(sourceStagingDirectory, file));
}
for (const directory of [".github", "docs", "scripts", "src"]) {
  await cp(path.join(root, directory), path.join(sourceStagingDirectory, directory), {
    recursive: true
  });
}

await rm(sourceZipPath, { force: true });
execFileSync("zip", ["-q", "-r", sourceZipPath, `${manifest.id}-source`], {
  cwd: path.dirname(sourceStagingDirectory)
});

await cp(sourceStagingDirectory, repositoryStagingDirectory, { recursive: true });
await rm(repositoryZipPath, { force: true });
execFileSync("zip", ["-q", "-r", repositoryZipPath, manifest.id], {
  cwd: path.dirname(repositoryStagingDirectory)
});

await rm(path.dirname(stagingDirectory), { recursive: true, force: true });
await rm(path.dirname(repositoryStagingDirectory), { recursive: true, force: true });
console.log(`Created ${zipPath}`);
console.log(`Created ${sourceZipPath}`);
console.log(`Created ${repositoryZipPath}`);
