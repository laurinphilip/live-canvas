export const GENERATED_NODE_PREFIX = "lc-node-";
export const GENERATED_EDGE_PREFIX = "lc-edge-";

export type CanvasSide = "top" | "right" | "bottom" | "left";

export interface CanvasNode {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  file?: string;
  [key: string]: unknown;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: CanvasSide;
  toSide?: CanvasSide;
  fromEnd?: "none" | "arrow";
  toEnd?: "none" | "arrow";
  [key: string]: unknown;
}

export interface CanvasDocument {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  [key: string]: unknown;
}

export interface NoteLink {
  from: string;
  to: string;
  label?: string;
}

export interface BuildCanvasInput {
  existing: CanvasDocument;
  notePaths: string[];
  links: NoteLink[];
  noteColors?: ReadonlyMap<string, string>;
  clearNoteColors?: ReadonlySet<string>;
  forceLayout?: boolean;
}

export interface ExclusionRule {
  type: "folder" | "tag" | "property";
  value: string;
  propertyValue?: string;
}

export interface BuildCanvasResult {
  document: CanvasDocument;
  generatedNodeCount: number;
  generatedEdgeCount: number;
}

const NODE_WIDTH = 360;
const NODE_HEIGHT = 220;
const COLUMN_GAP = 120;
const ROW_GAP = 100;
const COLLISION_PADDING = 32;

export function parseCanvasDocument(raw: string): CanvasDocument {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("The Canvas file does not contain valid JSON.");
  }

  if (!isRecord(value)) {
    throw new Error("The Canvas file does not have a valid JSON Canvas structure.");
  }

  const rawNodes = value.nodes ?? [];
  const rawEdges = value.edges ?? [];
  if (!Array.isArray(rawNodes) || !Array.isArray(rawEdges)) {
    throw new Error("The Canvas file does not have a valid JSON Canvas structure.");
  }

  const nodes = rawNodes.filter(isCanvasNode);
  const edges = rawEdges.filter(isCanvasEdge);

  if (nodes.length !== rawNodes.length || edges.length !== rawEdges.length) {
    throw new Error("The Canvas file contains invalid nodes or edges.");
  }

  return { ...value, nodes, edges };
}

export function createEmptyCanvas(): CanvasDocument {
  return { nodes: [], edges: [] };
}

export function buildCanvasDocument(input: BuildCanvasInput): BuildCanvasResult {
  const uniquePaths = [...new Set(input.notePaths)].sort(comparePaths);
  const existingGeneratedByPath = new Map<string, CanvasNode>();
  const manualNodes: CanvasNode[] = [];

  for (const node of input.existing.nodes) {
    if (isGeneratedNode(node) && typeof node.file === "string") {
      existingGeneratedByPath.set(node.file, node);
    } else {
      manualNodes.push(node);
    }
  }

  const generatedNodes: CanvasNode[] = [];
  const occupied = manualNodes.map(toRect);
  const usedIds = new Set(manualNodes.map((node) => node.id));
  const pathToId = new Map<string, string>();
  const pendingNodes: Array<{ path: string; oldNode?: CanvasNode }> = [];
  const layoutPositions = createConnectionLayout(uniquePaths, input.links);

  for (const path of uniquePaths) {
    const oldNode = existingGeneratedByPath.get(path);
    const id = makeUniqueId(GENERATED_NODE_PREFIX + stableHash(path), usedIds);
    usedIds.add(id);
    pathToId.set(path, id);

    if (oldNode && hasValidGeometry(oldNode) && !input.forceLayout) {
      const preserved: CanvasNode = {
        ...oldNode,
        id,
        type: "file",
        file: path
      };
      const configuredColor = input.noteColors?.get(path);
      if (configuredColor) preserved.color = configuredColor;
      else if (input.clearNoteColors?.has(path)) delete preserved.color;
      generatedNodes.push(preserved);
      occupied.push(toRect(preserved));
    } else {
      pendingNodes.push({ path, oldNode });
    }
  }

  for (const { path, oldNode } of pendingNodes) {
    const width = oldNode && hasValidGeometry(oldNode) ? oldNode.width : NODE_WIDTH;
    const height = oldNode && hasValidGeometry(oldNode) ? oldNode.height : NODE_HEIGHT;
    const preferred = layoutPositions.get(path) ?? { x: 0, y: 0 };
    const position = findOpenPosition(preferred, width, height, occupied);
    const node: CanvasNode = {
      ...(oldNode ?? {}),
      id: pathToId.get(path)!,
      type: "file",
      file: path,
      x: position.x,
      y: position.y,
      width,
      height
    };
    const configuredColor = input.noteColors?.get(path);
    if (configuredColor) node.color = configuredColor;
    else if (input.clearNoteColors?.has(path)) delete node.color;
    generatedNodes.push(node);
  }

  generatedNodes.sort((a, b) => comparePaths(a.file ?? "", b.file ?? ""));
  const nodeIds = new Set([...manualNodes, ...generatedNodes].map((node) => node.id));
  const manualEdges = input.existing.edges.filter((edge) => {
    return !isGeneratedEdge(edge) && nodeIds.has(edge.fromNode) && nodeIds.has(edge.toNode);
  });
  const usedEdgeIds = new Set(manualEdges.map((edge) => edge.id));
  const generatedEdges: CanvasEdge[] = [];
  const nodesById = new Map(generatedNodes.map((node) => [node.id, node]));
  const aggregatedLinks = aggregateLinks(input.links, pathToId);

  for (const link of aggregatedLinks) {
    const fromNode = pathToId.get(link.from);
    const toNode = pathToId.get(link.to);
    if (!fromNode || !toNode || fromNode === toNode) continue;

    const sides = chooseSides(nodesById.get(fromNode)!, nodesById.get(toNode)!);
    const id = makeUniqueId(
      GENERATED_EDGE_PREFIX + stableHash(`${link.from}\u0000${link.to}`),
      usedEdgeIds
    );
    usedEdgeIds.add(id);
    const edge: CanvasEdge = {
      id,
      fromNode,
      fromSide: sides.from,
      toNode,
      toSide: sides.to,
      toEnd: "arrow"
    };
    if (link.label) edge.label = link.label;
    generatedEdges.push(edge);
  }

  generatedEdges.sort((a, b) => a.id.localeCompare(b.id));

  return {
    document: {
      ...input.existing,
      nodes: [...manualNodes, ...generatedNodes],
      edges: [...manualEdges, ...generatedEdges]
    },
    generatedNodeCount: generatedNodes.length,
    generatedEdgeCount: generatedEdges.length
  };
}

export function isPathInFolder(filePath: string, folderSetting: string): boolean {
  const folder = normalizeFilterValue(folderSetting);
  if (folder === "/") return true;
  if (!folder) return false;
  return filePath.startsWith(`${folder}/`);
}

export function getQuickStartCanvasPath(
  folderPath: string,
  occupiedPaths: ReadonlySet<string>,
  managedPaths: ReadonlySet<string>
): string {
  const folder = folderPath.trim().replace(/^\/+|\/+$/g, "");
  const prefix = folder ? `${folder}/` : "";

  for (let index = 1; index < 10000; index += 1) {
    const suffix = index === 1 ? "" : ` ${index}`;
    const candidate = `${prefix}Live Canvas${suffix}.canvas`;
    if (!occupiedPaths.has(candidate) || managedPaths.has(candidate)) return candidate;
  }

  throw new Error("Too many Canvas files already exist in this folder.");
}

export function tagMatches(tags: readonly string[], tagSetting: string): boolean {
  const wanted = tagSetting.trim().replace(/^#+/, "").replace(/\/$/, "");
  if (!wanted) return false;

  return tags.some((tag) => {
    const normalized = tag.trim().replace(/^#+/, "");
    return normalized === wanted || normalized.startsWith(`${wanted}/`);
  });
}

export function parseExclusionRules(value: string): ExclusionRule[] {
  const rules: ExclusionRule[] = [];

  for (const line of value.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("# ")) continue;

    const simpleMatch = /^(folder|tag)\s*:\s*(.+)$/i.exec(trimmed);
    if (simpleMatch) {
      rules.push({
        type: simpleMatch[1].toLowerCase() as "folder" | "tag",
        value: simpleMatch[2].trim()
      });
      continue;
    }

    const propertyMatch = /^property\s*:\s*([^=]+?)(?:\s*=\s*(.+))?$/i.exec(trimmed);
    if (propertyMatch) {
      rules.push({
        type: "property",
        value: propertyMatch[1].trim(),
        propertyValue: propertyMatch[2]?.trim()
      });
    }
  }

  return rules.filter((rule) => rule.value.length > 0);
}

export function matchesExclusionRules(
  filePath: string,
  tags: readonly string[],
  frontmatter: Readonly<Record<string, unknown>> | undefined,
  rules: readonly ExclusionRule[]
): boolean {
  return rules.some((rule) => {
    if (rule.type === "folder") return isPathInFolder(filePath, rule.value);
    if (rule.type === "tag") return tagMatches(tags, rule.value);
    if (!frontmatter || !(rule.value in frontmatter)) return false;
    if (rule.propertyValue === undefined) return true;
    return propertyValueMatches(frontmatter[rule.value], rule.propertyValue);
  });
}

export function expandPathsByNeighbors(
  seedPaths: readonly string[],
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  depth: number
): string[] {
  const seeds = [...new Set(seedPaths)].sort(comparePaths);
  const selected = new Set(seeds);
  let frontier = seeds;
  const normalizedDepth = Math.max(0, Math.floor(depth));

  for (let level = 0; level < normalizedDepth && frontier.length > 0; level += 1) {
    const next = new Set<string>();
    for (const path of frontier) {
      const neighbors = [...(adjacency.get(path) ?? [])].sort(comparePaths);
      for (const neighbor of neighbors) {
        if (!selected.has(neighbor)) next.add(neighbor);
      }
    }
    frontier = [...next].sort(comparePaths);
    for (const path of frontier) selected.add(path);
  }

  return [...seeds, ...[...selected].filter((path) => !seeds.includes(path))];
}

export function applyPathRenames(
  document: CanvasDocument,
  renames: ReadonlyMap<string, string>
): CanvasDocument {
  if (renames.size === 0) return document;

  return {
    ...document,
    nodes: document.nodes.map((node) => {
      if (!isGeneratedNode(node) || typeof node.file !== "string") return node;
      const renamedPath = renames.get(node.file);
      return renamedPath ? { ...node, file: renamedPath } : node;
    })
  };
}

function normalizeFilterValue(value: string): string {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized === "/") return normalized;
  return normalized.replace(/^\/+|\/+$/g, "");
}

function propertyValueMatches(value: unknown, expected: string): boolean {
  if (Array.isArray(value)) return value.some((item) => propertyValueMatches(item, expected));
  if (value === null || value === undefined || typeof value === "object") return false;
  return String(value).trim().toLowerCase() === expected.trim().toLowerCase();
}

function aggregateLinks(
  links: readonly NoteLink[],
  pathToId: ReadonlyMap<string, string>
): NoteLink[] {
  const aggregated = new Map<string, { from: string; to: string; labels: Set<string> }>();

  for (const link of links) {
    if (!pathToId.has(link.from) || !pathToId.has(link.to) || link.from === link.to) continue;
    const key = `${link.from}\u0000${link.to}`;
    const current = aggregated.get(key) ?? {
      from: link.from,
      to: link.to,
      labels: new Set<string>()
    };
    const label = link.label?.trim();
    if (label) current.labels.add(label);
    aggregated.set(key, current);
  }

  return [...aggregated.values()]
    .sort((first, second) => {
      const firstKey = `${first.from}\u0000${first.to}`;
      const secondKey = `${second.from}\u0000${second.to}`;
      return comparePaths(firstKey, secondKey);
    })
    .map((link) => ({
      from: link.from,
      to: link.to,
      ...(link.labels.size > 0 ? { label: [...link.labels].sort(comparePaths).join(" · ") } : {})
    }));
}

function createConnectionLayout(
  paths: readonly string[],
  links: readonly NoteLink[]
): Map<string, { x: number; y: number }> {
  const pathSet = new Set(paths);
  const adjacency = new Map<string, Set<string>>();
  for (const path of paths) adjacency.set(path, new Set());
  for (const link of links) {
    if (!pathSet.has(link.from) || !pathSet.has(link.to) || link.from === link.to) continue;
    adjacency.get(link.from)!.add(link.to);
    adjacency.get(link.to)!.add(link.from);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const unvisited = new Set(paths);
  let componentTop = 0;

  while (unvisited.size > 0) {
    const componentSeed = [...unvisited].sort((first, second) => {
      const degreeDifference = adjacency.get(second)!.size - adjacency.get(first)!.size;
      return degreeDifference || comparePaths(first, second);
    })[0];
    const layers: string[][] = [];
    const queued = new Set([componentSeed]);
    let frontier = [componentSeed];

    while (frontier.length > 0) {
      const layer = [...frontier].sort((first, second) => {
        const degreeDifference = adjacency.get(second)!.size - adjacency.get(first)!.size;
        return degreeDifference || comparePaths(first, second);
      });
      layers.push(layer);
      const next = new Set<string>();
      for (const path of layer) {
        unvisited.delete(path);
        for (const neighbor of adjacency.get(path) ?? []) {
          if (!queued.has(neighbor)) {
            queued.add(neighbor);
            next.add(neighbor);
          }
        }
      }
      frontier = [...next];
    }

    const largestLayer = Math.max(...layers.map((layer) => layer.length));
    for (let column = 0; column < layers.length; column += 1) {
      const layer = layers[column];
      const verticalOffset = ((largestLayer - layer.length) * (NODE_HEIGHT + ROW_GAP)) / 2;
      for (let row = 0; row < layer.length; row += 1) {
        positions.set(layer[row], {
          x: column * (NODE_WIDTH + COLUMN_GAP),
          y: componentTop + verticalOffset + row * (NODE_HEIGHT + ROW_GAP)
        });
      }
    }
    componentTop += largestLayer * (NODE_HEIGHT + ROW_GAP) + ROW_GAP * 2;
  }

  return positions;
}

function findOpenPosition(
  preferred: { x: number; y: number },
  width: number,
  height: number,
  occupied: Array<{ x: number; y: number; width: number; height: number }>
): { x: number; y: number } {
  let attempt = 0;
  while (true) {
    const candidate = {
      x: preferred.x,
      y: preferred.y + attempt * (height + ROW_GAP)
    };
    const rectangle = { ...candidate, width, height };
    if (!occupied.some((other) => rectanglesOverlap(rectangle, other, COLLISION_PADDING))) {
      occupied.push(rectangle);
      return candidate;
    }
    attempt += 1;
  }
}

function isGeneratedNode(node: CanvasNode): boolean {
  return node.id.startsWith(GENERATED_NODE_PREFIX);
}

function isGeneratedEdge(edge: CanvasEdge): boolean {
  return edge.id.startsWith(GENERATED_EDGE_PREFIX);
}

function chooseSides(from: CanvasNode, to: CanvasNode): { from: CanvasSide; to: CanvasSide } {
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { from: "right", to: "left" }
      : { from: "left", to: "right" };
  }

  return dy >= 0
    ? { from: "bottom", to: "top" }
    : { from: "top", to: "bottom" };
}

function stableHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b);
  }

  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

function makeUniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function hasValidGeometry(node: CanvasNode): boolean {
  return (
    Number.isFinite(node.x) &&
    Number.isFinite(node.y) &&
    Number.isFinite(node.width) &&
    Number.isFinite(node.height) &&
    node.width > 0 &&
    node.height > 0
  );
}

function toRect(node: CanvasNode): { x: number; y: number; width: number; height: number } {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

function rectanglesOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
  padding: number
): boolean {
  return !(
    first.x + first.width + padding <= second.x ||
    second.x + second.width + padding <= first.x ||
    first.y + first.height + padding <= second.y ||
    second.y + second.height + padding <= first.y
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCanvasNode(value: unknown): value is CanvasNode {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.width === "number" &&
    typeof value.height === "number"
  );
}

function isCanvasEdge(value: unknown): value is CanvasEdge {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.fromNode === "string" &&
    typeof value.toNode === "string"
  );
}
