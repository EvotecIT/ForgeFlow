import * as path from 'path';
import * as vscode from 'vscode';
import type { Project, ProjectEntryPoint, ProjectIdentity } from '../models/project';
import { detectEntryPoints } from '../scan/entryPointDetector';
import { detectProjectIdentity } from '../scan/identityDetector';
import { findRecentWriteTime } from '../scan/modifiedScanner';
import { ProjectScanner } from '../scan/projectScanner';
import type { ProjectsStore } from '../store/projectsStore';
import { getForgeFlowSettings, ProjectSortMode, SortDirection } from '../util/config';
import { readDirectory, statPath } from '../util/fs';
import { treeId } from '../util/ids';
import { baseName } from '../util/path';
import { getLocalGitInfo } from '../dashboard/dataProviders';
import type { GitStore } from '../git/gitStore';
import type { GitProjectSummary } from '../git/gitSummary';

interface ProjectNode {
  readonly id: string;
  getChildren(): Promise<ProjectNode[]>;
  getTreeItem(): vscode.TreeItem;
}

export interface ProjectNodeWithProject {
  readonly project: Project;
}

export interface ProjectNodeWithPath {
  readonly path: string;
}

export interface ProjectNodeWithEntry {
  readonly entry: ProjectEntryPoint;
}

export class ProjectsViewProvider implements vscode.TreeDataProvider<ProjectNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ProjectNode | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private projects: Project[] = [];
  private favoriteIds: string[] = [];
  private duplicateInfo = new Map<string, DuplicateInfo>();
  private filterText = '';
  private isScanning = false;
  private pendingRefresh = false;
  private gitCommitLoading = false;
  private gitCommitProgress = 0;
  private gitCommitTotal = 0;
  private modifiedLoading = false;
  private modifiedProgress = 0;
  private modifiedTotal = 0;
  private lastProgressUpdate = 0;

  public constructor(
    private readonly projectsStore: ProjectsStore,
    private readonly scanner: ProjectScanner,
    private readonly gitStore: GitStore
  ) {
    this.filterText = projectsStore.getFilter();
  }

  public async refresh(): Promise<void> {
    const settings = getForgeFlowSettings();
    const roots = getScanRoots();
    const existing = this.projectsStore.list();
    this.projects = existing;
    this.favoriteIds = this.projectsStore.getFavoriteIds();
    this.onDidChangeTreeDataEmitter.fire(undefined);

    if (this.isScanning) {
      this.pendingRefresh = true;
      return;
    }

    this.isScanning = true;
    void this.runScan(roots, settings.projectScanMaxDepth, settings.projectSortMode);
  }

  public setFilter(text: string): void {
    this.filterText = text.trim();
    void this.projectsStore.setFilter(this.filterText);
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getFilter(): string {
    return this.filterText;
  }

  public getTreeItem(element: ProjectNode): vscode.TreeItem {
    return element.getTreeItem();
  }

  public async getChildren(element?: ProjectNode): Promise<ProjectNode[]> {
    if (!element) {
      const roots = getScanRoots();
      if (roots.length === 0) {
        return [new ProjectHintNode('Select project roots to scan', 'forgeflow.projects.configureScanRoots')];
      }
      if (this.isScanning) {
        return [new ProjectHintNode('Scanning projects...', 'forgeflow.projects.refresh'), ...this.getRootGroups()];
      }
      if (this.gitCommitLoading) {
        const label = this.gitCommitTotal > 0
          ? `Loading git commit data (${this.gitCommitProgress}/${this.gitCommitTotal})...`
          : 'Loading git commit data...';
        return [new ProjectHintNode(label, 'forgeflow.projects.refresh'), ...this.getRootGroups()];
      }
      if (this.modifiedLoading) {
        const label = this.modifiedTotal > 0
          ? `Loading modified times (${this.modifiedProgress}/${this.modifiedTotal})...`
          : 'Loading modified times...';
        return [new ProjectHintNode(label, 'forgeflow.projects.refresh'), ...this.getRootGroups()];
      }
      if (this.projects.length === 0) {
        return [new ProjectHintNode('No projects found. Refresh or adjust scan roots.', 'forgeflow.projects.refresh')];
      }
      if (this.filterText && this.getFilteredProjects(this.projects).length === 0) {
        return [new ProjectHintNode(`No projects match filter: ${this.filterText}`, 'forgeflow.projects.clearFilter')];
      }
      return this.getRootGroups();
    }
    return await element.getChildren();
  }

  public getParent(): ProjectNode | undefined {
    return undefined;
  }

  private getFavoriteProjects(): Project[] {
    const favorites = this.favoriteIds
      .map((id) => this.projects.find((project) => project.id === id))
      .filter((project): project is Project => project !== undefined);
    return this.getFilteredProjects(favorites);
  }

  private getOtherProjects(): Project[] {
    const favorites = new Set(this.favoriteIds);
    const others = this.projects.filter((project) => !favorites.has(project.id));
    const settings = getForgeFlowSettings();
    const filtered = this.getFilteredProjects(others);
    const fallbackToName = !(
      (settings.projectSortMode === 'gitCommit' && this.gitCommitLoading)
      || (settings.projectSortMode === 'recentModified' && this.modifiedLoading)
    );
    return sortProjects(filtered, settings.projectSortMode, settings.projectSortDirection, fallbackToName);
  }

  private getRootGroups(): ProjectNode[] {
    const favorites = this.getFavoriteProjects();
    const others = this.getOtherProjects();
    const summaries = this.gitStore.getSummaries();
    const showSummary = getForgeFlowSettings().gitShowProjectSummary;
    const sortDescription = buildSortDescription(others, {
      gitCommit: { loading: this.gitCommitLoading, progress: this.gitCommitProgress, total: this.gitCommitTotal },
      modified: { loading: this.modifiedLoading, progress: this.modifiedProgress, total: this.modifiedTotal }
    }, this.filterText);
    return [
      new ProjectGroupNode('Favorite Projects', 'forgeflowGroup', favorites, true, undefined, this.duplicateInfo, summaries, showSummary),
      new ProjectGroupNode('Projects', 'forgeflowGroup', others, false, sortDescription, this.duplicateInfo, summaries, showSummary)
    ];
  }

  private getFilteredProjects(projects: Project[]): Project[] {
    const filter = this.filterText.trim().toLowerCase();
    if (!filter) {
      return projects;
    }
    return projects.filter((project) => matchesProjectFilter(project, filter));
  }

  private async hydrateIdentities(projects: Project[]): Promise<Project[]> {
    const results: Project[] = [];
    for (const project of projects) {
      const needsRepo = needsRepositoryIdentity(project.identity);
      if (project.identity && !needsRepo) {
        results.push(project);
        continue;
      }
      const detected = await detectProjectIdentity(project.path, {
        maxDepth: getForgeFlowSettings().identityScanDepth,
        preferredFolders: getForgeFlowSettings().identityPreferredFolders
      });
      if (!detected.identity) {
        results.push(project);
        continue;
      }
      const merged = mergeIdentity(project.identity, detected.identity);
      const updated = { ...project, identity: merged };
      await this.projectsStore.updateProject(updated);
      results.push(updated);
    }
    this.updateDuplicateInfo(results);
    return results;
  }

  private async hydrateGitCommits(projects: Project[]): Promise<Project[]> {
    const results: Project[] = [];
    const gitProjects = projects.filter((project) => project.type === 'git');
    this.gitCommitTotal = gitProjects.length;
    this.gitCommitProgress = 0;
    this.gitCommitLoading = true;
    this.lastProgressUpdate = Date.now();
    this.onDidChangeTreeDataEmitter.fire(undefined);

    for (const project of projects) {
      if (project.type !== 'git') {
        results.push(project);
        continue;
      }
      const gitInfo = await getLocalGitInfo(project.path);
      const lastCommit = gitInfo?.lastCommit ? Date.parse(gitInfo.lastCommit) : undefined;
      const lastGitCommit = Number.isNaN(lastCommit ?? NaN) ? undefined : lastCommit;
      const updated = { ...project, lastGitCommit };
      await this.projectsStore.updateProject(updated);
      results.push(updated);
      this.gitCommitProgress += 1;
      this.maybeUpdateProgress();
    }
    this.gitCommitLoading = false;
    this.gitCommitProgress = this.gitCommitTotal;
    this.onDidChangeTreeDataEmitter.fire(undefined);
    this.updateDuplicateInfo(results);
    return results;
  }

  private async hydrateModifiedTimes(projects: Project[]): Promise<Project[]> {
    const results: Project[] = [];
    const settings = getForgeFlowSettings();
    this.modifiedTotal = projects.length;
    this.modifiedProgress = 0;
    this.modifiedLoading = true;
    this.lastProgressUpdate = Date.now();
    this.onDidChangeTreeDataEmitter.fire(undefined);

    for (const project of projects) {
      const recent = await findRecentWriteTime(project.path, settings.projectModifiedScanDepth);
      const lastModified = recent ?? project.lastModified;
      const updated = { ...project, lastModified };
      await this.projectsStore.updateProject(updated);
      results.push(updated);
      this.modifiedProgress += 1;
      this.maybeUpdateProgress();
    }

    this.modifiedLoading = false;
    this.modifiedProgress = this.modifiedTotal;
    this.onDidChangeTreeDataEmitter.fire(undefined);
    this.updateDuplicateInfo(results);
    return results;
  }

  private async runScan(roots: string[], maxDepth: number, sortMode: ProjectSortMode): Promise<void> {
    try {
      if (sortMode === 'gitCommit') {
        this.gitCommitLoading = true;
        this.gitCommitProgress = 0;
        this.gitCommitTotal = 0;
        this.lastProgressUpdate = Date.now();
        this.onDidChangeTreeDataEmitter.fire(undefined);
      } else {
        this.gitCommitLoading = false;
        this.gitCommitProgress = 0;
        this.gitCommitTotal = 0;
      }
      if (sortMode === 'recentModified') {
        this.modifiedLoading = true;
        this.modifiedProgress = 0;
        this.modifiedTotal = 0;
        this.lastProgressUpdate = Date.now();
        this.onDidChangeTreeDataEmitter.fire(undefined);
      } else {
        this.modifiedLoading = false;
        this.modifiedProgress = 0;
        this.modifiedTotal = 0;
      }
      const existing = this.projectsStore.list();
      const projects = await this.scanner.scan(roots, maxDepth, existing);
      if ((sortMode === 'gitCommit' || sortMode === 'recentModified') && this.projects.length > 0) {
        const order = new Map(this.projects.map((project, index) => [project.id, index]));
        projects.sort((a, b) => {
          const aIndex = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
          const bIndex = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
          return aIndex - bIndex;
        });
      }
      await this.projectsStore.saveProjects(projects);
      this.projects = projects;
      this.favoriteIds = this.projectsStore.getFavoriteIds();
      this.updateDuplicateInfo(projects);
      this.onDidChangeTreeDataEmitter.fire(undefined);

      void this.hydrateIdentities(projects).then(async (updated) => {
        this.projects = updated;
        this.onDidChangeTreeDataEmitter.fire(undefined);
      });

      if (sortMode === 'gitCommit') {
        void this.hydrateGitCommits(projects).then(async (updated) => {
          this.projects = updated;
          this.onDidChangeTreeDataEmitter.fire(undefined);
        });
      }
      if (sortMode === 'recentModified') {
        void this.hydrateModifiedTimes(projects).then(async (updated) => {
          this.projects = updated;
          this.onDidChangeTreeDataEmitter.fire(undefined);
        });
      }
    } finally {
      this.isScanning = false;
      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        await this.refresh();
      }
    }
  }

  private maybeUpdateProgress(): void {
    const now = Date.now();
    const gitDone = this.gitCommitLoading && this.gitCommitProgress === this.gitCommitTotal;
    const modifiedDone = this.modifiedLoading && this.modifiedProgress === this.modifiedTotal;
    if (gitDone || modifiedDone || now - this.lastProgressUpdate > 500) {
      this.lastProgressUpdate = now;
      this.onDidChangeTreeDataEmitter.fire(undefined);
    }
  }

  private updateDuplicateInfo(projects: Project[]): void {
    this.duplicateInfo = buildDuplicateInfo(projects);
  }
}

class ProjectHintNode implements ProjectNode {
  public readonly id: string;

  public constructor(private readonly message: string, private readonly commandId: string) {
    this.id = treeId('projects-hint', message);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    return [];
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.message, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('info');
    item.contextValue = 'forgeflowHint';
    item.command = { command: this.commandId, title: this.message };
    return item;
  }
}

class ProjectGroupNode implements ProjectNode {
  public readonly id: string;

  public constructor(
    private readonly label: string,
    private readonly contextValue: string,
    private readonly projects: Project[],
    private readonly isFavoriteGroup: boolean,
    private readonly description?: string,
    private readonly duplicateInfo?: Map<string, DuplicateInfo>,
    private readonly summaries?: Record<string, GitProjectSummary>,
    private readonly showSummary?: boolean
  ) {
    this.id = treeId('projects-group', label);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    return this.projects.map((project) => new ProjectItemNode(
      project,
      this.isFavoriteGroup,
      this.duplicateInfo?.get(project.id),
      this.summaries?.[project.id],
      this.showSummary ?? false
    ));
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.label, vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = this.contextValue;
    item.iconPath = new vscode.ThemeIcon(this.isFavoriteGroup ? 'star-full' : 'folder-library');
    if (this.description) {
      item.description = this.description;
    }
    return item;
  }
}

class ProjectItemNode implements ProjectNode, ProjectNodeWithProject {
  public readonly id: string;

  public constructor(
    public readonly project: Project,
    private readonly isFavorite: boolean,
    private readonly duplicateInfo?: DuplicateInfo,
    private readonly summary?: GitProjectSummary,
    private readonly showSummary = false
  ) {
    this.id = treeId('project', project.id);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    return [
      new ProjectPinnedGroupNode(this.project),
      new ProjectEntryGroupNode(this.project),
      new ProjectBrowseGroupNode(this.project)
    ];
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.project.name, vscode.TreeItemCollapsibleState.Collapsed);
    item.resourceUri = vscode.Uri.file(this.project.path);
    item.contextValue = this.isFavorite ? 'forgeflowProjectFavorite' : 'forgeflowProject';
    item.description = formatProjectDescription(this.project.type, this.duplicateInfo, this.summary, this.showSummary);
    if (this.duplicateInfo) {
      item.tooltip = `${this.project.name}\n${this.project.path}\nDuplicate ${this.duplicateInfo.index + 1}/${this.duplicateInfo.total}`;
    } else if (this.summary && this.showSummary && this.project.type === 'git') {
      item.tooltip = `${this.project.name}\n${this.project.path}\n${formatSummaryTooltip(this.summary)}`;
    }
    return item;
  }
}

class ProjectPinnedGroupNode implements ProjectNode {
  public readonly id: string;

  public constructor(private readonly project: Project) {
    this.id = treeId('project-pinned-group', project.id);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    const children = await Promise.all(this.project.pinnedItems.map(async (itemPath) => {
      const stat = await statPath(itemPath);
      const type = stat?.type ?? vscode.FileType.Unknown;
      return new ProjectPinnedItemNode(this.project, itemPath, type);
    }));
    return children;
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem('Pinned Items', vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = 'forgeflowProjectPinnedGroup';
    item.iconPath = new vscode.ThemeIcon('pin');
    return item;
  }
}

class ProjectPinnedItemNode implements ProjectNode, ProjectNodeWithPath {
  public readonly id: string;

  public constructor(
    private readonly project: Project,
    public readonly path: string,
    private readonly entryType: vscode.FileType
  ) {
    this.id = treeId('project-pinned', path);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    if (this.entryType !== vscode.FileType.Directory) {
      return [];
    }
    return await readBrowseChildren(this.path, this.project);
  }

  public getTreeItem(): vscode.TreeItem {
    const label = baseName(this.path);
    const collapsible = this.entryType === vscode.FileType.Directory
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(label, collapsible);
    item.resourceUri = vscode.Uri.file(this.path);
    item.contextValue = 'forgeflowProjectPinned';
    if (this.entryType !== vscode.FileType.Directory) {
      item.command = {
        command: 'forgeflow.files.open',
        title: 'Open',
        arguments: [this.path]
      };
    }
    return item;
  }
}

class ProjectEntryGroupNode implements ProjectNode {
  public readonly id: string;

  public constructor(private readonly project: Project) {
    this.id = treeId('project-entry-group', project.id);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    const entries = await detectEntryPoints(this.project.path);
    return entries.map((entry) => new ProjectEntryNode(this.project, entry));
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem('Entry Points', vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = 'forgeflowProjectEntryGroup';
    item.iconPath = new vscode.ThemeIcon('symbol-event');
    return item;
  }
}

class ProjectEntryNode implements ProjectNode, ProjectNodeWithEntry {
  public readonly id: string;

  public constructor(project: Project, public readonly entry: ProjectEntryPoint) {
    this.id = treeId('project-entry', `${project.id}:${entry.path}`);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    return [];
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.entry.label, vscode.TreeItemCollapsibleState.None);
    item.resourceUri = vscode.Uri.file(this.entry.path);
    item.contextValue = 'forgeflowProjectEntry';
    item.command = {
      command: 'forgeflow.projects.openEntryPoint',
      title: 'Open Entry Point',
      arguments: [this.entry]
    };
    item.description = this.entry.kind;
    return item;
  }
}

class ProjectBrowseGroupNode implements ProjectNode {
  public readonly id: string;

  public constructor(private readonly project: Project) {
    this.id = treeId('project-browse-group', project.id);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    return await readBrowseChildren(this.project.path, this.project);
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem('Browse', vscode.TreeItemCollapsibleState.Collapsed);
    item.contextValue = 'forgeflowProjectBrowseGroup';
    item.iconPath = new vscode.ThemeIcon('files');
    return item;
  }
}

class ProjectBrowseNode implements ProjectNode, ProjectNodeWithPath {
  public readonly id: string;

  public constructor(
    private readonly project: Project,
    public readonly path: string,
    private readonly entryType: vscode.FileType
  ) {
    this.id = treeId('project-browse', `${project.id}:${path}`);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    if (this.entryType !== vscode.FileType.Directory) {
      return [];
    }
    return await readBrowseChildren(this.path, this.project);
  }

  public getTreeItem(): vscode.TreeItem {
    const label = baseName(this.path);
    const collapsible = this.entryType === vscode.FileType.Directory
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(label, collapsible);
    item.resourceUri = vscode.Uri.file(this.path);
    item.contextValue = 'forgeflowProjectBrowseItem';
    if (this.entryType !== vscode.FileType.Directory) {
      item.command = {
        command: 'forgeflow.files.open',
        title: 'Open',
        arguments: [this.path]
      };
    }
    return item;
  }
}

async function readBrowseChildren(folderPath: string, project: Project): Promise<ProjectNode[]> {
  const entries = await readDirectory(folderPath);
  const directories: ProjectNode[] = [];
  const files: ProjectNode[] = [];

  for (const [name, type] of entries) {
    if (name === '.git') {
      continue;
    }
    const entryPath = path.join(folderPath, name);
    const node = new ProjectBrowseNode(project, entryPath, type);
    if (type === vscode.FileType.Directory) {
      directories.push(node);
    } else {
      files.push(node);
    }
  }

  const byName = (a: ProjectNode, b: ProjectNode): number => {
    const aLabel = a.getTreeItem().label?.toString() ?? '';
    const bLabel = b.getTreeItem().label?.toString() ?? '';
    return aLabel.localeCompare(bLabel);
  };

  return [...directories.sort(byName), ...files.sort(byName)];
}

function sortProjects(
  projects: Project[],
  mode: ProjectSortMode,
  direction: SortDirection,
  fallbackToName = true
): Project[] {
  const indexed = projects.map((project, index) => ({ project, index }));
  indexed.sort((a, b) => {
    const dir = direction === 'asc' ? 1 : -1;
    const projectA = a.project;
    const projectB = b.project;
    if (mode === 'alphabetical') {
      return dir * projectA.name.localeCompare(projectB.name);
    }

    if (mode === 'recentModified') {
      const diff = (projectB.lastModified ?? 0) - (projectA.lastModified ?? 0);
      if (diff !== 0) {
        return dir * diff;
      }
      return fallbackToName ? dir * projectA.name.localeCompare(projectB.name) : a.index - b.index;
    }

    if (mode === 'lastActive') {
      const diff = (projectB.lastActivity ?? 0) - (projectA.lastActivity ?? 0);
      if (diff !== 0) {
        return dir * diff;
      }
      return fallbackToName ? dir * projectA.name.localeCompare(projectB.name) : a.index - b.index;
    }

    if (mode === 'gitCommit') {
      const diff = (projectB.lastGitCommit ?? 0) - (projectA.lastGitCommit ?? 0);
      if (diff !== 0) {
        return dir * diff;
      }
      return fallbackToName ? dir * projectA.name.localeCompare(projectB.name) : a.index - b.index;
    }

    const openedDiff = (projectB.lastOpened ?? 0) - (projectA.lastOpened ?? 0);
    if (openedDiff !== 0) {
      return dir * openedDiff;
    }
    const modifiedDiff = (projectB.lastModified ?? 0) - (projectA.lastModified ?? 0);
    if (modifiedDiff !== 0) {
      return dir * modifiedDiff;
    }
    return fallbackToName ? dir * projectA.name.localeCompare(projectB.name) : a.index - b.index;
  });
  return indexed.map((item) => item.project);
}

function getScanRoots(): string[] {
  const settings = getForgeFlowSettings();
  if (settings.projectScanRoots.length > 0) {
    return settings.projectScanRoots;
  }
  return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
}

interface DuplicateInfo {
  index: number;
  total: number;
  key: string;
}

function buildDuplicateInfo(projects: Project[]): Map<string, DuplicateInfo> {
  const byKey = new Map<string, Project[]>();
  for (const project of projects) {
    const key = buildProjectDuplicateKey(project);
    if (!key) {
      continue;
    }
    const list = byKey.get(key) ?? [];
    list.push(project);
    byKey.set(key, list);
  }

  const result = new Map<string, DuplicateInfo>();
  for (const [key, list] of byKey) {
    if (list.length < 2) {
      continue;
    }
    const sorted = [...list].sort((a, b) => a.path.localeCompare(b.path));
    sorted.forEach((project, index) => {
      result.set(project.id, { index, total: sorted.length, key });
    });
  }
  return result;
}

function buildProjectDuplicateKey(project: Project): string | undefined {
  const identity = project.identity;
  if (identity?.repositoryUrl) {
    return `url:${identity.repositoryUrl.toLowerCase()}`;
  }
  if (identity?.githubRepo) {
    return `gh:${identity.githubRepo.toLowerCase()}`;
  }
  if (identity?.repositoryProvider && identity?.repositoryPath) {
    return `${identity.repositoryProvider}:${identity.repositoryPath.toLowerCase()}`;
  }
  return undefined;
}

function formatProjectDescription(
  type: string,
  duplicate?: DuplicateInfo,
  summary?: GitProjectSummary,
  showSummary = false
): string {
  const parts: string[] = [type];
  if (showSummary && summary && type === 'git') {
    const summaryParts = formatSummaryParts(summary);
    if (summaryParts.length > 0) {
      parts.push(...summaryParts);
    } else {
      parts.push('clean');
    }
  }
  if (duplicate) {
    parts.push(`dup ${duplicate.index + 1}/${duplicate.total}`);
  }
  return parts.join(' • ');
}

function formatSummaryParts(summary: GitProjectSummary): string[] {
  const parts: string[] = [];
  if (summary.dirty) {
    parts.push('dirty');
  }
  if (summary.gone > 0) {
    parts.push(`gone:${summary.gone}`);
  }
  if (summary.merged > 0) {
    parts.push(`merged:${summary.merged}`);
  }
  if (summary.stale > 0) {
    parts.push(`stale:${summary.stale}`);
  }
  if (summary.noUpstream > 0) {
    parts.push(`no-up:${summary.noUpstream}`);
  }
  if (summary.aheadBehind > 0) {
    parts.push(`ahead:${summary.aheadBehind}`);
  }
  return parts;
}

function formatSummaryTooltip(summary: GitProjectSummary): string {
  const parts = [
    `Current: ${summary.currentBranch}`,
    `Dirty: ${summary.dirty ? 'Yes' : 'No'}`,
    `Gone: ${summary.gone}`,
    `Merged: ${summary.merged}`,
    `Stale: ${summary.stale}`,
    `No upstream: ${summary.noUpstream}`,
    `Ahead/Behind: ${summary.aheadBehind}`
  ];
  const updated = formatSummaryAge(summary.lastUpdated);
  parts.push(`Updated: ${updated}`);
  return parts.join('\n');
}

function formatSummaryAge(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return 'n/a';
  }
  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) {
    return 'just now';
  }
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function matchesProjectFilter(project: Project, filter: string): boolean {
  const haystack = [
    project.name,
    project.path,
    project.type,
    project.identity?.githubRepo,
    project.identity?.repositoryPath,
    project.identity?.repositoryUrl,
    project.identity?.powershellModule,
    project.identity?.nugetPackage,
    project.identity?.vscodeExtensionId
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(filter);
}

function buildSortDescription(
  projects: Project[],
  progress?: {
    gitCommit: { loading: boolean; progress: number; total: number };
    modified: { loading: boolean; progress: number; total: number };
  },
  filterText?: string
): string {
  const settings = getForgeFlowSettings();
  const modeLabel = getSortModeLabel(settings.projectSortMode);
  const directionLabel = settings.projectSortDirection === 'asc' ? 'ascending' : 'descending';
  let suffix = '';
  if (settings.projectSortMode === 'gitCommit') {
    if (progress?.gitCommit.loading) {
      const total = progress.gitCommit.total;
      const current = progress.gitCommit.progress;
      suffix = total > 0 ? ` (loading git commit data ${current}/${total})` : ' (loading git commit data...)';
    } else {
      const missing = projects.some((project) => project.type === 'git' && project.lastGitCommit === undefined);
      if (missing) {
        suffix = ' (loading git commit data...)';
      }
    }
  }
  if (settings.projectSortMode === 'recentModified') {
    if (progress?.modified.loading) {
      const total = progress.modified.total;
      const current = progress.modified.progress;
      suffix = total > 0 ? ` (loading modified times ${current}/${total})` : ' (loading modified times...)';
    }
  }
  const filterSuffix = filterText ? ` • filter: ${filterText}` : '';
  return `Sorted by ${modeLabel} (${directionLabel})${suffix}${filterSuffix}`;
}

function getSortModeLabel(mode: ProjectSortMode): string {
  switch (mode) {
    case 'recentOpened':
      return 'recently opened';
    case 'recentModified':
      return 'recently modified';
    case 'alphabetical':
      return 'alphabetical';
    case 'lastActive':
      return 'last active';
    case 'gitCommit':
      return 'git commit time';
    default:
      return 'custom';
  }
}

function needsRepositoryIdentity(identity: ProjectIdentity | undefined): boolean {
  if (!identity) {
    return true;
  }
  return !identity.repositoryUrl && !identity.repositoryProvider && !identity.repositoryPath && !identity.githubRepo;
}

function mergeIdentity(existing: ProjectIdentity | undefined, detected: ProjectIdentity): ProjectIdentity {
  if (!existing) {
    return detected;
  }
  return {
    repositoryUrl: existing.repositoryUrl ?? detected.repositoryUrl,
    repositoryProvider: existing.repositoryProvider ?? detected.repositoryProvider,
    repositoryPath: existing.repositoryPath ?? detected.repositoryPath,
    githubRepo: existing.githubRepo ?? detected.githubRepo,
    powershellModule: existing.powershellModule ?? detected.powershellModule,
    nugetPackage: existing.nugetPackage ?? detected.nugetPackage,
    vscodeExtensionId: existing.vscodeExtensionId ?? detected.vscodeExtensionId,
    vscodeExtensionVersion: existing.vscodeExtensionVersion ?? detected.vscodeExtensionVersion
  };
}
