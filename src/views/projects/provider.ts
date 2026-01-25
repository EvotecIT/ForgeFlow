import * as vscode from 'vscode';
import type { Project } from '../../models/project';
import type { RunHistoryEntry } from '../../models/run';
import { detectEntryPointGroups, type EntryPointGroups } from '../../scan/entryPointDetector';
import { detectProjectIdentity } from '../../scan/identityDetector';
import { findRecentWriteTime } from '../../scan/modifiedScanner';
import type { ProjectScanner } from '../../scan/projectScanner';
import type { ProjectsStore } from '../../store/projectsStore';
import type { TagsStore } from '../../store/tagsStore';
import type { TagFilterStore } from '../../store/tagFilterStore';
import type { RunHistoryStore } from '../../store/runHistoryStore';
import { getForgeFlowSettings } from '../../util/config';
import type { ProjectSortMode } from '../../util/config';
import { getLocalGitInfo } from '../../dashboard/dataProviders';
import type { GitStore } from '../../git/gitStore';
import { getGitHeadMtime } from '../../git/gitHead';
import type { GitCommitCacheStore } from '../../store/gitCommitCacheStore';
import { statPath } from '../../util/fs';
import type {
  DuplicateInfo,
  EntryPointCacheEntry,
  ProjectNode,
  ProjectsWebviewBrowseEntry,
  ProjectsWebviewDetails,
  ProjectsWebviewSnapshot
} from './types';
import { isPathUnderRoot, readBrowseEntries } from './browse';
import { getProjectChildren } from './children';
import {
  applyStoredOrder,
  buildDuplicateInfo,
  buildEntryPointCacheKey,
  buildSortDescription,
  collectTagCounts,
  formatProjectDescription,
  formatSummaryTooltip,
  getScanRoots,
  mergeIdentity,
  needsRepositoryIdentity,
  normalizeTagFilter,
  shouldRefreshGitCommit,
  shouldRefreshGitCommitWithHead,
  shouldSkipScan,
  sortProjects,
  toWebviewEntry
} from './helpers';

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
    return await getProjectChildren(
      {
        projects: this.projects,
        favoriteIds: this.favoriteIds,
        duplicateInfo: this.duplicateInfo,
        filterText: this.filterText,
        tagFilter: this.tagFilter,
        favoritesOnly: this.favoritesOnly,
        visibleCount: this.visibleCount,
        isScanning: this.isScanning,
        gitCommitLoading: this.gitCommitLoading,
        gitCommitProgress: this.gitCommitProgress,
        gitCommitTotal: this.gitCommitTotal,
        modifiedLoading: this.modifiedLoading,
        modifiedProgress: this.modifiedProgress,
        modifiedTotal: this.modifiedTotal,
        tagsStore: this.tagsStore,
        gitStore: this.gitStore,
        getEntryPointGroups: (project) => this.getEntryPointGroups(project),
        getRecentRuns: (project) => this.getRecentRuns(project)
      },
      element
    );
  }

  public getParent(): ProjectNode | undefined {
    return undefined;
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
      const recent = await findRecentWriteTime(project.path, settings.projectModifiedScanDepth, {
        ignoreFolders: settings.projectModifiedIgnoreFolders,
        ignoreExtensions: settings.projectModifiedIgnoreFileExtensions
      });
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
