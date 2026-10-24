import {
  App,
  getAllTags,
  Modal,
  normalizePath,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  SettingDefinitionItem,
  TAbstractFile,
  TFile,
  TFolder
} from "obsidian";
import {
  applyPathRenames,
  buildCanvasDocument,
  CanvasDocument,
  createEmptyCanvas,
  expandPathsByNeighbors,
  getQuickStartCanvasPath,
  isPathInFolder,
  matchesExclusionRules,
  NoteLink,
  parseCanvasDocument,
  parseExclusionRules,
  tagMatches
} from "./core";
import { createCanvasPdf, getAvailablePdfPath } from "./pdf";

type FilterType = "folder" | "tag";
type NeighborDirection = "both" | "outgoing" | "incoming";

interface LiveCanvasSettings {
  filterType: FilterType;
  filterValue: string;
  canvasPath: string;
  autoRefresh: boolean;
  maxNotes: number;
  colorRules: string;
  excludeRules: string;
  neighborDepth: number;
  neighborDirection: NeighborDirection;
  showEdgeLabels: boolean;
  orphanColor: string;
  clearOrphanHighlights: boolean;
  managedCanvasPaths: string[];
}

const DEFAULT_SETTINGS: LiveCanvasSettings = {
  filterType: "folder",
  filterValue: "Notes",
  canvasPath: "Live Canvas.canvas",
  autoRefresh: true,
  maxNotes: 500,
  colorRules: "",
  excludeRules: "",
  neighborDepth: 0,
  neighborDirection: "both",
  showEdgeLabels: true,
  orphanColor: "",
  clearOrphanHighlights: false,
  managedCanvasPaths: []
};

interface CanvasColorRule {
  type: FilterType;
  value: string;
  color: string;
}

interface RefreshOptions {
  open?: boolean;
  notify?: boolean;
  forceLayout?: boolean;
}

interface RefreshResult {
  noteCount: number;
  edgeCount: number;
  path: string;
  changed: boolean;
}

interface NoteColorPlan {
  colors: Map<string, string>;
  clearColors: Set<string>;
}

export default class LiveCanvasPlugin extends Plugin {
  settings: LiveCanvasSettings = DEFAULT_SETTINGS;
  private refreshTimer: number | null = null;
  private refreshInProgress = false;
  private refreshRequested = false;
  private eventsReady = false;
  private pendingRenames = new Map<string, string>();
  private statusBar: HTMLElement | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.statusBar = this.addStatusBarItem();
    this.setStatus("ready");

    this.addSettingTab(new LiveCanvasSettingTab(this.app, this));
    this.addRibbonIcon("layout-dashboard", "Refresh Live Canvas", () => {
      void this.refreshCanvas({ notify: true });
    });

    this.addCommand({
      id: "refresh-canvas",
      name: "Refresh Canvas now",
      callback: () => {
        void this.refreshCanvas({ notify: true });
      }
    });

    this.addCommand({
      id: "create-canvas-from-current-folder",
      name: "Create Canvas from current note's folder",
      callback: () => {
        void this.createCanvasFromCurrentFolder();
      }
    });

    this.addCommand({
      id: "relayout-managed-nodes",
      name: "Smart relayout managed cards",
      callback: () => {
        new RelayoutConfirmModal(this.app, this).open();
      }
    });

    this.addCommand({
      id: "open-managed-canvas",
      name: "Open managed Canvas",
      callback: () => {
        void this.openCanvas();
      }
    });

    this.addCommand({
      id: "export-managed-canvas-pdf",
      name: "Export managed Canvas as PDF",
      callback: () => {
        void this.exportCanvasAsPdf();
      }
    });

    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (this.eventsReady && file.extension === "md") this.scheduleRefresh();
      })
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (this.eventsReady && this.isMarkdownFile(file)) this.scheduleRefresh();
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (this.eventsReady && this.isMarkdownFile(file)) this.scheduleRefresh();
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (!this.eventsReady || !this.isMarkdownFile(file)) return;
        this.pendingRenames.set(oldPath, file.path);
        this.scheduleRefresh();
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        const folder = file instanceof TFolder
          ? file
          : file instanceof TFile && file.extension === "md"
            ? file.parent
            : null;
        if (!folder) return;

        menu.addItem((item) =>
          item
            .setTitle("Create Live Canvas for this folder")
            .setIcon("layout-dashboard")
            .onClick(() => {
              void this.createCanvasForFolder(folder.path);
            })
        );
      })
    );

    this.app.workspace.onLayoutReady(() => {
      this.eventsReady = true;
      if (this.hasManagedCanvasFile()) this.scheduleRefresh();
    });
  }

  onunload(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<LiveCanvasSettings> | null;
    const loadedMaxNotes = loaded?.maxNotes;
    this.settings = {
      ...DEFAULT_SETTINGS,
      filterType: loaded?.filterType === "tag" ? "tag" : "folder",
      filterValue:
        typeof loaded?.filterValue === "string" ? loaded.filterValue : DEFAULT_SETTINGS.filterValue,
      canvasPath:
        typeof loaded?.canvasPath === "string" ? loaded.canvasPath : DEFAULT_SETTINGS.canvasPath,
      autoRefresh:
        typeof loaded?.autoRefresh === "boolean"
          ? loaded.autoRefresh
          : DEFAULT_SETTINGS.autoRefresh,
      maxNotes:
        typeof loadedMaxNotes === "number" && Number.isFinite(loadedMaxNotes)
          ? Math.min(2000, Math.max(10, Math.round(loadedMaxNotes)))
          : DEFAULT_SETTINGS.maxNotes,
      colorRules:
        typeof loaded?.colorRules === "string" ? loaded.colorRules : DEFAULT_SETTINGS.colorRules,
      excludeRules:
        typeof loaded?.excludeRules === "string"
          ? loaded.excludeRules
          : DEFAULT_SETTINGS.excludeRules,
      neighborDepth:
        typeof loaded?.neighborDepth === "number" && Number.isFinite(loaded.neighborDepth)
          ? Math.min(2, Math.max(0, Math.round(loaded.neighborDepth)))
          : DEFAULT_SETTINGS.neighborDepth,
      neighborDirection:
        loaded?.neighborDirection === "outgoing" || loaded?.neighborDirection === "incoming"
          ? loaded.neighborDirection
          : DEFAULT_SETTINGS.neighborDirection,
      showEdgeLabels:
        typeof loaded?.showEdgeLabels === "boolean"
          ? loaded.showEdgeLabels
          : DEFAULT_SETTINGS.showEdgeLabels,
      orphanColor:
        typeof loaded?.orphanColor === "string" && /^[1-6]$/.test(loaded.orphanColor)
          ? loaded.orphanColor
          : DEFAULT_SETTINGS.orphanColor,
      clearOrphanHighlights:
        typeof loaded?.clearOrphanHighlights === "boolean"
          ? loaded.clearOrphanHighlights
          : DEFAULT_SETTINGS.clearOrphanHighlights,
      managedCanvasPaths: Array.isArray(loaded?.managedCanvasPaths)
        ? loaded.managedCanvasPaths.filter((path): path is string => typeof path === "string")
        : []
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  scheduleRefresh(): void {
    if (!this.settings.autoRefresh || !this.hasManagedCanvasFile()) return;
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.refreshCanvas();
    }, 900);
  }

  async refreshCanvas(options: RefreshOptions = {}): Promise<RefreshResult | null> {
    if (this.refreshInProgress) {
      this.refreshRequested = true;
      return null;
    }

    this.refreshInProgress = true;
    this.setStatus("syncing …");

    try {
      const canvasPath = this.getValidatedCanvasPath();
      const noteFiles = this.collectSelectedNotes();
      const limitedFiles = noteFiles.slice(0, this.settings.maxNotes);
      const links = this.collectLinks(limitedFiles);
      const noteColorPlan = this.collectNoteColors(limitedFiles, links);
      const result = await this.writeCanvas(
        canvasPath,
        limitedFiles,
        links,
        noteColorPlan,
        options.forceLayout ?? false
      );

      this.pendingRenames.clear();
      if (this.settings.clearOrphanHighlights) {
        this.settings.clearOrphanHighlights = false;
        await this.saveSettings();
      }
      this.setStatus(`${result.noteCount} notes · ${result.edgeCount} links`);

      if (noteFiles.length > limitedFiles.length) {
        new Notice(
          `Live Canvas: ${noteFiles.length} notes matched, but the configured limit is ${this.settings.maxNotes}.`
        );
      } else if (options.notify) {
        const action = result.changed ? "updated" : "is already up to date";
        new Notice(
          `Live Canvas ${action}: ${result.noteCount} notes, ${result.edgeCount} links.`
        );
      }

      if (options.open) await this.openCanvas();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus("error", true);
      console.error("Live Canvas refresh failed", error);
      new Notice(`Live Canvas: ${message}`, 8000);
      return null;
    } finally {
      this.refreshInProgress = false;
      if (this.refreshRequested) {
        this.refreshRequested = false;
        this.scheduleRefresh();
      }
    }
  }

  async openCanvas(): Promise<void> {
    try {
      const path = this.getValidatedCanvasPath();
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        new Notice("Live Canvas: This Canvas has not been created yet. Refresh it first.");
        return;
      }
      await this.app.workspace.getLeaf(false).openFile(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Live Canvas: ${message}`);
    }
  }

  async createCanvasFromCurrentFolder(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!(activeFile instanceof TFile) || activeFile.extension !== "md") {
      new Notice("Live Canvas: Open a Markdown note first.");
      return;
    }

    await this.createCanvasForFolder(activeFile.parent?.path ?? "/");
  }

  async createCanvasForFolder(folderPath: string): Promise<void> {
    const sourceFolder = folderPath && folderPath !== "/" ? folderPath : "/";
    const occupiedPaths = new Set(
      this.app.vault.getAllLoadedFiles().map((file) => file.path)
    );
    const canvasPath = getQuickStartCanvasPath(
      sourceFolder,
      occupiedPaths,
      new Set(this.settings.managedCanvasPaths)
    );

    this.settings.filterType = "folder";
    this.settings.filterValue = sourceFolder;
    this.settings.canvasPath = canvasPath;
    await this.saveSettings();

    const folderLabel = sourceFolder === "/" ? "the vault root" : `"${sourceFolder}"`;
    new Notice(`Live Canvas: Creating a Canvas for ${folderLabel}.`);
    await this.refreshCanvas({ open: true, notify: true });
  }

  async exportCanvasAsPdf(): Promise<TFile | null> {
    try {
      const canvasPath = this.getValidatedCanvasPath();
      const canvasFile = this.app.vault.getAbstractFileByPath(canvasPath);
      if (!(canvasFile instanceof TFile) || canvasFile.extension !== "canvas") {
        throw new Error("This Canvas has not been created yet. Refresh it first.");
      }

      const document = parseCanvasDocument(await this.app.vault.read(canvasFile));
      const existingPaths = new Set(this.app.vault.getFiles().map((file) => file.path));
      const pdfPath = getAvailablePdfPath(canvasPath, existingPaths);
      const pdf = createCanvasPdf(document, canvasFile.basename);
      const pdfFile = await this.app.vault.createBinary(pdfPath, pdf);

      new Notice(`Live Canvas exported a PDF to "${pdfPath}".`);
      try {
        await this.app.workspace.getLeaf(true).openFile(pdfFile);
      } catch (error) {
        console.warn("Live Canvas created the PDF but could not open it", error);
      }
      return pdfFile;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Live Canvas PDF export failed", error);
      new Notice(`Live Canvas: ${message}`, 8000);
      return null;
    }
  }

  async adoptCurrentCanvas(): Promise<void> {
    const path = this.getValidatedCanvasPath();
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== "canvas") {
      throw new Error("There is no Canvas file at the target path.");
    }

    const raw = await this.app.vault.read(file);
    parseCanvasDocument(raw);
    if (!this.settings.managedCanvasPaths.includes(path)) {
      this.settings.managedCanvasPaths.push(path);
      await this.saveSettings();
    }
  }

  private hasManagedCanvasFile(): boolean {
    try {
      const path = this.getValidatedCanvasPath();
      return (
        this.settings.managedCanvasPaths.includes(path) &&
        this.app.vault.getAbstractFileByPath(path) instanceof TFile
      );
    } catch {
      return false;
    }
  }

  private async writeCanvas(
    canvasPath: string,
    noteFiles: TFile[],
    links: NoteLink[],
    noteColorPlan: NoteColorPlan,
    forceLayout: boolean
  ): Promise<RefreshResult> {
    await this.ensureParentFolder(canvasPath);
    const existing = this.app.vault.getAbstractFileByPath(canvasPath);
    const notePaths = noteFiles.map((file) => file.path);

    if (existing && !(existing instanceof TFile)) {
      throw new Error("The Canvas target path points to a folder.");
    }

    if (!existing) {
      const built = buildCanvasDocument({
        existing: createEmptyCanvas(),
        notePaths,
        links,
        noteColors: noteColorPlan.colors,
        clearNoteColors: noteColorPlan.clearColors,
        forceLayout
      });
      await this.app.vault.create(canvasPath, serializeCanvas(built.document));
      this.rememberManagedPath(canvasPath);
      await this.saveSettings();
      return {
        noteCount: built.generatedNodeCount,
        edgeCount: built.generatedEdgeCount,
        path: canvasPath,
        changed: true
      };
    }

    if (existing.extension !== "canvas") {
      throw new Error("The target path must end in .canvas.");
    }
    if (!this.settings.managedCanvasPaths.includes(canvasPath)) {
      throw new Error(
        "The existing Canvas has not been approved for management. You can explicitly adopt it in settings."
      );
    }

    let generatedNodeCount = 0;
    let generatedEdgeCount = 0;
    let changed = false;

    await this.app.vault.process(existing, (current) => {
      const parsed = applyPathRenames(parseCanvasDocument(current), this.pendingRenames);
      const built = buildCanvasDocument({
        existing: parsed,
        notePaths,
        links,
        noteColors: noteColorPlan.colors,
        clearNoteColors: noteColorPlan.clearColors,
        forceLayout
      });
      generatedNodeCount = built.generatedNodeCount;
      generatedEdgeCount = built.generatedEdgeCount;
      const next = serializeCanvas(built.document);
      changed = next !== current;
      return changed ? next : current;
    });

    return {
      noteCount: generatedNodeCount,
      edgeCount: generatedEdgeCount,
      path: canvasPath,
      changed
    };
  }

  private collectMatchingNotes(): TFile[] {
    const value = this.settings.filterValue.trim();
    if (!value) {
      throw new Error("Choose a source folder or tag in settings first.");
    }

    const exclusionRules = parseExclusionRules(this.settings.excludeRules);
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => {
        const cache = this.app.metadataCache.getFileCache(file);
        if (this.settings.filterType === "folder") {
          if (!isPathInFolder(file.path, value)) return false;
        } else if (!tagMatches(cache ? getAllTags(cache) ?? [] : [], value)) {
          return false;
        }

        return !this.isExcluded(file, exclusionRules);
      })
      .sort((first, second) =>
        first.path < second.path ? -1 : first.path > second.path ? 1 : 0
      );
  }

  private collectSelectedNotes(): TFile[] {
    const seeds = this.collectMatchingNotes();
    if (this.settings.neighborDepth === 0 || seeds.length === 0) return seeds;

    const exclusionRules = parseExclusionRules(this.settings.excludeRules);
    const allFiles = this.app.vault.getMarkdownFiles();
    const filesByPath = new Map(allFiles.map((file) => [file.path, file]));
    const adjacency = new Map<string, Set<string>>();
    for (const path of filesByPath.keys()) adjacency.set(path, new Set());

    for (const [sourcePath, targets] of Object.entries(this.app.metadataCache.resolvedLinks)) {
      if (!filesByPath.has(sourcePath)) continue;
      for (const targetPath of Object.keys(targets)) {
        if (!filesByPath.has(targetPath) || sourcePath === targetPath) continue;
        if (this.settings.neighborDirection !== "incoming") {
          adjacency.get(sourcePath)!.add(targetPath);
        }
        if (this.settings.neighborDirection !== "outgoing") {
          adjacency.get(targetPath)!.add(sourcePath);
        }
      }
    }

    const selectedPaths = expandPathsByNeighbors(
      seeds.map((file) => file.path),
      adjacency,
      this.settings.neighborDepth
    );
    return selectedPaths
      .map((path) => filesByPath.get(path))
      .filter(
        (file): file is TFile => file instanceof TFile && !this.isExcluded(file, exclusionRules)
      );
  }

  private isExcluded(
    file: TFile,
    rules: ReturnType<typeof parseExclusionRules>
  ): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    const tags = cache ? getAllTags(cache) ?? [] : [];
    const frontmatter = cache?.frontmatter;
    return matchesExclusionRules(file.path, tags, frontmatter, rules);
  }

  private collectLinks(files: TFile[]): NoteLink[] {
    const includedPaths = new Set(files.map((file) => file.path));
    const links: NoteLink[] = [];

    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      for (const reference of cache?.links ?? []) {
        const destination = this.app.metadataCache.getFirstLinkpathDest(reference.link, file.path);
        if (destination && includedPaths.has(destination.path)) {
          links.push({
            from: file.path,
            to: destination.path,
            label: this.settings.showEdgeLabels
              ? getUsefulLinkLabel(reference.displayText, reference.link, destination)
              : undefined
          });
        }
      }

      for (const reference of cache?.frontmatterLinks ?? []) {
        const destination = this.app.metadataCache.getFirstLinkpathDest(reference.link, file.path);
        if (destination && includedPaths.has(destination.path)) {
          links.push({
            from: file.path,
            to: destination.path,
            label: this.settings.showEdgeLabels ? reference.key : undefined
          });
        }
      }

      for (const reference of cache?.embeds ?? []) {
        const destination = this.app.metadataCache.getFirstLinkpathDest(reference.link, file.path);
        if (destination && includedPaths.has(destination.path)) {
          links.push({
            from: file.path,
            to: destination.path,
            label: this.settings.showEdgeLabels ? "embed" : undefined
          });
        }
      }
    }

    return links;
  }

  private collectNoteColors(files: TFile[], links: NoteLink[]): NoteColorPlan {
    const rules = parseColorRules(this.settings.colorRules);
    const colors = new Map<string, string>();
    const clearColors = new Set<string>();
    const connectedPaths = new Set<string>();
    for (const link of links) {
      if (link.from === link.to) continue;
      connectedPaths.add(link.from);
      connectedPaths.add(link.to);
    }

    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const tags = cache ? getAllTags(cache) ?? [] : [];
      const match = rules.find((rule) => {
        return rule.type === "folder"
          ? isPathInFolder(file.path, rule.value)
          : tagMatches(tags, rule.value);
      });
      if (match) {
        colors.set(file.path, match.color);
      } else if (this.settings.orphanColor) {
        if (connectedPaths.has(file.path)) clearColors.add(file.path);
        else colors.set(file.path, this.settings.orphanColor);
      } else if (this.settings.clearOrphanHighlights && !connectedPaths.has(file.path)) {
        clearColors.add(file.path);
      }
    }

    return { colors, clearColors };
  }

  private getValidatedCanvasPath(): string {
    const raw = this.settings.canvasPath.trim();
    if (!raw) throw new Error("Enter a Canvas target path.");
    if (raw.split(/[\\/]/).includes("..")) {
      throw new Error("The Canvas target path cannot contain '..'.");
    }

    const path = normalizePath(raw);
    if (!path.toLowerCase().endsWith(".canvas")) {
      throw new Error("The Canvas target path must end in .canvas.");
    }
    if (path === this.app.vault.configDir || path.startsWith(`${this.app.vault.configDir}/`)) {
      throw new Error("The Canvas cannot be stored inside Obsidian's configuration folder.");
    }
    return path;
  }

  private async ensureParentFolder(filePath: string): Promise<void> {
    const slash = filePath.lastIndexOf("/");
    if (slash < 0) return;
    const folderPath = filePath.slice(0, slash);
    const segments = folderPath.split("/");
    let current = "";

    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      const entry = this.app.vault.getAbstractFileByPath(current);
      if (entry instanceof TFolder) continue;
      if (entry) throw new Error(`The path "${current}" is a file, not a folder.`);
      await this.app.vault.createFolder(current);
    }
  }

  private rememberManagedPath(path: string): void {
    if (!this.settings.managedCanvasPaths.includes(path)) {
      this.settings.managedCanvasPaths.push(path);
    }
  }

  private isMarkdownFile(file: TAbstractFile): file is TFile {
    return file instanceof TFile && file.extension === "md";
  }

  private setStatus(text: string, error = false): void {
    if (!this.statusBar) return;
    this.statusBar.setText(`Live Canvas: ${text}`);
    this.statusBar.toggleClass("mod-warning", error);
  }
}

class LiveCanvasSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: LiveCanvasPlugin) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const isFolder = this.plugin.settings.filterType === "folder";
    return [
      {
        type: "group",
        heading: "Live Canvas",
        items: [
          {
            name: "Local and private",
            desc: "Live Canvas works offline and never modifies your Markdown notes.",
            searchable: false
          }
        ]
      },
      {
        type: "group",
        heading: "Source",
        items: [
          {
            name: "Source filter",
            desc: "Include notes from one folder or with one tag.",
            control: {
              type: "dropdown",
              key: "filterType",
              options: { folder: "Folder", tag: "Tag" }
            }
          },
          {
            name: isFolder ? "Source folder" : "Source tag",
            desc: isFolder
              ? "Vault-relative path. Subfolders are included; / selects the entire vault."
              : "Enter with or without #. Nested tags are included.",
            control: {
              type: "text",
              key: "filterValue",
              placeholder: isFolder ? "Knowledge/History" : "history"
            }
          },
          {
            name: "Exclusion rules",
            desc: "Optional, one rule per line. Supports folder:Archive, tag:draft, property:status=archived, or property:hidden.",
            control: {
              type: "textarea",
              key: "excludeRules",
              placeholder: "folder:Archive\ntag:draft\nproperty:status=archived",
              rows: 4
            }
          }
        ]
      },
      {
        type: "group",
        heading: "Canvas",
        items: [
          {
            name: "Canvas path",
            desc: "Vault-relative path to a .canvas file.",
            control: {
              type: "text",
              key: "canvasPath",
              placeholder: "Live Canvas.canvas"
            }
          },
          {
            name: "Live sync",
            desc: "Sync on startup and after note changes. The Canvas must first be created or explicitly adopted.",
            control: { type: "toggle", key: "autoRefresh" }
          },
          {
            name: "Maximum notes",
            desc: "Protect large vaults from accidentally huge Canvas files (10–2000).",
            control: {
              type: "number",
              key: "maxNotes",
              min: 10,
              max: 2000,
              step: 1
            }
          }
        ]
      },
      {
        type: "group",
        heading: "Relationships and appearance",
        items: [
          {
            name: "Category colors",
            desc: "Optional, one rule per line. Examples: folder:History = 1 or tag:religion = #4A90E2. The first matching rule wins; invalid lines are ignored.",
            control: {
              type: "textarea",
              key: "colorRules",
              placeholder: "folder:History = 1\ntag:religion = #4A90E2",
              rows: 4
            }
          },
          {
            name: "Linked neighbors",
            desc: "Also include Markdown notes one or two links away, even when they do not match the source filter.",
            control: {
              type: "dropdown",
              key: "neighborDepth",
              options: {
                "0": "None",
                "1": "One link away",
                "2": "Two links away"
              }
            }
          },
          {
            name: "Neighbor direction",
            desc: "Choose which link direction is followed when adding neighbors.",
            control: {
              type: "dropdown",
              key: "neighborDirection",
              options: {
                both: "Incoming and outgoing",
                outgoing: "Outgoing only",
                incoming: "Incoming only"
              }
            }
          },
          {
            name: "Label relationships",
            desc: "Use property names, useful Wikilink aliases, and 'embed' as edge labels. Multiple relationships are combined.",
            control: { type: "toggle", key: "showEdgeLabels" }
          },
          {
            name: "Highlight isolated notes",
            desc: "Optionally color notes with no visible relationships. Category color rules take priority.",
            control: {
              type: "dropdown",
              key: "orphanColor",
              options: {
                "": "Off",
                "1": "Color 1 — red",
                "2": "Color 2 — orange",
                "3": "Color 3 — yellow",
                "4": "Color 4 — green",
                "5": "Color 5 — cyan",
                "6": "Color 6 — purple"
              }
            }
          }
        ]
      },
      {
        type: "group",
        heading: "Actions",
        items: [
          {
            name: "Quick start from current folder",
            desc: "Open a Markdown note, then create and open a Live Canvas for all notes in the same folder. Existing unmanaged Canvas files are never replaced.",
            render: (setting) => {
              setting.addButton((button) =>
                button
                  .setButtonText("Use active note")
                  .setCta()
                  .onClick(async () => {
                    await this.plugin.createCanvasFromCurrentFolder();
                  })
              );
            }
          },
          {
            name: "Refresh now",
            desc: "Create the Canvas the first time, then open it.",
            render: (setting) => {
              setting.addButton((button) =>
                button
                  .setButtonText("Refresh and open")
                  .onClick(async () => {
                    await this.plugin.refreshCanvas({ open: true, notify: true });
                  })
              );
            }
          },
          {
            name: "Smart relayout",
            desc: "Rearrange only Live Canvas-managed note cards based on their connections. Manual Canvas items stay unchanged.",
            render: (setting) => {
              setting.addButton((button) =>
                button.setButtonText("Relayout …").onClick(() => {
                  new RelayoutConfirmModal(this.app, this.plugin).open();
                })
              );
            }
          },
          {
            name: "Export to PDF",
            desc: "Create a print-friendly overview next to the saved Canvas and open it. Existing exports are never overwritten.",
            render: (setting) => {
              setting.addButton((button) =>
                button
                  .setButtonText("Export PDF")
                  .onClick(async () => {
                    await this.plugin.exportCanvasAsPdf();
                  })
              );
            }
          },
          {
            name: "Adopt an existing Canvas",
            desc: "Only needed when a Canvas already exists at the target path. Live Canvas replaces only its own lc-node-/lc-edge- items and retains other content.",
            render: (setting) => {
              setting.addButton((button) =>
                button
                  .setButtonText("Adopt explicitly")
                  .setDestructive()
                  .onClick(async () => {
                    try {
                      await this.plugin.adoptCurrentCanvas();
                      new Notice("Live Canvas: The existing Canvas is now managed.");
                    } catch (error) {
                      const message = error instanceof Error ? error.message : String(error);
                      new Notice(`Live Canvas: ${message}`);
                    }
                  })
              );
            }
          }
        ]
      }
    ];
  }

  getControlValue(key: string): unknown {
    if (key === "neighborDepth") return String(this.plugin.settings.neighborDepth);
    return this.plugin.settings[key as keyof LiveCanvasSettings];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    switch (key) {
      case "filterType":
        this.plugin.settings.filterType = value === "tag" ? "tag" : "folder";
        break;
      case "filterValue":
      case "excludeRules":
      case "canvasPath":
      case "colorRules":
        this.plugin.settings[key] = String(value ?? "");
        break;
      case "autoRefresh":
      case "showEdgeLabels":
        this.plugin.settings[key] = Boolean(value);
        break;
      case "neighborDepth": {
        const parsed = Number.parseInt(String(value), 10);
        this.plugin.settings.neighborDepth = Number.isFinite(parsed)
          ? Math.min(2, Math.max(0, parsed))
          : 0;
        break;
      }
      case "neighborDirection":
        this.plugin.settings.neighborDirection =
          value === "incoming" || value === "outgoing" ? value : "both";
        break;
      case "orphanColor": {
        const next = typeof value === "string" && /^[1-6]$/.test(value) ? value : "";
        this.plugin.settings.clearOrphanHighlights =
          Boolean(this.plugin.settings.orphanColor) && !next;
        this.plugin.settings.orphanColor = next;
        break;
      }
      case "maxNotes": {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return;
        this.plugin.settings.maxNotes = Math.min(2000, Math.max(10, Math.round(parsed)));
        break;
      }
      default:
        return;
    }

    await this.plugin.saveSettings();

    if (key === "filterType") this.update();
    if (key === "autoRefresh") {
      if (this.plugin.settings.autoRefresh) this.plugin.scheduleRefresh();
      return;
    }
    if (
      key === "filterType" ||
      key === "filterValue" ||
      key === "excludeRules" ||
      key === "colorRules" ||
      key === "neighborDepth" ||
      key === "neighborDirection" ||
      key === "showEdgeLabels" ||
      key === "orphanColor"
    ) {
      this.plugin.scheduleRefresh();
    }
  }
}

function serializeCanvas(document: CanvasDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function parseColorRules(value: string): CanvasColorRule[] {
  const rules: CanvasColorRule[] = [];

  for (const line of value.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("# ")) continue;
    const match = /^(folder|tag)\s*:\s*(.+?)\s*=\s*([1-6]|#[0-9a-f]{6})$/i.exec(trimmed);
    if (!match) continue;
    rules.push({
      type: match[1].toLowerCase() as FilterType,
      value: match[2].trim(),
      color: match[3]
    });
  }

  return rules;
}

function getUsefulLinkLabel(displayText: string | undefined, link: string, target: TFile): string | undefined {
  const display = displayText?.trim();
  if (!display) return undefined;
  const linkName = link.split("#", 1)[0].split("/").pop()?.replace(/\.md$/i, "") ?? "";
  const defaults = new Set([link, linkName, target.basename, target.name]);
  return defaults.has(display) ? undefined : display;
}

class RelayoutConfirmModal extends Modal {
  constructor(app: App, private readonly plugin: LiveCanvasPlugin) {
    super(app);
  }

  onOpen(): void {
    this.setTitle("Relayout Live Canvas?");
    this.contentEl.createEl("p", {
      text: "Saved positions for all Live Canvas-managed note cards will be replaced with a connection-based layout. Manual nodes remain unchanged."
    });
    const buttons = new Setting(this.contentEl);
    buttons.addButton((button) =>
      button.setButtonText("Cancel").onClick(() => this.close())
    );
    buttons.addButton((button) =>
      button
        .setButtonText("Relayout")
        .setCta()
        .onClick(async () => {
          this.close();
          await this.plugin.refreshCanvas({ open: true, notify: true, forceLayout: true });
        })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
