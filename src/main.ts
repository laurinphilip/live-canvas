import {
  App,
  getAllTags,
  Modal,
  normalizePath,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
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
  isPathInFolder,
  matchesExclusionRules,
  NoteLink,
  parseCanvasDocument,
  parseExclusionRules,
  tagMatches
} from "./core";

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
    const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
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

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("live-canvas-settings");
    containerEl.createEl("h2", { text: "Live Canvas" });
    containerEl.createEl("p", {
      cls: "live-canvas-setting-status",
      text: "Local, offline, and serverless. Live Canvas never modifies your Markdown notes."
    });

    new Setting(containerEl)
      .setName("Source filter")
      .setDesc("Include notes from one folder or with one tag.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("folder", "Folder")
          .addOption("tag", "Tag")
          .setValue(this.plugin.settings.filterType)
          .onChange(async (value) => {
            this.plugin.settings.filterType = value as FilterType;
            await this.plugin.saveSettings();
            this.plugin.scheduleRefresh();
            this.display();
          })
      );

    const isFolder = this.plugin.settings.filterType === "folder";
    new Setting(containerEl)
      .setName(isFolder ? "Source folder" : "Source tag")
      .setDesc(
        isFolder
          ? "Vault-relative path. Subfolders are included; / selects the entire vault."
          : "Enter with or without #. Nested tags are included."
      )
      .addText((text) =>
        text
          .setPlaceholder(isFolder ? "Knowledge/History" : "history")
          .setValue(this.plugin.settings.filterValue)
          .onChange(async (value) => {
            this.plugin.settings.filterValue = value;
            await this.plugin.saveSettings();
            this.plugin.scheduleRefresh();
          })
      );

    new Setting(containerEl)
      .setName("Exclusion rules")
      .setDesc(
        "Optional, one rule per line. Supports folder:Archive, tag:draft, property:status=archived, or property:hidden."
      )
      .addTextArea((text) =>
        text
          .setPlaceholder("folder:Archive\ntag:draft\nproperty:status=archived")
          .setValue(this.plugin.settings.excludeRules)
          .onChange(async (value) => {
            this.plugin.settings.excludeRules = value;
            await this.plugin.saveSettings();
            this.plugin.scheduleRefresh();
          })
      );

    new Setting(containerEl)
      .setName("Canvas path")
      .setDesc("Vault-relative path to a .canvas file.")
      .addText((text) =>
        text
          .setPlaceholder("Live Canvas.canvas")
          .setValue(this.plugin.settings.canvasPath)
          .onChange(async (value) => {
            this.plugin.settings.canvasPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Live sync")
      .setDesc(
        "Sync on startup and after note changes. The Canvas must first be created or explicitly adopted."
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoRefresh).onChange(async (value) => {
          this.plugin.settings.autoRefresh = value;
          await this.plugin.saveSettings();
          if (value) this.plugin.scheduleRefresh();
        })
      );

    new Setting(containerEl)
      .setName("Category colors")
      .setDesc(
        "Optional, one rule per line. Examples: folder:History = 1 or tag:religion = #4A90E2. The first matching rule wins; invalid lines are ignored."
      )
      .addTextArea((text) =>
        text
          .setPlaceholder("folder:History = 1\ntag:religion = #4A90E2")
          .setValue(this.plugin.settings.colorRules)
          .onChange(async (value) => {
            this.plugin.settings.colorRules = value;
            await this.plugin.saveSettings();
            this.plugin.scheduleRefresh();
          })
      );

    new Setting(containerEl)
      .setName("Linked neighbors")
      .setDesc(
        "Also include Markdown notes one or two links away, even when they do not match the source filter."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("0", "None")
          .addOption("1", "One link away")
          .addOption("2", "Two links away")
          .setValue(String(this.plugin.settings.neighborDepth))
          .onChange(async (value) => {
            this.plugin.settings.neighborDepth = Number.parseInt(value, 10);
            await this.plugin.saveSettings();
            this.plugin.scheduleRefresh();
          })
      );

    new Setting(containerEl)
      .setName("Neighbor direction")
      .setDesc(
        "Choose which link direction is followed when adding neighbors."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("both", "Incoming and outgoing")
          .addOption("outgoing", "Outgoing only")
          .addOption("incoming", "Incoming only")
          .setValue(this.plugin.settings.neighborDirection)
          .onChange(async (value) => {
            this.plugin.settings.neighborDirection = value as NeighborDirection;
            await this.plugin.saveSettings();
            this.plugin.scheduleRefresh();
          })
      );

    new Setting(containerEl)
      .setName("Label relationships")
      .setDesc(
        "Use property names, useful Wikilink aliases, and 'embed' as edge labels. Multiple relationships are combined."
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showEdgeLabels).onChange(async (value) => {
          this.plugin.settings.showEdgeLabels = value;
          await this.plugin.saveSettings();
          this.plugin.scheduleRefresh();
        })
      );

    new Setting(containerEl)
      .setName("Highlight isolated notes")
      .setDesc(
        "Optionally color notes with no visible relationships. Category color rules take priority."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("", "Off")
          .addOption("1", "Color 1 — red")
          .addOption("2", "Color 2 — orange")
          .addOption("3", "Color 3 — yellow")
          .addOption("4", "Color 4 — green")
          .addOption("5", "Color 5 — cyan")
          .addOption("6", "Color 6 — purple")
          .setValue(this.plugin.settings.orphanColor)
          .onChange(async (value) => {
            this.plugin.settings.clearOrphanHighlights =
              Boolean(this.plugin.settings.orphanColor) && !value;
            this.plugin.settings.orphanColor = value;
            await this.plugin.saveSettings();
            this.plugin.scheduleRefresh();
          })
      );

    new Setting(containerEl)
      .setName("Maximum notes")
      .setDesc("Protect large vaults from accidentally huge Canvas files (10–2000).")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.maxNotes)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          if (!Number.isFinite(parsed)) return;
          this.plugin.settings.maxNotes = Math.min(2000, Math.max(10, parsed));
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Refresh now")
      .setDesc("Create the Canvas the first time, then open it.")
      .addButton((button) =>
        button
          .setButtonText("Refresh and open")
          .setCta()
          .onClick(async () => {
            await this.plugin.refreshCanvas({ open: true, notify: true });
          })
      );

    new Setting(containerEl)
      .setName("Smart relayout")
      .setDesc(
        "Rearrange only Live Canvas-managed note cards based on their connections. Manual Canvas items stay unchanged."
      )
      .addButton((button) =>
        button.setButtonText("Relayout …").onClick(() => {
          new RelayoutConfirmModal(this.app, this.plugin).open();
        })
      );

    new Setting(containerEl)
      .setName("Adopt an existing Canvas")
      .setDesc(
        "Only needed when a Canvas already exists at the target path. Live Canvas replaces only its own lc-node-/lc-edge- items and retains other content."
      )
      .addButton((button) =>
        button.setButtonText("Adopt explicitly").setWarning().onClick(async () => {
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
