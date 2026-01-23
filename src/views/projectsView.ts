import * as path from 'path';
import * as vscode from 'vscode';
import type { Project, ProjectEntryPoint, ProjectIdentity } from '../models/project';
import type { RunPreset } from '../models/run';
import type { RunHistoryEntry } from '../models/run';
import { detectEntryPointGroups, type EntryPointGroups } from '../scan/entryPointDetector';
import { detectProjectIdentity } from '../scan/identityDetector';
import { findRecentWriteTime } from '../scan/modifiedScanner';
import type { ProjectScanner } from '../scan/projectScanner';
import type { ProjectsStore, ProjectSortOrder } from '../store/projectsStore';
import type { TagsStore } from '../store/tagsStore';
import type { TagFilterStore } from '../store/tagFilterStore';
import type { RunHistoryStore } from '../store/runHistoryStore';
import { getForgeFlowSettings } from '../util/config';
import type { ForgeFlowSettings, ProjectSortMode, SortDirection } from '../util/config';
import { readDirectory, statPath } from '../util/fs';
import { treeId } from '../util/ids';
import { baseName } from '../util/path';
import { getLocalGitInfo } from '../dashboard/dataProviders';
import type { GitStore } from '../git/gitStore';
import type { GitProjectSummary } from '../git/gitSummary';
import { getGitHeadMtime } from '../git/gitHead';
import type { GitCommitCacheEntry } from '../store/gitCommitCacheStore';
import type { GitCommitCacheStore } from '../store/gitCommitCacheStore';
import { resolveProfileLabel } from '../run/powershellProfiles';
import { matchesFilterQuery } from '../util/filter';

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

export interface ProjectNodeWithPreset {
  readonly preset: RunPreset;
  readonly project: Project;
}

export interface ProjectNodeWithHistory {
  readonly entry: RunHistoryEntry;
  readonly project: Project;
}

export interface ProjectsWebviewProject {
  id: string;
  name: string;
  path: string;
  type: Project['type'];
  tags: string[];
  favorite: boolean;
  description: string;
  duplicate?: { index: number; total: number; key: string };
  summary?: GitProjectSummary;
  summaryTooltip?: string;
  identity?: ProjectIdentity;
  preferredRunProfileId?: string;
  preferredRunTarget?: Project['preferredRunTarget'];
  preferredRunWorkingDirectory?: string;
  lastOpened?: number;
  lastActivity?: number;
  lastModified?: number;
  lastGitCommit?: number;
}

export interface ProjectsWebviewTagCount {
  key: string;
  label: string;
  count: number;
  active: boolean;
}

export interface ProjectsWebviewSnapshot {
  updatedAt: number;
  filterText: string;
  tagFilter: string[];
  favoritesOnly: boolean;
  filterMinChars: number;
  filterMatchMode: ReturnType<typeof getForgeFlowSettings>['filtersMatchMode'];
  sortDescription: string;
  showSummary: boolean;
  pageSize: number;
  visibleCount: number;
  gitCommitLoading: boolean;
  gitCommitProgress: number;
  gitCommitTotal: number;
  modifiedLoading: boolean;
  modifiedProgress: number;
  modifiedTotal: number;
  projects: ProjectsWebviewProject[];
  tagCounts: ProjectsWebviewTagCount[];
}

export interface ProjectsWebviewEntry {
  key: string;
  label: string;
  path: string;
  kind: ProjectEntryPoint['kind'];
  source?: ProjectEntryPoint['source'];
  task?: ProjectEntryPoint['task'];
}

export interface ProjectsWebviewBrowseEntry {
  path: string;
  name: string;
  isDirectory: boolean;
}

export interface ProjectsWebviewPinnedItem {
  path: string;
  isDirectory: boolean;
}

export interface ProjectsWebviewDetails {
  projectId: string;
  pinnedItems: ProjectsWebviewPinnedItem[];
  entryPoints: ProjectsWebviewEntry[];
  buildScripts: ProjectsWebviewEntry[];
  recentRuns: RunHistoryEntry[];
  runPresets: RunPreset[];
  browseRoot: ProjectsWebviewBrowseEntry[];
}

export class ProjectsViewProvider implements vscode.TreeDataProvider<ProjectNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ProjectNode | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private readonly onDidUpdateProjectsEmitter = new vscode.EventEmitter<Project[]>();
  public readonly onDidUpdateProjects = this.onDidUpdateProjectsEmitter.event;

  private projects: Project[] = [];
  private favoriteIds: string[] = [];
  private duplicateInfo = new Map<string, DuplicateInfo>();
  private filterText = '';
  private tagFilter: string[] = [];
  private favoritesOnly = false;
  private visibleCount = 0;
  private isScanning = false;
  private pendingRefresh = false;
  private gitCommitLoading = false;
  private gitCommitProgress = 0;
  private gitCommitTotal = 0;
  private modifiedLoading = false;
  private modifiedProgress = 0;
  private modifiedTotal = 0;
  private lastProgressUpdate = 0;
  private scanVersion = 0;
  private entryPointCache = new Map<string, EntryPointCacheEntry>();
  private lastSortOrderSignature = '';

  public constructor(
    private readonly projectsStore: ProjectsStore,
    private readonly scanner: ProjectScanner,
    private readonly gitStore: GitStore,
    private readonly gitCommitCacheStore: GitCommitCacheStore,
    private readonly tagsStore: TagsStore,
    private readonly tagFilterStore: TagFilterStore,
    private readonly runHistoryStore: RunHistoryStore
  ) {
    this.filterText = projectsStore.getFilter();
    this.favoritesOnly = projectsStore.getFavoritesOnly();
    this.tagFilter = tagFilterStore.getFilter();
    void vscode.commands.executeCommand('setContext', 'forgeflow.projects.favoritesOnly', this.favoritesOnly);
    this.resetPaging();
  }

  public async refresh(force = false): Promise<void> {
    const settings = getForgeFlowSettings();
    const roots = getScanRoots();
    const existing = this.projectsStore.list();
    this.projects = applyStoredOrder(existing, this.projectsStore.getSortOrder(), settings);
    this.favoriteIds = this.projectsStore.getFavoriteIds();
    this.resetPaging();
    this.onDidUpdateProjectsEmitter.fire(this.projects);
    this.onDidChangeTreeDataEmitter.fire(undefined);

    if (this.isScanning) {
      this.pendingRefresh = true;
      return;
    }

    if (!force && shouldSkipScan(this.projectsStore.getScanMeta(), roots, settings.projectScanMaxDepth, settings.projectScanCacheMinutes)) {
      this.isScanning = false;
      return;
    }

    this.isScanning = true;
    void this.runScan(roots, settings.projectScanMaxDepth, settings.projectSortMode);
  }

  public getWebviewSnapshot(): ProjectsWebviewSnapshot {
    const settings = getForgeFlowSettings();
    const fallbackToName = !(
      (settings.projectSortMode === 'gitCommit' && this.gitCommitLoading)
      || (settings.projectSortMode === 'recentModified' && this.modifiedLoading)
    );
    const sorted = sortProjects(this.projects, settings.projectSortMode, settings.projectSortDirection, fallbackToName);
    const favorites = new Set(this.favoriteIds);
    const summaries = this.gitStore.getSummaries();
    const showSummary = settings.gitShowProjectSummary;
    const tagCounts = collectTagCounts(this.tagsStore, sorted.map((project) => project.id));
    const activeTagKeys = new Set(this.tagFilter.map((tag) => tag.toLowerCase()));
    const tagEntries = Array.from(tagCounts.values())
      .map((entry) => ({
        key: entry.key,
        label: entry.label,
        count: entry.count,
        active: activeTagKeys.has(entry.key)
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const sortDescription = buildSortDescription(
      sorted,
      {
        gitCommit: { loading: this.gitCommitLoading, progress: this.gitCommitProgress, total: this.gitCommitTotal },
        modified: { loading: this.modifiedLoading, progress: this.modifiedProgress, total: this.modifiedTotal }
      },
      this.filterText,
      this.tagFilter
    );

    return {
      updatedAt: Date.now(),
      filterText: this.filterText,
      tagFilter: [...this.tagFilter],
      favoritesOnly: this.favoritesOnly,
      filterMinChars: settings.filtersProjectsMinChars,
      filterMatchMode: settings.filtersMatchMode,
      sortDescription,
      showSummary,
      pageSize: settings.projectPageSize,
      visibleCount: this.visibleCount,
      gitCommitLoading: this.gitCommitLoading,
      gitCommitProgress: this.gitCommitProgress,
      gitCommitTotal: this.gitCommitTotal,
      modifiedLoading: this.modifiedLoading,
      modifiedProgress: this.modifiedProgress,
      modifiedTotal: this.modifiedTotal,
      projects: sorted.map((project) => {
        const tags = this.tagsStore.getTags(project.id);
        const duplicate = this.duplicateInfo.get(project.id);
        const summary = summaries[project.id];
        const description = formatProjectDescription(project.type, duplicate, summary, showSummary, tags);
        const summaryTooltip = summary && showSummary && project.type === 'git'
          ? formatSummaryTooltip(summary)
          : undefined;
        return {
          id: project.id,
          name: project.name,
          path: project.path,
          type: project.type,
          tags,
          favorite: favorites.has(project.id),
          description,
          duplicate: duplicate ? { index: duplicate.index, total: duplicate.total, key: duplicate.key } : undefined,
          summary,
          summaryTooltip,
          identity: project.identity,
          preferredRunProfileId: project.preferredRunProfileId,
          preferredRunTarget: project.preferredRunTarget,
          preferredRunWorkingDirectory: project.preferredRunWorkingDirectory,
          lastOpened: project.lastOpened,
          lastActivity: project.lastActivity,
          lastModified: project.lastModified,
          lastGitCommit: project.lastGitCommit
        };
      }),
      tagCounts: tagEntries
    };
  }

  public async getWebviewProjectDetails(projectId: string): Promise<ProjectsWebviewDetails | undefined> {
    const project = this.projects.find((item) => item.id === projectId);
    if (!project) {
      return undefined;
    }
    const groups = await this.getEntryPointGroups(project);
    const pinnedItems = await Promise.all(project.pinnedItems.map(async (itemPath) => {
      const stat = await statPath(itemPath);
      return {
        path: itemPath,
        isDirectory: stat?.type === vscode.FileType.Directory
      };
    }));
    const recentRuns = this.getRecentRuns(project);
    const runPresets = project.runPresets ?? [];
    const browseRoot = await readBrowseEntries(project.path);
    return {
      projectId: project.id,
      pinnedItems,
      entryPoints: groups.entryPoints.map((entry) => toWebviewEntry(entry)),
      buildScripts: groups.buildScripts.map((entry) => toWebviewEntry(entry)),
      recentRuns,
      runPresets,
      browseRoot
    };
  }

  public async getWebviewBrowseEntries(projectId: string, folderPath: string): Promise<ProjectsWebviewBrowseEntry[] | undefined> {
    const project = this.projects.find((item) => item.id === projectId);
    if (!project) {
      return undefined;
    }
    if (!isPathUnderRoot(project.path, folderPath)) {
      return undefined;
    }
    return await readBrowseEntries(folderPath);
  }

  public setFilter(text: string): void {
    this.filterText = text.trim();
    void this.projectsStore.setFilter(this.filterText);
    this.resetPaging();
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTagFilter(): string[] {
    return [...this.tagFilter];
  }

  public async setTagFilter(tags: string[], persist = true): Promise<void> {
    this.tagFilter = normalizeTagFilter(tags);
    if (persist) {
      await this.tagFilterStore.setFilter(this.tagFilter);
    }
    this.resetPaging();
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public async toggleTagFilter(tag: string): Promise<void> {
    const normalized = tag.trim();
    if (!normalized) {
      return;
    }
    const lower = normalized.toLowerCase();
    const next = this.tagFilter.some((item) => item.toLowerCase() === lower)
      ? this.tagFilter.filter((item) => item.toLowerCase() !== lower)
      : [...this.tagFilter, normalized];
    await this.setTagFilter(next);
  }

  public async toggleFavoritesOnly(): Promise<void> {
    this.favoritesOnly = !this.favoritesOnly;
    await this.projectsStore.setFavoritesOnly(this.favoritesOnly);
    await vscode.commands.executeCommand('setContext', 'forgeflow.projects.favoritesOnly', this.favoritesOnly);
    this.resetPaging();
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public loadMore(): void {
    const settings = getForgeFlowSettings();
    const pageSize = settings.projectPageSize;
    if (pageSize <= 0) {
      return;
    }
    this.visibleCount += pageSize;
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
      const projectIds = this.projects.map((project) => project.id);
      const tagCounts = collectTagCounts(this.tagsStore, projectIds);
      const showTagsNode = this.tagFilter.length > 0 || tagCounts.size > 0;
      const tagsNode = showTagsNode
        ? new ProjectTagFilterNode(this.tagFilter, this.tagsStore, projectIds)
        : undefined;
      const roots = getScanRoots();
      if (roots.length === 0) {
        return [
          ...(tagsNode ? [tagsNode] : []),
          new ProjectHintNode('Select project roots to scan', 'forgeflow.projects.configureOrRefresh')
        ];
      }
      if (this.isScanning) {
        return [
          ...(tagsNode ? [tagsNode] : []),
          new ProjectHintNode('Scanning projects...', 'forgeflow.projects.refresh'),
          ...this.getRootGroups()
        ];
      }
      if (this.gitCommitLoading) {
        const label = this.gitCommitTotal > 0
          ? `Loading git commit data (${this.gitCommitProgress}/${this.gitCommitTotal})...`
          : 'Loading git commit data...';
        return [
          ...(tagsNode ? [tagsNode] : []),
          new ProjectHintNode(label, 'forgeflow.projects.refresh'),
          ...this.getRootGroups()
        ];
      }
      if (this.modifiedLoading) {
        const label = this.modifiedTotal > 0
          ? `Loading modified times (${this.modifiedProgress}/${this.modifiedTotal})...`
          : 'Loading modified times...';
        return [
          ...(tagsNode ? [tagsNode] : []),
          new ProjectHintNode(label, 'forgeflow.projects.refresh'),
          ...this.getRootGroups()
        ];
      }
      if (this.projects.length === 0) {
        return [
          ...(tagsNode ? [tagsNode] : []),
          new ProjectHintNode('No projects found. Refresh or adjust scan roots.', 'forgeflow.projects.configureOrRefresh')
        ];
      }
      const minChars = getForgeFlowSettings().filtersProjectsMinChars;
      const trimmedFilter = this.filterText.trim();
      const hasTextFilter = trimmedFilter.length >= minChars;
      const filteredProjects = this.getFilteredProjects(this.projects);
      if (trimmedFilter && !hasTextFilter) {
        return [
          ...(tagsNode ? [tagsNode] : []),
          new ProjectHintNode(`Filter needs at least ${minChars} characters.`, 'forgeflow.projects.filter'),
          ...this.getRootGroups()
        ];
      }
      if ((trimmedFilter || this.tagFilter.length > 0) && filteredProjects.length === 0) {
        const hint = trimmedFilter
          ? `No projects match filter: ${trimmedFilter}`
          : 'No projects match selected tags.';
        return [
          ...(tagsNode ? [tagsNode] : []),
          new ProjectHintNode(hint, 'forgeflow.projects.clearFilter')
        ];
      }
      return [...(tagsNode ? [tagsNode] : []), ...this.getRootGroups()];
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

  private getOtherProjects(): { items: Project[]; total: number } {
    const favorites = new Set(this.favoriteIds);
    const others = this.projects.filter((project) => !favorites.has(project.id));
    const settings = getForgeFlowSettings();
    const filtered = this.getFilteredProjects(others);
    const fallbackToName = !(
      (settings.projectSortMode === 'gitCommit' && this.gitCommitLoading)
      || (settings.projectSortMode === 'recentModified' && this.modifiedLoading)
    );
    const sorted = sortProjects(filtered, settings.projectSortMode, settings.projectSortDirection, fallbackToName);
    if (this.favoritesOnly) {
      return { items: [], total: sorted.length };
    }
    const pageSize = settings.projectPageSize;
    if (pageSize > 0 && this.visibleCount > 0 && sorted.length > this.visibleCount) {
      return { items: sorted.slice(0, this.visibleCount), total: sorted.length };
    }
    return { items: sorted, total: sorted.length };
  }

  private getRootGroups(): ProjectNode[] {
    const favorites = this.getFavoriteProjects();
    const othersResult = this.getOtherProjects();
    const others = othersResult.items;
    const summaries = this.gitStore.getSummaries();
    const showSummary = getForgeFlowSettings().gitShowProjectSummary;
    const sortDescription = buildSortDescription(others, {
      gitCommit: { loading: this.gitCommitLoading, progress: this.gitCommitProgress, total: this.gitCommitTotal },
      modified: { loading: this.modifiedLoading, progress: this.modifiedProgress, total: this.modifiedTotal }
    }, this.filterText, this.tagFilter);
    const groups: ProjectNode[] = [];
    if (!this.favoritesOnly) {
      groups.push(new ProjectGroupNode(
        'Favorite Projects',
        'forgeflowGroup',
        favorites,
        true,
        undefined,
        this.duplicateInfo,
        summaries,
        showSummary,
        undefined,
        (project) => this.getEntryPointGroups(project),
        (projectId) => this.tagsStore.getTags(projectId),
        (project) => this.getRecentRuns(project)
      ));
    } else {
      const label = favorites.length === 0 ? 'Favorite Projects (none)' : 'Favorite Projects';
      groups.push(new ProjectGroupNode(
        label,
        'forgeflowGroup',
        favorites,
        true,
        undefined,
        this.duplicateInfo,
        summaries,
        showSummary,
        undefined,
        (project) => this.getEntryPointGroups(project),
        (projectId) => this.tagsStore.getTags(projectId),
        (project) => this.getRecentRuns(project)
      ));
    }
    if (!this.favoritesOnly) {
      const tailNodes: ProjectNode[] = [];
      if (shouldShowLoadMore(othersResult.total, others.length)) {
        tailNodes.push(new ProjectLoadMoreNode(others.length, othersResult.total));
      }
      groups.push(new ProjectGroupNode(
        'Projects',
        'forgeflowGroup',
        others,
        false,
        sortDescription,
        this.duplicateInfo,
        summaries,
        showSummary,
        tailNodes,
        (project) => this.getEntryPointGroups(project),
        (projectId) => this.tagsStore.getTags(projectId),
        (project) => this.getRecentRuns(project)
      ));
    }
    return groups;
  }

  private getFilteredProjects(projects: Project[]): Project[] {
    const filterRaw = this.filterText.trim();
    const minChars = getForgeFlowSettings().filtersProjectsMinChars;
    const hasTextFilter = filterRaw.length >= minChars;
    const hasTagFilter = this.tagFilter.length > 0;
    if (!hasTextFilter && !hasTagFilter) {
      return projects;
    }
    return projects.filter((project) => {
      const tags = this.tagsStore.getTags(project.id);
      if (!matchesTagFilter(tags, this.tagFilter)) {
        return false;
      }
      if (!hasTextFilter) {
        return true;
      }
      return matchesProjectFilter(project, filterRaw, tags);
    });
  }

  private async hydrateIdentities(projects: Project[], runId: number): Promise<Project[]> {
    const results: Project[] = [];
    for (const project of projects) {
      if (runId !== this.scanVersion) {
        return results;
      }
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

  private async hydrateGitCommits(projects: Project[], runId: number): Promise<Project[]> {
    const results: Project[] = [];
    const settings = getForgeFlowSettings();
    const ttlMs = Math.max(0, settings.projectGitCommitCacheMinutes) * 60_000;
    const now = Date.now();
    const cache = this.gitCommitCacheStore.getAll();
    const pending: Array<{ project: Project; index: number; headMtime?: number }> = [];

    for (const project of projects) {
      if (runId !== this.scanVersion) {
        return results;
      }
      if (project.type !== 'git') {
        results.push(project);
        continue;
      }
      const cacheEntry = cache[project.id];
      let headMtime: number | undefined;
      let needsRefresh = shouldRefreshGitCommit(cacheEntry, ttlMs, now);
      if (!needsRefresh) {
        headMtime = await getGitHeadMtime(project.path);
        needsRefresh = shouldRefreshGitCommitWithHead(cacheEntry, ttlMs, now, headMtime);
      }

      const cachedCommit = cacheEntry?.lastCommit ?? project.lastGitCommit;
      const baseProject = cachedCommit === project.lastGitCommit ? project : { ...project, lastGitCommit: cachedCommit };
      const index = results.push(baseProject) - 1;

      if (needsRefresh) {
        pending.push({ project: baseProject, index, headMtime });
      } else if (baseProject !== project) {
        await this.projectsStore.updateProject(baseProject);
      }
    }

    this.gitCommitTotal = pending.length;
    this.gitCommitProgress = 0;
    this.gitCommitLoading = pending.length > 0;
    if (this.gitCommitLoading) {
      this.lastProgressUpdate = Date.now();
      this.onDidChangeTreeDataEmitter.fire(undefined);
    }

    for (const entry of pending) {
      if (runId !== this.scanVersion) {
        return results;
      }
      const headMtime = entry.headMtime ?? await getGitHeadMtime(entry.project.path);
      if (runId !== this.scanVersion) {
        return results;
      }
      const gitInfo = await getLocalGitInfo(entry.project.path);
      if (runId !== this.scanVersion) {
        return results;
      }
      const lastCommit = gitInfo?.lastCommit ? Date.parse(gitInfo.lastCommit) : undefined;
      const lastGitCommit = Number.isNaN(lastCommit ?? NaN) ? undefined : lastCommit;
      const updated = { ...entry.project, lastGitCommit };
      await this.projectsStore.updateProject(updated);
      cache[entry.project.id] = {
        projectId: entry.project.id,
        path: entry.project.path,
        lastCommit: lastGitCommit,
        headMtime,
        fetchedAt: Date.now()
      };
      results[entry.index] = updated;
      this.gitCommitProgress = Math.min(this.gitCommitProgress + 1, this.gitCommitTotal);
      this.maybeUpdateProgress();
    }

    if (pending.length > 0) {
      await this.gitCommitCacheStore.saveAll(cache);
    }
    if (runId === this.scanVersion) {
      this.gitCommitLoading = false;
      this.gitCommitProgress = this.gitCommitTotal;
      this.onDidChangeTreeDataEmitter.fire(undefined);
      this.updateDuplicateInfo(results);
    }
    return results;
  }

  private async hydrateModifiedTimes(projects: Project[], runId: number): Promise<Project[]> {
    const results: Project[] = [];
    const settings = getForgeFlowSettings();
    this.modifiedTotal = projects.length;
    this.modifiedProgress = 0;
    this.modifiedLoading = true;
    this.lastProgressUpdate = Date.now();
    this.onDidChangeTreeDataEmitter.fire(undefined);

    for (const project of projects) {
      if (runId !== this.scanVersion) {
        return results;
      }
      const recent = await findRecentWriteTime(project.path, settings.projectModifiedScanDepth);
      if (runId !== this.scanVersion) {
        return results;
      }
      const lastModified = recent ?? project.lastModified;
      const updated = { ...project, lastModified };
      await this.projectsStore.updateProject(updated);
      results.push(updated);
      this.modifiedProgress = Math.min(this.modifiedProgress + 1, this.modifiedTotal);
      this.maybeUpdateProgress();
    }

    if (runId === this.scanVersion) {
      this.modifiedLoading = false;
      this.modifiedProgress = this.modifiedTotal;
      this.onDidChangeTreeDataEmitter.fire(undefined);
      this.updateDuplicateInfo(results);
    }
    return results;
  }

  private async runScan(roots: string[], maxDepth: number, sortMode: ProjectSortMode): Promise<void> {
    const runId = ++this.scanVersion;
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
      await this.projectsStore.setScanMeta({ roots: [...roots], maxDepth, fetchedAt: Date.now() });
      this.projects = projects;
      this.favoriteIds = this.projectsStore.getFavoriteIds();
      this.resetPaging();
      this.updateDuplicateInfo(projects);
      this.maybePersistSortOrder();
      this.onDidUpdateProjectsEmitter.fire(this.projects);
      this.onDidChangeTreeDataEmitter.fire(undefined);

      void this.hydrateIdentities(projects, runId).then(async (updated) => {
        if (runId !== this.scanVersion) {
          return;
        }
        this.projects = updated;
        this.maybePersistSortOrder();
        this.onDidChangeTreeDataEmitter.fire(undefined);
      });

      if (sortMode === 'gitCommit') {
        void this.hydrateGitCommits(projects, runId).then(async (updated) => {
        if (runId !== this.scanVersion) {
          return;
        }
        this.projects = updated;
        this.maybePersistSortOrder();
        this.onDidChangeTreeDataEmitter.fire(undefined);
      });
      }
      if (sortMode === 'recentModified') {
        void this.hydrateModifiedTimes(projects, runId).then(async (updated) => {
        if (runId !== this.scanVersion) {
          return;
        }
        this.projects = updated;
        this.maybePersistSortOrder();
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

  public invalidateEntryPointCache(projectId?: string): void {
    if (!projectId) {
      this.entryPointCache.clear();
      return;
    }
    this.entryPointCache.delete(projectId);
  }

  public async getEntryPointGroups(project: Project): Promise<EntryPointGroups> {
    const settings = getForgeFlowSettings();
    const cacheMinutes = settings.projectEntryPointCacheMinutes;
    const cacheMs = cacheMinutes > 0 ? cacheMinutes * 60_000 : 0;
    const cacheKey = buildEntryPointCacheKey(project, settings);
    const cached = this.entryPointCache.get(project.id);
    if (cacheMs > 0 && cached && cached.key === cacheKey && Date.now() - cached.fetchedAt < cacheMs) {
      return cached.groups;
    }
    const groups = await detectEntryPointGroups(project.path, {
      maxDepth: settings.projectEntryPointScanDepth,
      preferredFolders: settings.projectEntryPointPreferredFolders,
      fileNames: settings.projectEntryPointFileNames,
      maxCount: settings.projectEntryPointMaxCount,
      customPaths: project.entryPointOverrides
    });
    if (cacheMs > 0) {
      this.entryPointCache.set(project.id, { key: cacheKey, fetchedAt: Date.now(), groups });
    }
    return groups;
  }

  public applyGitCommitUpdate(projectId: string, lastGitCommit?: number): void {
    const index = this.projects.findIndex((project) => project.id === projectId);
    if (index === -1) {
      return;
    }
    const existing = this.projects[index];
    if (!existing) {
      return;
    }
    if (existing.lastGitCommit === lastGitCommit) {
      return;
    }
    this.projects[index] = { ...existing, lastGitCommit };
    this.maybePersistSortOrder();
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  private resetPaging(): void {
    const settings = getForgeFlowSettings();
    const pageSize = settings.projectPageSize;
    this.visibleCount = pageSize > 0 ? pageSize : Number.MAX_SAFE_INTEGER;
  }

  private getRecentRuns(project: Project): RunHistoryEntry[] {
    const settings = getForgeFlowSettings();
    const maxItems = Math.max(1, settings.runHistoryPerProjectMaxItems ?? 6);
    return this.runHistoryStore.listForProject(project.id, maxItems, settings.runHistoryPerProjectSortMode);
  }

  private maybePersistSortOrder(): void {
    const settings = getForgeFlowSettings();
    if (settings.projectSortMode === 'gitCommit' && this.gitCommitLoading) {
      return;
    }
    if (settings.projectSortMode === 'recentModified' && this.modifiedLoading) {
      return;
    }
    const sorted = sortProjects(this.projects, settings.projectSortMode, settings.projectSortDirection, true);
    const ids = sorted.map((project) => project.id);
    const signature = `${settings.projectSortMode}:${settings.projectSortDirection}:${ids.join('|')}`;
    if (signature === this.lastSortOrderSignature) {
      return;
    }
    this.lastSortOrderSignature = signature;
    void this.projectsStore.setSortOrder({
      mode: settings.projectSortMode,
      direction: settings.projectSortDirection,
      ids,
      savedAt: Date.now()
    });
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

class ProjectTagFilterNode implements ProjectNode {
  public readonly id: string;

  public constructor(
    private readonly activeTags: string[],
    private readonly tagsStore: TagsStore,
    private readonly projectIds: string[]
  ) {
    this.id = treeId('projects-tags-filter', activeTags.join('|') || 'empty');
  }

  public async getChildren(): Promise<ProjectNode[]> {
    const counts = collectTagCounts(this.tagsStore, this.projectIds);
    const tags = Array.from(counts.values()).sort((a, b) => a.label.localeCompare(b.label));
    const nodes: ProjectNode[] = [];
    if (this.activeTags.length > 0) {
      nodes.push(new ProjectTagClearNode());
    }
    if (tags.length === 0) {
      nodes.push(new ProjectHintNode('No tags found. Add tags to projects to enable filters.', 'forgeflow.projects.setTags'));
      return nodes;
    }
    for (const entry of tags) {
      const isActive = this.activeTags.some((item) => item.toLowerCase() === entry.key);
      nodes.push(new ProjectTagItemNode(entry.label, entry.count, isActive));
    }
    return nodes;
  }

  public getTreeItem(): vscode.TreeItem {
    const label = this.activeTags.length > 0 ? `Tags (${this.activeTags.length})` : 'Tags';
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = 'forgeflowTagFilterRoot';
    item.iconPath = new vscode.ThemeIcon('tag');
    if (this.activeTags.length > 0) {
      item.description = this.activeTags.join(', ');
    } else {
      item.description = 'All';
    }
    return item;
  }
}

class ProjectTagItemNode implements ProjectNode {
  public readonly id: string;

  public constructor(
    private readonly tag: string,
    private readonly count: number,
    private readonly active: boolean
  ) {
    this.id = treeId('projects-tag', tag);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    return [];
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.tag, vscode.TreeItemCollapsibleState.None);
    item.contextValue = this.active ? 'forgeflowTagFilterActive' : 'forgeflowTagFilter';
    item.iconPath = new vscode.ThemeIcon(this.active ? 'check' : 'tag');
    item.description = String(this.count);
    item.command = { command: 'forgeflow.tags.toggleFilter', title: 'Toggle tag filter', arguments: [this.tag] };
    return item;
  }
}

class ProjectTagClearNode implements ProjectNode {
  public readonly id = treeId('projects-tags-clear', 'clear');

  public async getChildren(): Promise<ProjectNode[]> {
    return [];
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem('Clear tag filters', vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'forgeflowTagFilterClear';
    item.iconPath = new vscode.ThemeIcon('clear-all');
    item.command = { command: 'forgeflow.tags.clearFilter', title: 'Clear tag filters' };
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
    private readonly showSummary?: boolean,
    private readonly tailNodes: ProjectNode[] = [],
    private readonly entryPointResolver?: (project: Project) => Promise<EntryPointGroups>,
    private readonly tagsResolver?: (projectId: string) => string[],
    private readonly historyResolver?: (project: Project) => RunHistoryEntry[]
  ) {
    this.id = treeId('projects-group', label);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    const nodes = this.projects.map((project) => new ProjectItemNode(
      project,
      this.isFavoriteGroup,
      this.duplicateInfo?.get(project.id),
      this.summaries?.[project.id],
      this.showSummary ?? false,
      this.entryPointResolver,
      this.tagsResolver?.(project.id) ?? [],
      this.historyResolver?.(project) ?? []
    ));
    return [...nodes, ...this.tailNodes];
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

class ProjectLoadMoreNode implements ProjectNode {
  public readonly id: string;

  public constructor(private readonly visible: number, private readonly total: number) {
    this.id = treeId('projects-load-more', `${visible}:${total}`);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    return [];
  }

  public getTreeItem(): vscode.TreeItem {
    const remaining = Math.max(0, this.total - this.visible);
    const label = remaining > 0
      ? `Load more projects (${this.visible}/${this.total})`
      : `All projects shown (${this.total})`;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'forgeflowProjectLoadMore';
    item.iconPath = new vscode.ThemeIcon('more');
    if (remaining > 0) {
      item.command = { command: 'forgeflow.projects.loadMore', title: 'Load more projects' };
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
    private readonly showSummary = false,
    private readonly entryPointResolver?: (project: Project) => Promise<EntryPointGroups>,
    private readonly tags: string[] = [],
    private readonly recentRuns: RunHistoryEntry[] = []
  ) {
    this.id = treeId('project', project.id);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    const groups = this.entryPointResolver
      ? await this.entryPointResolver(this.project)
      : await detectEntryPointGroups(this.project.path, {
        maxDepth: getForgeFlowSettings().projectEntryPointScanDepth,
        preferredFolders: getForgeFlowSettings().projectEntryPointPreferredFolders,
        fileNames: getForgeFlowSettings().projectEntryPointFileNames,
        maxCount: getForgeFlowSettings().projectEntryPointMaxCount,
        customPaths: this.project.entryPointOverrides
      });
    const children: ProjectNode[] = [new ProjectPinnedGroupNode(this.project)];
    if (this.recentRuns.length > 0) {
      children.push(new ProjectRecentRunsGroupNode(this.project, this.recentRuns));
    }
    if (this.project.runPresets && this.project.runPresets.length > 0) {
      children.push(new ProjectRunPresetGroupNode(this.project, this.project.runPresets));
    }
    if (groups.buildScripts.length > 0) {
      children.push(new ProjectBuildGroupNode(this.project, groups.buildScripts));
    }
    children.push(new ProjectEntryGroupNode(this.project, groups.entryPoints));
    children.push(new ProjectBrowseGroupNode(this.project));
    return children;
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.project.name, vscode.TreeItemCollapsibleState.Collapsed);
    item.resourceUri = vscode.Uri.file(this.project.path);
    item.contextValue = this.isFavorite ? 'forgeflowProjectFavorite' : 'forgeflowProject';
    item.description = formatProjectDescription(this.project.type, this.duplicateInfo, this.summary, this.showSummary, this.tags);
    let tooltip = '';
    if (this.duplicateInfo) {
      tooltip = `${this.project.name}\n${this.project.path}\nDuplicate ${this.duplicateInfo.index + 1}/${this.duplicateInfo.total}`;
    } else if (this.summary && this.showSummary && this.project.type === 'git') {
      tooltip = `${this.project.name}\n${this.project.path}\n${formatSummaryTooltip(this.summary)}`;
    } else {
      tooltip = `${this.project.name}\n${this.project.path}`;
    }
    if (this.tags.length > 0) {
      tooltip = `${tooltip}\nTags: ${this.tags.join(', ')}`;
    }
    const profileLabel = resolveProjectProfileLabel(this.project);
    if (profileLabel) {
      tooltip = tooltip ? `${tooltip}\nRun profile: ${profileLabel}` : `Run profile: ${profileLabel}`;
    }
    if (this.project.preferredRunTarget) {
      tooltip = tooltip ? `${tooltip}\nRun target: ${this.project.preferredRunTarget}` : `Run target: ${this.project.preferredRunTarget}`;
    }
    if (this.project.preferredRunWorkingDirectory) {
      tooltip = tooltip
        ? `${tooltip}\nRun cwd: ${this.project.preferredRunWorkingDirectory}`
        : `Run cwd: ${this.project.preferredRunWorkingDirectory}`;
    }
    if (tooltip) {
      item.tooltip = tooltip;
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
    const profileLabel = resolveProjectProfileLabel(this.project);
    if (profileLabel && isPowerShellPath(this.path)) {
      item.description = profileLabel;
    }
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

class ProjectBuildGroupNode implements ProjectNode {
  public readonly id: string;

  public constructor(private readonly project: Project, private readonly entries: ProjectEntryPoint[]) {
    this.id = treeId('project-build-group', project.id);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    return this.entries.map((entry) => new ProjectEntryNode(this.project, entry));
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem('Build Scripts', vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = 'forgeflowProjectBuildGroup';
    item.iconPath = new vscode.ThemeIcon('tools');
    return item;
  }
}

export class ProjectRecentRunsGroupNode implements ProjectNode, ProjectNodeWithProject {
  public readonly id: string;

  public constructor(public readonly project: Project, private readonly entries: RunHistoryEntry[]) {
    this.id = treeId('project-run-history', project.id);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    return this.entries.map((entry) => new ProjectRecentRunNode(this.project, entry));
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem('Recent Runs', vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = 'forgeflowProjectRunHistoryGroup';
    item.iconPath = new vscode.ThemeIcon('history');
    item.description = String(this.entries.length);
    return item;
  }
}

export class ProjectRecentRunNode implements ProjectNode, ProjectNodeWithHistory {
  public readonly id: string;
  public readonly entry: RunHistoryEntry;
  public readonly project: Project;

  public constructor(project: Project, entry: RunHistoryEntry) {
    this.project = project;
    this.entry = entry;
    this.id = treeId('project-run-history-entry', `${project.id}:${entry.id}`);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    return [];
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.entry.label, vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'forgeflowProjectRunHistory';
    const detail = formatHistoryLabel(this.entry);
    const profileLabel = this.entry.profileId
      ? resolveProfileLabel(this.entry.profileId, getForgeFlowSettings().powershellProfiles)
      : undefined;
    if (detail && profileLabel) {
      item.description = `${detail} • ${profileLabel}`;
    } else if (detail) {
      item.description = detail;
    } else if (profileLabel) {
      item.description = profileLabel;
    }
    item.command = {
      command: 'forgeflow.projects.runHistoryItem',
      title: 'Run Recent',
      arguments: [this.entry, this.project]
    };
    item.iconPath = historyIconForEntry(this.entry);
    const tooltipParts: string[] = [this.entry.label];
    if (this.entry.filePath) {
      tooltipParts.push(this.entry.filePath);
    } else if (this.entry.command) {
      tooltipParts.push(this.entry.command);
    }
    if (this.entry.workingDirectory) {
      tooltipParts.push(`cwd: ${this.entry.workingDirectory}`);
    }
    if (tooltipParts.length > 0) {
      item.tooltip = tooltipParts.join('\n');
    }
    return item;
  }
}

export class ProjectRunPresetGroupNode implements ProjectNode {
  public readonly id: string;

  public constructor(private readonly project: Project, private readonly presets: RunPreset[]) {
    this.id = treeId('project-run-presets', project.id);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    return this.presets.map((preset) => new ProjectRunPresetNode(this.project, preset));
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem('Run Presets', vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = 'forgeflowProjectRunPresetGroup';
    item.iconPath = new vscode.ThemeIcon('play-circle');
    return item;
  }
}

export class ProjectRunPresetNode implements ProjectNode, ProjectNodeWithPreset {
  public readonly id: string;
  public readonly preset: RunPreset;
  public readonly project: Project;

  public constructor(project: Project, preset: RunPreset) {
    this.project = project;
    this.preset = preset;
    this.id = treeId('project-run-preset', `${project.id}:${preset.id}`);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    return [];
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.preset.label, vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'forgeflowProjectRunPreset';
    const detail = formatPresetLabel(this.preset);
    if (detail) {
      item.description = detail;
    }
    item.command = {
      command: 'forgeflow.projects.runPresetItem',
      title: 'Run Preset',
      arguments: [this.preset, this.project]
    };
    item.iconPath = new vscode.ThemeIcon('play');
    return item;
  }
}

class ProjectEntryGroupNode implements ProjectNode {
  public readonly id: string;

  public constructor(private readonly project: Project, private readonly entries: ProjectEntryPoint[]) {
    this.id = treeId('project-entry-group', project.id);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    return this.entries.map((entry) => new ProjectEntryNode(this.project, entry));
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

  public constructor(private readonly project: Project, public readonly entry: ProjectEntryPoint) {
    this.id = treeId('project-entry', `${project.id}:${entry.kind}:${entry.path}:${entry.label}`);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    return [];
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.entry.label, vscode.TreeItemCollapsibleState.None);
    if (this.entry.kind !== 'task') {
      item.resourceUri = vscode.Uri.file(this.entry.path);
    }
    item.contextValue = this.entry.kind === 'task' ? 'forgeflowProjectTaskEntry' : 'forgeflowProjectEntry';
    item.command = {
      command: this.entry.kind === 'task' ? 'forgeflow.projects.runTask' : 'forgeflow.projects.openEntryPoint',
      title: this.entry.kind === 'task' ? 'Run Task' : 'Open Entry Point',
      arguments: [this.entry, this.project]
    };
    if (this.entry.kind === 'task') {
      item.iconPath = new vscode.ThemeIcon('checklist');
    }
    const profileLabel = resolveProjectProfileLabel(this.project);
    if (this.entry.kind === 'powershell' && profileLabel) {
      item.description = `${this.entry.kind} • ${profileLabel}`;
    } else if (this.entry.kind === 'task') {
      const detail = this.entry.task?.group ?? this.entry.task?.type;
      item.description = detail ? `task • ${detail}` : 'task';
    } else if (this.entry.source === 'custom') {
      item.description = `${this.entry.kind} • custom`;
    } else {
      item.description = this.entry.kind;
    }
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

async function readBrowseEntries(folderPath: string): Promise<ProjectsWebviewBrowseEntry[]> {
  const entries = await readDirectory(folderPath);
  const directories: ProjectsWebviewBrowseEntry[] = [];
  const files: ProjectsWebviewBrowseEntry[] = [];

  for (const [name, type] of entries) {
    if (name === '.git') {
      continue;
    }
    const entryPath = path.join(folderPath, name);
    const entry = {
      path: entryPath,
      name,
      isDirectory: type === vscode.FileType.Directory
    };
    if (entry.isDirectory) {
      directories.push(entry);
    } else {
      files.push(entry);
    }
  }

  const byName = (a: ProjectsWebviewBrowseEntry, b: ProjectsWebviewBrowseEntry): number => a.name.localeCompare(b.name);
  return [...directories.sort(byName), ...files.sort(byName)];
}

function isPathUnderRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  if (!relative) {
    return true;
  }
  return !relative.startsWith('..') && !path.isAbsolute(relative);
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

function applyStoredOrder(
  projects: Project[],
  order: ProjectSortOrder | undefined,
  settings: ForgeFlowSettings
): Project[] {
  if (!order) {
    return projects;
  }
  if (order.mode !== settings.projectSortMode || order.direction !== settings.projectSortDirection) {
    return projects;
  }
  const byId = new Map(projects.map((project) => [project.id, project]));
  const seen = new Set<string>();
  const ordered: Project[] = [];
  for (const id of order.ids) {
    const item = byId.get(id);
    if (item) {
      ordered.push(item);
      seen.add(id);
    }
  }
  if (seen.size === projects.length) {
    return ordered;
  }
  for (const project of projects) {
    if (!seen.has(project.id)) {
      ordered.push(project);
    }
  }
  return ordered;
}

function shouldRefreshGitCommit(cacheEntry: GitCommitCacheEntry | undefined, ttlMs: number, now: number): boolean {
  if (!cacheEntry) {
    return true;
  }
  if (cacheEntry.lastCommit === undefined) {
    return true;
  }
  if (ttlMs <= 0) {
    return true;
  }
  return now - cacheEntry.fetchedAt > ttlMs;
}

function shouldRefreshGitCommitWithHead(
  cacheEntry: GitCommitCacheEntry | undefined,
  ttlMs: number,
  now: number,
  headMtime: number | undefined
): boolean {
  if (shouldRefreshGitCommit(cacheEntry, ttlMs, now)) {
    return true;
  }
  if (!cacheEntry || cacheEntry.headMtime === undefined || headMtime === undefined) {
    return false;
  }
  return headMtime > cacheEntry.headMtime;
}

function getScanRoots(): string[] {
  const settings = getForgeFlowSettings();
  if (settings.projectScanRoots.length > 0) {
    return settings.projectScanRoots;
  }
  return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
}

interface EntryPointCacheEntry {
  key: string;
  fetchedAt: number;
  groups: EntryPointGroups;
}

interface DuplicateInfo {
  index: number;
  total: number;
  key: string;
}

function buildEntryPointCacheKey(project: Project, settings: ForgeFlowSettings): string {
  const overrides = [...(project.entryPointOverrides ?? [])].sort();
  return [
    project.path,
    settings.projectEntryPointScanDepth,
    settings.projectEntryPointMaxCount,
    settings.projectEntryPointPreferredFolders.join('|'),
    settings.projectEntryPointFileNames.join('|'),
    overrides.join('|')
  ].join('::');
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

function shouldShowLoadMore(total: number, visible: number): boolean {
  if (total <= 0) {
    return false;
  }
  return visible < total;
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
  showSummary = false,
  tags: string[] = []
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
  if (tags.length > 0) {
    const clipped = tags.slice(0, 2);
    const label = tags.length > 2 ? `${clipped.join(',')}+` : clipped.join(',');
    parts.push(`tags:${label}`);
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

function resolveProjectProfileLabel(project: Project): string | undefined {
  if (!project.preferredRunProfileId) {
    return undefined;
  }
  const settings = getForgeFlowSettings();
  return resolveProfileLabel(project.preferredRunProfileId, settings.powershellProfiles);
}

function isPowerShellPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.ps1' || ext === '.psm1' || ext === '.psd1';
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

function matchesProjectFilter(project: Project, filter: string, tags: string[] = []): boolean {
  const haystack = [
    project.name,
    project.path,
    project.type,
    project.identity?.githubRepo,
    project.identity?.repositoryPath,
    project.identity?.repositoryUrl,
    project.identity?.powershellModule,
    project.identity?.nugetPackage,
    project.identity?.vscodeExtensionId,
    tags.join(' ')
  ].filter(Boolean).join(' ');
  const mode = getForgeFlowSettings().filtersMatchMode;
  return matchesFilterQuery(haystack, filter, mode);
}

function matchesTagFilter(projectTags: string[], activeTags: string[]): boolean {
  if (activeTags.length === 0) {
    return true;
  }
  const tagSet = new Set(projectTags.map((tag) => tag.toLowerCase()));
  return activeTags.every((tag) => tagSet.has(tag.toLowerCase()));
}

function formatPresetLabel(preset: RunPreset): string | undefined {
  if (preset.kind === 'powershell') {
    return preset.target ? `powershell • ${preset.target}` : 'powershell';
  }
  if (preset.kind === 'task') {
    return preset.taskName ? `task • ${preset.taskName}` : 'task';
  }
  if (preset.kind === 'command') {
    return 'command';
  }
  return undefined;
}

function formatHistoryLabel(entry: RunHistoryEntry): string | undefined {
  if (entry.kind === 'powershell') {
    return entry.target ? `powershell • ${entry.target}` : 'powershell';
  }
  if (entry.kind === 'task') {
    return entry.taskName ? `task • ${entry.taskName}` : 'task';
  }
  if (entry.kind === 'command') {
    return 'command';
  }
  return undefined;
}

function historyIconForEntry(entry: RunHistoryEntry): vscode.ThemeIcon {
  if (entry.kind === 'task') {
    return new vscode.ThemeIcon('checklist');
  }
  if (entry.kind === 'command') {
    return new vscode.ThemeIcon('terminal');
  }
  return new vscode.ThemeIcon('play');
}

function collectTagCounts(
  tagsStore: TagsStore,
  projectIds: string[]
): Map<string, { key: string; label: string; count: number }> {
  const map = tagsStore.getAll();
  const counts = new Map<string, { key: string; label: string; count: number }>();
  const allowed = new Set(projectIds);
  Object.entries(map).forEach(([projectId, entry]) => {
    if (!allowed.has(projectId)) {
      return;
    }
    entry.tags.forEach((tag) => {
      const key = tag.toLowerCase();
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { key, label: tag, count: 1 });
      }
    });
  });
  return counts;
}

function normalizeTagFilter(tags: string[]): string[] {
  const deduped = new Map<string, string>();
  tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .forEach((tag) => {
      const key = tag.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, tag);
      }
    });
  return Array.from(deduped.values());
}

function toWebviewEntry(entry: ProjectEntryPoint): ProjectsWebviewEntry {
  const key = entry.kind === 'task'
    ? `task:${(entry.task?.name ?? entry.label).toLowerCase()}`
    : path.resolve(entry.path);
  return {
    key,
    label: entry.label,
    path: entry.path,
    kind: entry.kind,
    source: entry.source,
    task: entry.task
  };
}

function buildSortDescription(
  projects: Project[],
  progress?: {
    gitCommit: { loading: boolean; progress: number; total: number };
    modified: { loading: boolean; progress: number; total: number };
  },
  filterText?: string,
  tagFilter: string[] = []
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
  const tagSuffix = tagFilter.length > 0 ? ` • tags: ${tagFilter.join(', ')}` : '';
  return `Sorted by ${modeLabel} (${directionLabel})${suffix}${filterSuffix}${tagSuffix}`;
}

function shouldSkipScan(
  meta: { roots: string[]; maxDepth: number; fetchedAt: number } | undefined,
  roots: string[],
  maxDepth: number,
  cacheMinutes: number
): boolean {
  if (!meta) {
    return false;
  }
  if (cacheMinutes <= 0) {
    return false;
  }
  if (!sameRoots(meta.roots, roots) || meta.maxDepth !== maxDepth) {
    return false;
  }
  const ttlMs = cacheMinutes * 60_000;
  return Date.now() - meta.fetchedAt < ttlMs;
}

function sameRoots(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const normalizedLeft = left.map((value) => normalizeRoot(value)).sort();
  const normalizedRight = right.map((value) => normalizeRoot(value)).sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function normalizeRoot(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
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
