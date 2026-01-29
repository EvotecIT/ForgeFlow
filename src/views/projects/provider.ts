import * as path from 'path';
import * as vscode from 'vscode';
import type { Project } from '../../models/project';
import type { RunHistoryEntry } from '../../models/run';
import type { EntryPointGroups } from '../../scan/entryPointDetector';
import { detectProjectIdentity } from '../../scan/identityDetector';
import type { ProjectScanner } from '../../scan/projectScanner';
import type { ProjectsStore } from '../../store/projectsStore';
import type { TagsStore } from '../../store/tagsStore';
import type { TagFilterStore } from '../../store/tagFilterStore';
import type { RunHistoryStore } from '../../store/runHistoryStore';
import { getForgeFlowSettings } from '../../util/config';
import type { ProjectSortMode } from '../../util/config';
import type { GitStore } from '../../git/gitStore';
import type { GitCommitCacheStore } from '../../store/gitCommitCacheStore';
import { readFileText, statPath } from '../../util/fs';
import type {
  DuplicateInfo,
  EntryPointCacheEntry,
  ProjectNode
} from './types';
import { getProjectChildren } from './children';
import {
  buildProjectsWebviewBrowseEntries,
  buildProjectsWebviewDetails,
  buildProjectsWebviewSnapshot
} from './webviewData';
import {
  applyStoredOrder,
  getScanRoots,
  getStaleScanRoots,
  mergeIdentity,
  needsRepositoryIdentity,
  normalizeTagFilter,
  sameRoots,
  sortProjects
} from './helpers';
import {
  applyGitCommitUpdateToProjects,
  buildDuplicateInfoFromStore,
  computeScanMetaUpdate,
  getInitialVisibleCount,
  getRecentRunsForProject,
  hydrateGitCommits,
  hydrateModifiedTimes,
  invalidateEntryPointCache,
  mergeScanResults,
  resolveEntryPointGroups,
  resolveScanNotice,
  shouldUpdateProgress
} from './providerInternals';

export class ProjectsViewProvider implements vscode.TreeDataProvider<ProjectNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ProjectNode | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private readonly onDidUpdateProjectsEmitter = new vscode.EventEmitter<Project[]>();
  public readonly onDidUpdateProjects = this.onDidUpdateProjectsEmitter.event;
  private readonly scanLockId = `scan-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  private readonly scanLockTtlMs = 10 * 60_000;
  private scanLockHeld = false;
  private scanDeferredAt?: number;
  private scanDeferredMessage?: string;
  private readonly scanNoticeTtlMs = 2 * 60_000;
  private lastScanMetaFetchedAt?: number;
  private scanBackoffUntil?: number;
  private readonly scanBackoffMs = 2 * 60_000;

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
    this.syncScanMeta();
    this.filterText = this.projectsStore.getFilter();
    this.tagFilter = this.tagFilterStore.getFilter();
    const nextFavoritesOnly = this.projectsStore.getFavoritesOnly();
    if (nextFavoritesOnly !== this.favoritesOnly) {
      this.favoritesOnly = nextFavoritesOnly;
      void vscode.commands.executeCommand('setContext', 'forgeflow.projects.favoritesOnly', this.favoritesOnly);
    }
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

    let rootsToScan = roots;
    if (!force && settings.projectScanCacheMinutes > 0) {
      const scanMeta = this.projectsStore.getScanMeta();
      const rootsMatch = scanMeta && sameRoots(scanMeta.roots, roots) && scanMeta.maxDepth === settings.projectScanMaxDepth;
      if (rootsMatch) {
        const staleRoots = await getStaleScanRoots(
          this.projectsStore.getScanRootsMeta(),
          roots,
          settings.projectScanMaxDepth,
          settings.projectScanCacheMinutes
        );
        if (staleRoots.length === 0) {
          this.isScanning = false;
          return;
        }
        rootsToScan = staleRoots;
      }
    }

    if (!force && this.scanBackoffUntil && Date.now() < this.scanBackoffUntil) {
      this.scanDeferredAt = Date.now();
      this.scanDeferredMessage = 'Scan deferred (cooldown).';
      this.onDidUpdateProjectsEmitter.fire(this.projects);
      this.onDidChangeTreeDataEmitter.fire(undefined);
      this.isScanning = false;
      return;
    }

    const lockAcquired = await this.projectsStore.tryAcquireScanLock(this.scanLockId, this.scanLockTtlMs);
    if (!lockAcquired) {
      this.scanDeferredAt = Date.now();
      this.scanDeferredMessage = 'Scan deferred (another window is scanning).';
      this.scanBackoffUntil = Date.now() + this.scanBackoffMs;
      this.onDidUpdateProjectsEmitter.fire(this.projects);
      this.onDidChangeTreeDataEmitter.fire(undefined);
      this.isScanning = false;
      return;
    }

    this.scanBackoffUntil = undefined;
    this.clearScanNotice();
    this.isScanning = true;
    this.scanLockHeld = true;
    void this.runScan(rootsToScan, roots, settings.projectScanMaxDepth, settings.projectSortMode);
  }

  public syncFromStore(): void {
    if (this.isScanning) {
      return;
    }
    this.syncScanMeta();
    this.filterText = this.projectsStore.getFilter();
    this.tagFilter = this.tagFilterStore.getFilter();
    const nextFavoritesOnly = this.projectsStore.getFavoritesOnly();
    if (nextFavoritesOnly !== this.favoritesOnly) {
      this.favoritesOnly = nextFavoritesOnly;
      void vscode.commands.executeCommand('setContext', 'forgeflow.projects.favoritesOnly', this.favoritesOnly);
    }
    const settings = getForgeFlowSettings();
    const existing = this.projectsStore.list();
    this.projects = applyStoredOrder(existing, this.projectsStore.getSortOrder(), settings);
    this.favoriteIds = this.projectsStore.getFavoriteIds();
    this.resetPaging();
    this.updateDuplicateInfo(this.projects);
    this.invalidateEntryPointCache();
    this.onDidUpdateProjectsEmitter.fire(this.projects);
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public refreshRunHistory(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getWebviewSnapshot() {
    return buildProjectsWebviewSnapshot({
      projects: this.projects,
      favoriteIds: this.favoriteIds,
      duplicateInfo: this.duplicateInfo,
      gitStore: this.gitStore,
      tagsStore: this.tagsStore,
      tagFilter: this.tagFilter,
      filterText: this.filterText,
      favoritesOnly: this.favoritesOnly,
      visibleCount: this.visibleCount,
      gitCommitLoading: this.gitCommitLoading,
      gitCommitProgress: this.gitCommitProgress,
      gitCommitTotal: this.gitCommitTotal,
      modifiedLoading: this.modifiedLoading,
      modifiedProgress: this.modifiedProgress,
      modifiedTotal: this.modifiedTotal,
      scanMeta: this.projectsStore.getScanMeta(),
      scanNotice: this.getScanNotice()
    });
  }

  public async getWebviewProjectDetails(projectId: string) {
    const project = this.projects.find((item) => item.id === projectId);
    if (!project) {
      return undefined;
    }
    return await buildProjectsWebviewDetails({
      project,
      getEntryPointGroups: (target) => this.getEntryPointGroups(target),
      getRecentRuns: (target) => this.getRecentRuns(target)
    });
  }

  public async getWebviewBrowseEntries(projectId: string, folderPath: string) {
    const project = this.projects.find((item) => item.id === projectId);
    if (!project) {
      return undefined;
    }
    return await buildProjectsWebviewBrowseEntries(project, folderPath);
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
        scanNotice: this.getScanNotice(),
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
      const isWorktree = project.type === 'git' ? await this.isGitWorktree(project.path) : false;
      const needsRepo = needsRepositoryIdentity(project.identity) || isWorktree;
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
      const merged = mergeIdentity(project.identity, detected.identity, { overrideRepository: isWorktree });
      const updated = { ...project, identity: merged };
      await this.projectsStore.updateProject(updated);
      results.push(updated);
    }
    this.updateDuplicateInfo(results);
    return results;
  }

  private async isGitWorktree(projectPath: string): Promise<boolean> {
    const dotGitPath = path.join(projectPath, '.git');
    const dotGitStat = await statPath(dotGitPath);
    if (!dotGitStat || dotGitStat.type !== vscode.FileType.File) {
      return false;
    }
    const content = await readFileText(dotGitPath);
    if (!content) {
      return false;
    }
    const match = /gitdir:\s*(.+)/i.exec(content);
    const gitDirValue = match?.[1]?.trim();
    if (!gitDirValue) {
      return false;
    }
    const normalized = gitDirValue.replace(/\\/g, '/').toLowerCase();
    return normalized.includes('/worktrees/');
  }

  private async hydrateGitCommits(projects: Project[], runId: number): Promise<Project[]> {
    const settings = getForgeFlowSettings();
    const results = await hydrateGitCommits({
      projects,
      runId,
      scanVersion: () => this.scanVersion,
      projectsStore: this.projectsStore,
      gitCommitCacheStore: this.gitCommitCacheStore,
      settings,
      onStart: (total) => {
        this.gitCommitTotal = total;
        this.gitCommitProgress = 0;
        this.gitCommitLoading = total > 0;
        if (this.gitCommitLoading) {
          this.lastProgressUpdate = Date.now();
          this.onDidChangeTreeDataEmitter.fire(undefined);
        }
      },
      onProgress: (progress, total) => {
        this.gitCommitProgress = Math.min(progress, total);
        this.maybeUpdateProgress();
      }
    });
    if (runId === this.scanVersion) {
      this.gitCommitLoading = false;
      this.gitCommitProgress = this.gitCommitTotal;
      this.onDidChangeTreeDataEmitter.fire(undefined);
      this.updateDuplicateInfo(results);
    }
    return results;
  }

  private async hydrateModifiedTimes(projects: Project[], runId: number): Promise<Project[]> {
    const settings = getForgeFlowSettings();
    this.modifiedTotal = projects.length;
    this.modifiedProgress = 0;
    this.modifiedLoading = true;
    this.lastProgressUpdate = Date.now();
    this.onDidChangeTreeDataEmitter.fire(undefined);

    const results = await hydrateModifiedTimes({
      projects,
      runId,
      scanVersion: () => this.scanVersion,
      projectsStore: this.projectsStore,
      settings,
      onProgress: (progress, total) => {
        this.modifiedProgress = Math.min(progress, total);
        this.maybeUpdateProgress();
      }
    });

    if (runId === this.scanVersion) {
      this.modifiedLoading = false;
      this.modifiedProgress = this.modifiedTotal;
      this.onDidChangeTreeDataEmitter.fire(undefined);
      this.updateDuplicateInfo(results);
    }
    return results;
  }

  private async runScan(
    scanRoots: string[],
    allRoots: string[],
    maxDepth: number,
    sortMode: ProjectSortMode
  ): Promise<void> {
    const runId = ++this.scanVersion;
    const scanStart = Date.now();
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
      const scanned = await this.scanner.scan(scanRoots, maxDepth, existing);
      const projects = scanRoots.length === allRoots.length
        ? scanned
        : mergeScanResults(existing, scanned, scanRoots);
      if ((sortMode === 'gitCommit' || sortMode === 'recentModified') && this.projects.length > 0) {
        const order = new Map(this.projects.map((project, index) => [project.id, index]));
        projects.sort((a, b) => {
          const aIndex = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
          const bIndex = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
          return aIndex - bIndex;
        });
      }
      const fetchedAt = Date.now();
      await this.projectsStore.saveProjects(projects);
      await this.projectsStore.setScanMeta({ roots: [...allRoots], maxDepth, fetchedAt });
      await this.projectsStore.updateScanRootsMeta(scanRoots, maxDepth, fetchedAt);
      await this.projectsStore.setScanStats({
        scannedAt: fetchedAt,
        durationMs: fetchedAt - scanStart,
        rootsCount: allRoots.length,
        scannedRootsCount: scanRoots.length
      });
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
      if (this.scanLockHeld) {
        this.scanLockHeld = false;
        await this.projectsStore.releaseScanLock(this.scanLockId);
      }
      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        await this.refresh();
      }
    }
  }

  private maybeUpdateProgress(): void {
    const result = shouldUpdateProgress({
      now: Date.now(),
      lastUpdate: this.lastProgressUpdate,
      gitCommitLoading: this.gitCommitLoading,
      gitCommitProgress: this.gitCommitProgress,
      gitCommitTotal: this.gitCommitTotal,
      modifiedLoading: this.modifiedLoading,
      modifiedProgress: this.modifiedProgress,
      modifiedTotal: this.modifiedTotal
    });
    if (!result.shouldUpdate) {
      return;
    }
    this.lastProgressUpdate = result.nextLastUpdate;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  private syncScanMeta(): void {
    const fetchedAt = this.projectsStore.getScanMeta()?.fetchedAt;
    const update = computeScanMetaUpdate(fetchedAt, this.lastScanMetaFetchedAt);
    this.lastScanMetaFetchedAt = update.nextFetchedAt;
    if (update.resetBackoff) {
      this.scanBackoffUntil = undefined;
    }
    if (update.clearNotice) {
      this.clearScanNotice();
    }
  }

  private getScanNotice(): string | undefined {
    const notice = resolveScanNotice({
      deferredAt: this.scanDeferredAt,
      deferredMessage: this.scanDeferredMessage,
      ttlMs: this.scanNoticeTtlMs
    });
    if (notice.expired) {
      this.clearScanNotice();
    }
    return notice.notice;
  }

  private clearScanNotice(): void {
    this.scanDeferredAt = undefined;
    this.scanDeferredMessage = undefined;
  }

  private updateDuplicateInfo(projects: Project[]): void {
    this.duplicateInfo = buildDuplicateInfoFromStore(this.projectsStore, projects);
  }

  public invalidateEntryPointCache(projectId?: string): void {
    invalidateEntryPointCache(this.entryPointCache, projectId);
  }

  public async getEntryPointGroups(project: Project): Promise<EntryPointGroups> {
    return await resolveEntryPointGroups(project, this.entryPointCache);
  }

  public applyGitCommitUpdate(projectId: string, lastGitCommit?: number): void {
    const result = applyGitCommitUpdateToProjects(this.projects, projectId, lastGitCommit);
    if (!result.changed) {
      return;
    }
    this.projects = result.projects;
    this.maybePersistSortOrder();
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  private resetPaging(): void {
    this.visibleCount = getInitialVisibleCount();
  }

  private getRecentRuns(project: Project): RunHistoryEntry[] {
    return getRecentRunsForProject(this.runHistoryStore, project);
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
