import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "live-canvas-tests-"));
const bundlePath = path.join(temporaryDirectory, "core.mjs");

try {
  await esbuild.build({
    entryPoints: ["src/core.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    outfile: bundlePath
  });

  const core = await import(pathToFileURL(bundlePath).href);
  const tests = [];
  const test = (name, run) => tests.push({ name, run });

  test("filters a folder including descendants but not similarly named folders", () => {
    assert.equal(core.isPathInFolder("Notes/Alpha.md", "Notes"), true);
    assert.equal(core.isPathInFolder("Notes/Sub/Beta.md", "Notes/"), true);
    assert.equal(core.isPathInFolder("Notebook/Gamma.md", "Notes"), false);
    assert.equal(core.isPathInFolder("Anywhere.md", "/"), true);
  });

  test("matches tags and their descendants", () => {
    assert.equal(core.tagMatches(["#history/byzantium"], "#history"), true);
    assert.equal(core.tagMatches(["#historical"], "history"), false);
  });

  test("parses and applies folder, tag, and property exclusion rules", () => {
    const rules = core.parseExclusionRules(
      "folder:Archive\ntag:draft\nproperty:status=archived\nproperty:hidden"
    );
    assert.equal(rules.length, 4);
    assert.equal(core.matchesExclusionRules("Archive/Old.md", [], {}, rules), true);
    assert.equal(core.matchesExclusionRules("Notes/Draft.md", ["#draft/rough"], {}, rules), true);
    assert.equal(
      core.matchesExclusionRules("Notes/Done.md", [], { status: "archived" }, rules),
      true
    );
    assert.equal(core.matchesExclusionRules("Notes/Secret.md", [], { hidden: true }, rules), true);
    assert.equal(core.matchesExclusionRules("Notes/Keep.md", ["#published"], {}, rules), false);
  });

  test("builds file nodes and de-duplicates links", () => {
    const result = core.buildCanvasDocument({
      existing: core.createEmptyCanvas(),
      notePaths: ["Notes/B.md", "Notes/A.md"],
      links: [
        { from: "Notes/A.md", to: "Notes/B.md" },
        { from: "Notes/A.md", to: "Notes/B.md" }
      ]
    });
    assert.equal(result.generatedNodeCount, 2);
    assert.equal(result.generatedEdgeCount, 1);
    assert.deepEqual(
      result.document.nodes.map((node) => node.file),
      ["Notes/A.md", "Notes/B.md"]
    );
  });

  test("combines relationship labels on one directed edge", () => {
    const result = core.buildCanvasDocument({
      existing: core.createEmptyCanvas(),
      notePaths: ["People/Ada.md", "Books/Notes.md"],
      links: [
        { from: "Books/Notes.md", to: "People/Ada.md", label: "author" },
        { from: "Books/Notes.md", to: "People/Ada.md", label: "inspired by" },
        { from: "Books/Notes.md", to: "People/Ada.md", label: "author" }
      ]
    });
    assert.equal(result.generatedEdgeCount, 1);
    assert.equal(result.document.edges[0].label, "author · inspired by");
  });

  test("expands seed notes by incoming and outgoing neighbor levels", () => {
    const adjacency = new Map([
      ["A.md", new Set(["B.md"])],
      ["B.md", new Set(["A.md", "C.md"])],
      ["C.md", new Set(["B.md", "D.md"])],
      ["D.md", new Set(["C.md"])]
    ]);
    assert.deepEqual(core.expandPathsByNeighbors(["A.md"], adjacency, 0), ["A.md"]);
    assert.deepEqual(core.expandPathsByNeighbors(["A.md"], adjacency, 1), ["A.md", "B.md"]);
    assert.deepEqual(core.expandPathsByNeighbors(["A.md"], adjacency, 2), [
      "A.md",
      "B.md",
      "C.md"
    ]);
  });

  test("applies configured category colors to new and existing nodes", () => {
    const first = core.buildCanvasDocument({
      existing: core.createEmptyCanvas(),
      notePaths: ["History/Byzantium.md"],
      links: [],
      noteColors: new Map([["History/Byzantium.md", "1"]])
    });
    assert.equal(first.document.nodes[0].color, "1");

    first.document.nodes[0].color = "6";
    const second = core.buildCanvasDocument({
      existing: first.document,
      notePaths: ["History/Byzantium.md"],
      links: [],
      noteColors: new Map([["History/Byzantium.md", "#4A90E2"]])
    });
    assert.equal(second.document.nodes[0].color, "#4A90E2");
  });

  test("can clear a previously managed highlight color", () => {
    const first = core.buildCanvasDocument({
      existing: core.createEmptyCanvas(),
      notePaths: ["Orphan.md"],
      links: [],
      noteColors: new Map([["Orphan.md", "1"]])
    });
    assert.equal(first.document.nodes[0].color, "1");
    const second = core.buildCanvasDocument({
      existing: first.document,
      notePaths: ["Orphan.md"],
      links: [],
      clearNoteColors: new Set(["Orphan.md"])
    });
    assert.equal("color" in second.document.nodes[0], false);
  });

  test("preserves moved node geometry and manual canvas content", () => {
    const first = core.buildCanvasDocument({
      existing: core.createEmptyCanvas(),
      notePaths: ["Notes/A.md", "Notes/B.md"],
      links: [{ from: "Notes/A.md", to: "Notes/B.md" }]
    });
    const moved = {
      ...first.document,
      nodes: [
        {
          id: "manual-text",
          type: "text",
          text: "Keep me",
          x: -500,
          y: -500,
          width: 200,
          height: 100
        },
        ...first.document.nodes.map((node, index) =>
          index === 0 ? { ...node, x: 1234, y: -777, width: 444, height: 333 } : node
        )
      ]
    };
    const second = core.buildCanvasDocument({
      existing: moved,
      notePaths: ["Notes/A.md", "Notes/B.md"],
      links: [{ from: "Notes/A.md", to: "Notes/B.md" }]
    });
    const preserved = second.document.nodes.find((node) => node.file === "Notes/A.md");
    assert.deepEqual(
      { x: preserved.x, y: preserved.y, width: preserved.width, height: preserved.height },
      { x: 1234, y: -777, width: 444, height: 333 }
    );
    assert.equal(second.document.nodes.some((node) => node.id === "manual-text"), true);
  });

  test("explicit smart layout resets generated positions but not manual nodes", () => {
    const first = core.buildCanvasDocument({
      existing: core.createEmptyCanvas(),
      notePaths: ["A.md", "B.md", "C.md"],
      links: [
        { from: "A.md", to: "B.md" },
        { from: "B.md", to: "C.md" }
      ]
    });
    first.document.nodes.forEach((node) => {
      node.x = 9000;
      node.y = 9000;
    });
    first.document.nodes.unshift({
      id: "manual",
      type: "text",
      text: "Keep me",
      x: -333,
      y: -444,
      width: 200,
      height: 100
    });

    const second = core.buildCanvasDocument({
      existing: first.document,
      notePaths: ["A.md", "B.md", "C.md"],
      links: [
        { from: "A.md", to: "B.md" },
        { from: "B.md", to: "C.md" }
      ],
      forceLayout: true
    });
    const manual = second.document.nodes.find((node) => node.id === "manual");
    assert.deepEqual({ x: manual.x, y: manual.y }, { x: -333, y: -444 });
    assert.equal(
      second.document.nodes.filter((node) => node.id.startsWith("lc-node-")).some((node) => node.x !== 9000),
      true
    );
  });

  test("removes stale generated items but retains valid manual edges", () => {
    const first = core.buildCanvasDocument({
      existing: core.createEmptyCanvas(),
      notePaths: ["Notes/A.md", "Notes/B.md"],
      links: [{ from: "Notes/A.md", to: "Notes/B.md" }]
    });
    const a = first.document.nodes.find((node) => node.file === "Notes/A.md");
    const existing = {
      nodes: [
        ...first.document.nodes,
        { id: "manual", type: "text", text: "Note", x: 0, y: 900, width: 200, height: 100 }
      ],
      edges: [
        ...first.document.edges,
        { id: "manual-edge", fromNode: "manual", toNode: a.id }
      ]
    };
    const second = core.buildCanvasDocument({
      existing,
      notePaths: ["Notes/A.md"],
      links: []
    });
    assert.equal(second.generatedNodeCount, 1);
    assert.equal(second.generatedEdgeCount, 0);
    assert.equal(second.document.edges.some((edge) => edge.id === "manual-edge"), true);
  });

  test("carries a moved node position through a note rename", () => {
    const built = core.buildCanvasDocument({
      existing: core.createEmptyCanvas(),
      notePaths: ["Notes/Old.md"],
      links: []
    });
    built.document.nodes[0].x = 808;
    built.document.nodes[0].y = 606;
    const renamed = core.applyPathRenames(
      built.document,
      new Map([["Notes/Old.md", "Notes/New.md"]])
    );
    const rebuilt = core.buildCanvasDocument({
      existing: renamed,
      notePaths: ["Notes/New.md"],
      links: []
    });
    assert.equal(rebuilt.document.nodes[0].x, 808);
    assert.equal(rebuilt.document.nodes[0].y, 606);
    assert.equal(rebuilt.document.nodes[0].file, "Notes/New.md");
  });

  test("rejects malformed canvas data", () => {
    assert.throws(() => core.parseCanvasDocument("not-json"), /valid JSON/);
    assert.deepEqual(core.parseCanvasDocument("{}"), { nodes: [], edges: [] });
    assert.throws(() => core.parseCanvasDocument('{"nodes":{}}'), /JSON Canvas structure/);
  });

  let failures = 0;
  for (const { name, run } of tests) {
    try {
      await run();
      console.log(`✓ ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`✗ ${name}`);
      console.error(error);
    }
  }

  if (failures > 0) process.exitCode = 1;
  else console.log(`\n${tests.length} tests passed.`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
