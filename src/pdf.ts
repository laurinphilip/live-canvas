import { CanvasDocument, CanvasEdge, CanvasNode, CanvasSide } from "./core";

interface Point {
  x: number;
  y: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface PdfTransform {
  scale: number;
  mapPoint(point: Point): Point;
  mapNode(node: CanvasNode): { x: number; y: number; width: number; height: number };
}

interface NodeColors {
  fill: string;
  stroke: string;
  text: string;
}

const A4_PORTRAIT = { width: 595.28, height: 841.89 };
const A4_LANDSCAPE = { width: 841.89, height: 595.28 };
const PAGE_MARGIN = 32;
const HEADER_HEIGHT = 36;
const CANVAS_PADDING = 32;

const NATIVE_COLORS: Record<string, NodeColors> = {
  "1": { fill: "#FEE2E2", stroke: "#DC2626", text: "#7F1D1D" },
  "2": { fill: "#FFEDD5", stroke: "#EA580C", text: "#7C2D12" },
  "3": { fill: "#FEF9C3", stroke: "#CA8A04", text: "#713F12" },
  "4": { fill: "#DCFCE7", stroke: "#16A34A", text: "#14532D" },
  "5": { fill: "#CFFAFE", stroke: "#0891B2", text: "#164E63" },
  "6": { fill: "#F3E8FF", stroke: "#9333EA", text: "#581C87" }
};

/** Creates a single-page, print-friendly PDF overview of a JSON Canvas document. */
export function createCanvasPdf(document: CanvasDocument, title: string): ArrayBuffer {
  const nodes = document.nodes.filter(hasRenderableGeometry);
  const bounds = getCanvasBounds(nodes);
  const page = bounds.maxX - bounds.minX >= bounds.maxY - bounds.minY
    ? A4_LANDSCAPE
    : A4_PORTRAIT;
  const transform = createTransform(bounds, page.width, page.height);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const commands: string[] = [];

  commands.push("1 1 1 rg", `0 0 ${pdfNumber(page.width)} ${pdfNumber(page.height)} re f`);
  commands.push(...drawHeader(title, page.width, page.height));

  for (const node of nodes.filter((candidate) => candidate.type === "group")) {
    commands.push(...drawNode(node, transform, true));
  }

  for (const edge of document.edges) {
    const from = nodeById.get(edge.fromNode);
    const to = nodeById.get(edge.toNode);
    if (!from || !to) continue;
    commands.push(...drawEdge(edge, from, to, transform));
  }

  for (const node of nodes.filter((candidate) => candidate.type !== "group")) {
    commands.push(...drawNode(node, transform, false));
  }

  if (nodes.length === 0) {
    commands.push(
      "0.28 0.33 0.4 rg",
      "BT /F1 12 Tf",
      `${pdfNumber(PAGE_MARGIN)} ${pdfNumber(page.height - PAGE_MARGIN - HEADER_HEIGHT - 30)} Td`,
      `(${escapePdfText("This Canvas is empty.")}) Tj ET`
    );
  }

  return buildPdf(commands.join("\n"), page.width, page.height, title);
}

/** Returns a non-existing PDF path next to the Canvas without overwriting earlier exports. */
export function getAvailablePdfPath(
  canvasPath: string,
  existingPaths: ReadonlySet<string>
): string {
  const basePath = canvasPath.replace(/\.canvas$/i, "");
  const first = `${basePath}.pdf`;
  if (!existingPaths.has(first)) return first;

  for (let index = 2; index < 10000; index += 1) {
    const candidate = `${basePath} ${index}.pdf`;
    if (!existingPaths.has(candidate)) return candidate;
  }

  throw new Error("Too many PDF exports already exist next to this Canvas.");
}

function drawHeader(title: string, pageWidth: number, pageHeight: number): string[] {
  const safeTitle = truncateText(pdfSafeText(title.trim() || "Live Canvas"), 90);
  return [
    "0.12 0.15 0.2 rg",
    "BT /F2 15 Tf",
    `${pdfNumber(PAGE_MARGIN)} ${pdfNumber(pageHeight - PAGE_MARGIN + 2)} Td`,
    `(${escapePdfText(safeTitle)}) Tj ET`,
    "0.75 0.78 0.82 RG 0.7 w",
    `${pdfNumber(PAGE_MARGIN)} ${pdfNumber(pageHeight - PAGE_MARGIN - 9)} m ` +
      `${pdfNumber(pageWidth - PAGE_MARGIN)} ${pdfNumber(pageHeight - PAGE_MARGIN - 9)} l S`
  ];
}

function drawNode(node: CanvasNode, transform: PdfTransform, group: boolean): string[] {
  const rect = transform.mapNode(node);
  const colors = getNodeColors(node);
  const commands: string[] = [
    `${pdfColor(colors.fill)} rg`,
    `${pdfColor(colors.stroke)} RG`,
    `${group ? "0.8" : "1"} w`
  ];

  if (group) commands.push("[5 4] 0 d");
  commands.push(
    `${pdfNumber(rect.x)} ${pdfNumber(rect.y)} ${pdfNumber(rect.width)} ${pdfNumber(rect.height)} re B`
  );
  if (group) commands.push("[] 0 d");

  const minimumDimension = Math.min(rect.width, rect.height);
  const fontSize = clamp(4.5, 12 * transform.scale, group ? 11 : 12);
  if (minimumDimension < fontSize * 1.8) return commands;

  const padding = clamp(3, 10 * transform.scale, 10);
  const maxWidth = Math.max(1, rect.width - padding * 2);
  const maxLines = Math.max(1, Math.floor((rect.height - padding * 2) / (fontSize * 1.25)));
  const lines = wrapText(getNodeLabel(node), maxWidth, fontSize, maxLines);
  if (lines.length === 0) return commands;

  commands.push(`${pdfColor(colors.text)} rg`, `BT /${group ? "F2" : "F1"} ${pdfNumber(fontSize)} Tf`);
  const startY = rect.y + rect.height - padding - fontSize;
  lines.forEach((line, index) => {
    const y = startY - index * fontSize * 1.25;
    commands.push(
      `1 0 0 1 ${pdfNumber(rect.x + padding)} ${pdfNumber(y)} Tm ` +
        `(${escapePdfText(line)}) Tj`
    );
  });
  commands.push("ET");
  return commands;
}

function drawEdge(
  edge: CanvasEdge,
  fromNode: CanvasNode,
  toNode: CanvasNode,
  transform: PdfTransform
): string[] {
  const fromCanvas = getEdgePoint(fromNode, edge.fromSide, toNode);
  const toCanvas = getEdgePoint(toNode, edge.toSide, fromNode);
  const from = transform.mapPoint(fromCanvas);
  const to = transform.mapPoint(toCanvas);
  const commands = [
    "0.39 0.45 0.55 RG",
    `${pdfNumber(clamp(0.45, 1.2 * transform.scale, 1.2))} w`,
    `${pdfNumber(from.x)} ${pdfNumber(from.y)} m ${pdfNumber(to.x)} ${pdfNumber(to.y)} l S`
  ];

  if (edge.toEnd === "arrow") commands.push(...drawArrow(to, from));
  if (edge.fromEnd === "arrow") commands.push(...drawArrow(from, to));

  const label = typeof edge.label === "string" ? pdfSafeText(edge.label) : "";
  if (label) {
    const fontSize = clamp(4, 7.5 * transform.scale, 7.5);
    const text = truncateText(label, 48);
    const width = text.length * fontSize * 0.52 + 6;
    const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    commands.push(
      "1 1 1 rg",
      `${pdfNumber(midpoint.x - width / 2)} ${pdfNumber(midpoint.y - fontSize * 0.45)} ` +
        `${pdfNumber(width)} ${pdfNumber(fontSize * 1.35)} re f`,
      "0.28 0.33 0.4 rg",
      `BT /F1 ${pdfNumber(fontSize)} Tf`,
      `1 0 0 1 ${pdfNumber(midpoint.x - width / 2 + 3)} ${pdfNumber(midpoint.y)} Tm ` +
        `(${escapePdfText(text)}) Tj ET`
    );
  }

  return commands;
}

function drawArrow(tip: Point, source: Point): string[] {
  const angle = Math.atan2(tip.y - source.y, tip.x - source.x);
  const size = 6;
  const first = {
    x: tip.x - size * Math.cos(angle - Math.PI / 6),
    y: tip.y - size * Math.sin(angle - Math.PI / 6)
  };
  const second = {
    x: tip.x - size * Math.cos(angle + Math.PI / 6),
    y: tip.y - size * Math.sin(angle + Math.PI / 6)
  };
  return [
    `${pdfNumber(first.x)} ${pdfNumber(first.y)} m ${pdfNumber(tip.x)} ${pdfNumber(tip.y)} l ` +
      `${pdfNumber(second.x)} ${pdfNumber(second.y)} l S`
  ];
}

function getCanvasBounds(nodes: CanvasNode[]): Bounds {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };

  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));
  return {
    minX: minX - CANVAS_PADDING,
    minY: minY - CANVAS_PADDING,
    maxX: maxX + CANVAS_PADDING,
    maxY: maxY + CANVAS_PADDING
  };
}

function createTransform(bounds: Bounds, pageWidth: number, pageHeight: number): PdfTransform {
  const availableWidth = pageWidth - PAGE_MARGIN * 2;
  const availableHeight = pageHeight - PAGE_MARGIN * 2 - HEADER_HEIGHT;
  const canvasWidth = Math.max(1, bounds.maxX - bounds.minX);
  const canvasHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight);
  const drawnWidth = canvasWidth * scale;
  const drawnHeight = canvasHeight * scale;
  const offsetX = PAGE_MARGIN + (availableWidth - drawnWidth) / 2;
  const offsetY = PAGE_MARGIN + (availableHeight - drawnHeight) / 2;

  return {
    scale,
    mapPoint(point) {
      return {
        x: offsetX + (point.x - bounds.minX) * scale,
        y: offsetY + (bounds.maxY - point.y) * scale
      };
    },
    mapNode(node) {
      return {
        x: offsetX + (node.x - bounds.minX) * scale,
        y: offsetY + (bounds.maxY - node.y - node.height) * scale,
        width: Math.max(0.1, node.width * scale),
        height: Math.max(0.1, node.height * scale)
      };
    }
  };
}

function getEdgePoint(node: CanvasNode, side: CanvasSide | undefined, other: CanvasNode): Point {
  const center = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  const chosenSide = side ?? inferSide(center, {
    x: other.x + other.width / 2,
    y: other.y + other.height / 2
  });

  switch (chosenSide) {
    case "top":
      return { x: center.x, y: node.y };
    case "bottom":
      return { x: center.x, y: node.y + node.height };
    case "left":
      return { x: node.x, y: center.y };
    case "right":
      return { x: node.x + node.width, y: center.y };
  }
}

function inferSide(from: Point, to: Point): CanvasSide {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  if (Math.abs(deltaX) >= Math.abs(deltaY)) return deltaX >= 0 ? "right" : "left";
  return deltaY >= 0 ? "bottom" : "top";
}

function getNodeLabel(node: CanvasNode): string {
  if (typeof node.label === "string" && node.label.trim()) return pdfSafeText(node.label);
  if (node.type === "file" && typeof node.file === "string") return pdfSafeText(node.file);
  if (node.type === "text" && typeof node.text === "string") return pdfSafeText(stripMarkdown(node.text));
  if (node.type === "link" && typeof node.url === "string") return pdfSafeText(node.url);
  if (typeof node.file === "string") return pdfSafeText(node.file);
  return pdfSafeText(node.type || "Canvas item");
}

function stripMarkdown(value: string): string {
  return value
    .replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, "$2$1")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, "$2$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[#>-]+\s*/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getNodeColors(node: CanvasNode): NodeColors {
  const color = typeof node.color === "string" ? node.color : "";
  if (color in NATIVE_COLORS) return NATIVE_COLORS[color];
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return {
      fill: color,
      stroke: darkenHex(color, 0.28),
      text: getContrastColor(color)
    };
  }
  if (node.type === "group") {
    return { fill: "#F8FAFC", stroke: "#94A3B8", text: "#334155" };
  }
  return { fill: "#FFFFFF", stroke: "#64748B", text: "#1E293B" };
}

function hasRenderableGeometry(node: CanvasNode): boolean {
  return (
    Number.isFinite(node.x) &&
    Number.isFinite(node.y) &&
    Number.isFinite(node.width) &&
    Number.isFinite(node.height) &&
    node.width > 0 &&
    node.height > 0
  );
}

function wrapText(value: string, maxWidth: number, fontSize: number, maxLines: number): string[] {
  const safe = pdfSafeText(value);
  if (!safe) return [];
  const maxCharacters = Math.max(1, Math.floor(maxWidth / (fontSize * 0.52)));
  const words = safe.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const parts = splitLongWord(word, maxCharacters);
    for (const part of parts) {
      const candidate = current ? `${current} ${part}` : part;
      if (candidate.length <= maxCharacters) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = part;
      if (lines.length >= maxLines) break;
    }
    if (lines.length >= maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = truncateText(lines[maxLines - 1], Math.max(1, maxCharacters));
  }
  return lines.slice(0, maxLines);
}

function splitLongWord(word: string, length: number): string[] {
  if (word.length <= length) return [word];
  const parts: string[] = [];
  for (let index = 0; index < word.length; index += length) {
    parts.push(word.slice(index, index + length));
  }
  return parts;
}

function truncateText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  if (limit <= 3) return value.slice(0, limit);
  return `${value.slice(0, limit - 3)}...`;
}

function pdfSafeText(value: string): string {
  const replacements: Record<string, string> = {
    "ß": "ss",
    "Æ": "AE",
    "æ": "ae",
    "Ø": "O",
    "ø": "o",
    "Œ": "OE",
    "œ": "oe",
    "–": "-",
    "—": "-",
    "‘": "'",
    "’": "'",
    "“": '"',
    "”": '"',
    "…": "...",
    "•": "-",
    "→": "->",
    "←": "<-",
    "×": "x"
  };
  const normalized = [...value].map((character) => replacements[character] ?? character).join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\r\n\t]+/g, " ");
  return [...normalized]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code <= 126 ? character : "?";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPdf(content: string, width: number, height: number, title: string): ArrayBuffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNumber(width)} ${pdfNumber(height)}] ` +
      "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length + 1} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Title (${escapePdfText(pdfSafeText(title))}) /Creator (Live Canvas) >>`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf).buffer as ArrayBuffer;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pdfColor(hex: string): string {
  const { red, green, blue } = parseHex(hex);
  return `${pdfNumber(red / 255)} ${pdfNumber(green / 255)} ${pdfNumber(blue / 255)}`;
}

function darkenHex(hex: string, amount: number): string {
  const { red, green, blue } = parseHex(hex);
  return toHex(red * (1 - amount), green * (1 - amount), blue * (1 - amount));
}

function getContrastColor(hex: string): string {
  const { red, green, blue } = parseHex(hex);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.58 ? "#172033" : "#FFFFFF";
}

function parseHex(hex: string): { red: number; green: number; blue: number } {
  return {
    red: Number.parseInt(hex.slice(1, 3), 16),
    green: Number.parseInt(hex.slice(3, 5), 16),
    blue: Number.parseInt(hex.slice(5, 7), 16)
  };
}

function toHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((value) => Math.round(clamp(0, value, 255)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function pdfNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toFixed(3)).toString();
}

function clamp(minimum: number, value: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
