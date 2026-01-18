import * as vscode from 'vscode';
import { watch, type FSWatcher } from 'fs';
import type { Project } from '../models/project';
import type { ProjectsStore } from '../store/projectsStore';
import type { GitCommitCacheStore } from '../store/gitCommitCacheStore';
import { getLocalGitInfo } from '../dashboard/dataProviders';
import { getGitHeadMtime, getGitHeadPaths } from './gitHead';
import { getForgeFlowSettings } from '../util/config';
import type { ForgeFlowLogger } from '../util/log';

export type GitWatchMode = 'off' | 'workspace' | 'favorites' | 'all';

interface ProjectWatch {
  projectId: string;
  repoPath: string;
  watchers: FSWatcher[];
  debounceTimer?: NodeJS.Timeout;
}

export interface GitCommitUpdate {
  projectId: string;
  lastGitCommit?: number;
}

export class GitWatchService implements vscode.Disposable {
  private readonly onDidUpdateEmitter = new vscode.EventEmitter<GitCommitUpdate>();
  public readonly onDidUpdate = this.onDidUpdateEmitter.event;

  private watches = new Map<string, ProjectWatch>();
  private lastProjects: Project[] = [];
  private lastFavorites = new Set<string>();
  private disposed = false;

  public constructor(
    private readonly projectsStore: ProjectsStore,
    private readonly gitCommitCacheStore: GitCommitCacheStore,
    private readonly logger: ForgeFlowLogger
  ) {}

  public dispose(): void {
    this.disposed = true;
    this.clearWatches();
    this.onDidUpdateEmitter.dispose();
  }

  public setProjects(projects: Project[], favoriteIds: string[]): void {
    this.lastProjects = projects;
    this.lastFavorites = new Set(favoriteIds);
    void this.reconcile();
  }

  public refresh(): void {
    void this.reconcile();
  }

  private async reconcile(): Promise<void> {
    if (this.disposed) {
      return;
    }
    const settings = getForgeFlowSettings();
    const mode = settings.projectGitWatchMode;
    if (mode === 'off') {
      this.clearWatches();
      return;
    }

    const maxRepos = Math.max(0, settings.projectGitWatchMaxRepos);
    const candidates = this.selectCandidates(mode, maxRepos);
    const nextIds = new Set(candidates.map((project) => project.id));

    for (const [projectId] of this.watches) {
      if (!nextIds.has(projectId)) {
        this.stopWatch(projectId);
      }
    }

    for (const project of candidates) {
      if (!this.watches.has(project.id)) {
        await this.startWatch(project, settings.projectGitWatchDebounceMs);
      }
    }
  }

  private selectCandidates(mode: GitWatchMode, maxRepos: number): Project[] {
    const workspaceRoots = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
    const roots = workspaceRoots.map((root) => normalizePath(root));
    const favorites = this.lastFavorites;

    const eligible = this.lastProjects.filter((project) => {
      if (project.type !== 'git') {
        return false;
      }
      if (mode === 'favorites') {
        return favorites.has(project.id);
      }
      if (mode === 'workspace') {
        const projectPath = normalizePath(project.path);
        return roots.some((root) => isPathUnder(projectPath, root));
      }
      return true;
    });

    const ranked = eligible.sort((a, b) => rankProject(a, favorites) - rankProject(b, favorites));
    if (maxRepos <= 0 || ranked.length <= maxRepos) {
      return ranked;
    }
    return ranked.slice(0, maxRepos);
  }

  private async startWatch(project: Project, debounceMs: number): Promise<void> {
    const paths = await getGitHeadPaths(project.path);
    if (!paths) {
      return;
    }

    const watchers: FSWatcher[] = [];
    const addWatcher = (filePath: string): void => {
      try {
        const watcher = watch(filePath, () => {
          this.scheduleRefresh(project, debounceMs);
        });
        watchers.push(watcher);
      } catch (err) {
        this.logger.warn(`Git watch failed for ${filePath}: ${String(err)}`);
      }
    };

    addWatcher(paths.headPath);
    addWatcher(paths.logPath);

    if (watchers.length === 0) {
      return;
    }

    this.watches.set(project.id, {
      projectId: project.id,
      repoPath: project.path,
      watchers
    });
  }

  private stopWatch(projectId: string): void {
    const watch = this.watches.get(projectId);
    if (!watch) {
      return;
    }
    if (watch.debounceTimer) {
      clearTimeout(watch.debounceTimer);
    }
    for (const watcher of watch.watchers) {
      try {
        watcher.close();
      } catch (error) {
        this.logger.warn(`Git watch close failed for ${watch.repoPath}: ${String(error)}`);
      }
    }
    this.watches.delete(projectId);
  }

  private clearWatches(): void {
    for (const [projectId] of this.watches) {
      this.stopWatch(projectId);
    }
  }

  private scheduleRefresh(project: Project, debounceMs: number): void {
    if (this.disposed) {
      return;
    }
    const watch = this.watches.get(project.id);
    if (!watch) {
      return;
    }
    if (watch.debounceTimer) {
      clearTimeout(watch.debounceTimer);
    }
    watch.debounceTimer = setTimeout(() => {
      watch.debounceTimer = undefined;
      void this.refreshProject(project);
    }, Math.max(0, debounceMs));
  }

  private async refreshProject(project: Project): Promise<void> {
    if (this.disposed) {
      return;
    }
    try {
      const gitInfo = await getLocalGitInfo(project.path);
      const lastCommit = gitInfo?.lastCommit ? Date.parse(gitInfo.lastCommit) : undefined;
      const lastGitCommit = Number.isNaN(lastCommit ?? NaN) ? undefined : lastCommit;
      const headMtime = await getGitHeadMtime(project.path);

      const cache = this.gitCommitCacheStore.getAll();
      cache[project.id] = {
        projectId: project.id,
        path: project.path,
        lastCommit: lastGitCommit,
        headMtime,
        fetchedAt: Date.now()
      };
      await this.gitCommitCacheStore.saveAll(cache);

      await this.projectsStore.updateProject({ ...project, lastGitCommit });
      this.onDidUpdateEmitter.fire({ projectId: project.id, lastGitCommit });
    } catch (err) {
      this.logger.warn(`Git watch refresh failed for ${project.path}: ${String(err)}`);
    }
  }
}

function rankProject(project: Project, favorites: Set<string>): number {
  const favScore = favorites.has(project.id) ? 0 : 1;
  const openedScore = -(project.lastOpened ?? 0);
  const activityScore = -(project.lastActivity ?? 0);
  const modifiedScore = -(project.lastModified ?? 0);
  return favScore * 1_000_000_000_000 + openedScore + activityScore + modifiedScore;
}

function normalizePath(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function isPathUnder(target: string, root: string): boolean {
  if (target === root) {
    return true;
  }
  if (!target.startsWith(root)) {
    return false;
  }
  const next = target.charAt(root.length);
  return next === '' || next === '/' || next === '\\';
}
