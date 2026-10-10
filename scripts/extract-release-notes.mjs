import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const version = process.argv[2];
if (!version) throw new Error("Pass the release version as the first argument.");

const changelog = await readFile("CHANGELOG.md", "utf8");
const heading = `## [${version}]`;
const start = changelog.indexOf(heading);
if (start < 0) throw new Error(`CHANGELOG.md has no ${heading} section.`);

const contentStart = changelog.indexOf("\n", start) + 1;
const nextHeading = changelog.indexOf("\n## [", contentStart);
const notes = changelog.slice(contentStart, nextHeading < 0 ? undefined : nextHeading).trim();
if (!notes) throw new Error(`The ${heading} section has no release notes.`);

await writeFile(".release-notes.md", `${notes}\n`);
console.log(`Prepared release notes for ${version}.`);
