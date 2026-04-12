import type { Project } from '../../models/project';
import type { RunHistoryEntry } from '../../models/run';
import { detectEntryPointGroups, type EntryPointGroups } from '../../scan/entryPointDetector';
import { findRecentWriteTime } from '../../scan/modifiedScanner';
import type { EntryPointCacheEntry, DuplicateInfo } from './types';
import type { ProjectsStore } from '../../store/projectsStore';
import type { RunHistoryStore } from '../../store/runHistoryStore';
import { getForgeFlowSettings } from '../../util/config';
import { isPathUnderRoot } from './browse';
import { buildDuplicateInfo, buildEntryPointCacheKey, shouldRefreshGitCommit, shouldRefreshGitCommitWithHead } from './helpers';
import type { GitCommitCacheStore, GitCommitCacheEntry } from '../../store/gitCommitCacheStore';
import { getGitHeadHash, getGitHeadMtime } from '../../git/gitHead';
import { getLocalGitInfo } from '../../dashboard/dataProviders';

export function invalidateEntryPointCache(cache: Map<string, EntryPointCacheEntry>, projectId?: string): void {
  if (!projectId) {
    cache.clear();
    return;
  }
  cache.delete(projectId);
}

export async function resolveEntryPointGroups(
  project: Project,
  cache: Map<string, EntryPointCacheEntry>
): Promise<EntryPointGroups> {
  const settings = getForgeFlowSettings();
  const cacheMinutes = settings.projectEntryPointCacheMinutes;
  const cacheMs = cacheMinutes > 0 ? cacheMinutes * 60_000 : 0;
  const cacheKey = buildEntryPointCacheKey(project, settings);
  const cached = cache.get(project.id);
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
    cache.set(project.id, { key: cacheKey, fetchedAt: Date.now(), groups });
  }
  return groups;
}

export function getInitialVisibleCount(): number {
  const settings = getForgeFlowSettings();
  const pageSize = settings.projectPageSize;
  return pageSize > 0 ? pageSize : Number.MAX_SAFE_INTEGER;
}

export function getRecentRunsForProject(
  runHistoryStore: RunHistoryStore,
  project: Project
): RunHistoryEntry[] {
  const settings = getForgeFlowSettings();
  const maxItems = Math.max(1, settings.runHistoryPerProjectMaxItems ?? 6);
  return runHistoryStore.listForProject(project.id, maxItems, settings.runHistoryPerProjectSortMode);
}

export function applyGitCommitUpdateToProjects(
  projects: Project[],
  projectId: string,
  lastGitCommit?: number
): { projects: Project[]; changed: boolean } {
  const index = projects.findIndex((project) => project.id === projectId);
  if (index === -1) {
    return { projects, changed: false };
  }
  const existing = projects[index];
  if (!existing || existing.lastGitCommit === lastGitCommit) {
    return { projects, changed: false };
  }
  const next = projects.slice();
  next[index] = { ...existing, lastGitCommit };
  return { projects: next, changed: true };
}

export function buildDuplicateInfoFromStore(
  projectsStore: ProjectsStore,
  projects: Project[],
  options?: {
    gitCommonDirs?: ReadonlyMap<string, string>;
  }
): Map<string, DuplicateInfo> {
  const fromStore = projectsStore.list();
  const source = projects.length > 0 ? projects : fromStore;
  return buildDuplicateInfo(source, options);
}

export function shouldUpdateProgress(params: {
  now: number;
  lastUpdate: number;
  gitCommitLoading: boolean;
  gitCommitProgress: number;
  gitCommitTotal: number;
  modifiedLoading: boolean;
  modifiedProgress: number;
  modifiedTotal: number;
}): { shouldUpdate: boolean; nextLastUpdate: number } {
  const gitDone = params.gitCommitLoading && params.gitCommitProgress === params.gitCommitTotal;
  const modifiedDone = params.modifiedLoading && params.modifiedProgress === params.modifiedTotal;
  const shouldUpdate = gitDone || modifiedDone || params.now - params.lastUpdate > 500;
  return { shouldUpdate, nextLastUpdate: shouldUpdate ? params.now : params.lastUpdate };
}

export function computeScanMetaUpdate(
  fetchedAt: number | undefined,
  lastFetchedAt: number | undefined
): { nextFetchedAt?: number; resetBackoff: boolean; clearNotice: boolean } {
  if (fetchedAt && fetchedAt !== lastFetchedAt) {
    return { nextFetchedAt: fetchedAt, resetBackoff: true, clearNotice: true };
  }
  if (!fetchedAt && lastFetchedAt) {
    return { nextFetchedAt: undefined, resetBackoff: false, clearNotice: false };
  }
  return { nextFetchedAt: lastFetchedAt, resetBackoff: false, clearNotice: false };
}

export function resolveScanNotice(params: {
  deferredAt?: number;
  deferredMessage?: string;
  ttlMs: number;
}): { notice?: string; expired: boolean } {
  if (!params.deferredAt || !params.deferredMessage) {
    return { notice: undefined, expired: false };
  }
  if (Date.now() - params.deferredAt > params.ttlMs) {
    return { notice: undefined, expired: true };
  }
  return { notice: params.deferredMessage, expired: false };
}

export function mergeScanResults(existing: Project[], scanned: Project[], scanRoots: string[]): Project[] {
  if (scanRoots.length === 0) {
    return existing;
  }
  const remaining = existing.filter((project) => !scanRoots.some((root) => isPathUnderRoot(root, project.path)));
  return [...remaining, ...scanned];
}

export async function hydrateModifiedTimes(params: {
  projects: Project[];
  runId: number;
  scanVersion: () => number;
  projectsStore: ProjectsStore;
  settings: ReturnType<typeof getForgeFlowSettings>;
  onProgress: (progress: number, total: number) => void;
}): Promise<Project[]> {
  const results: Project[] = [];
  const total = params.projects.length;
  for (const project of params.projects) {
    if (params.runId !== params.scanVersion()) {
      return results;
    }
    const recent = await findRecentWriteTime(project.path, params.settings.projectModifiedScanDepth, {
      ignoreFolders: params.settings.projectModifiedIgnoreFolders,
      ignoreExtensions: params.settings.projectModifiedIgnoreFileExtensions
    });
    if (params.runId !== params.scanVersion()) {
      return results;
    }
    const lastModified = recent ?? project.lastModified;
    const updated = { ...project, lastModified };
    results.push(updated);
    params.onProgress(results.length, total);
  }
  await persistProjectField(params.projectsStore, results, 'lastModified');
  return results;
}

export async function hydrateGitCommits(params: {
  projects: Project[];
  runId: number;
  scanVersion: () => number;
  projectsStore: ProjectsStore;
  gitCommitCacheStore: GitCommitCacheStore;
  settings: ReturnType<typeof getForgeFlowSettings>;
  onStart: (total: number) => void;
  onProgress: (progress: number, total: number) => void;
}): Promise<Project[]> {
  const results: Project[] = [];
  const ttlMs = Math.max(0, params.settings.projectGitCommitCacheMinutes) * 60_000;
  const now = Date.now();
  const cache = params.gitCommitCacheStore.getAll();
  const pending: Array<{ project: Project; index: number; headMtime?: number; headHash?: string }> = [];
  const cacheUpdates: GitCommitCacheEntry[] = [];

  for (const project of params.projects) {
    if (params.runId !== params.scanVersion()) {
      return results;
    }
    if (project.type !== 'git') {
      results.push(project);
      continue;
    }
    const cacheEntry = cache[project.id];
    let headMtime: number | undefined;
    let headHash: string | undefined;
    let needsRefresh = shouldRefreshGitCommit(cacheEntry, ttlMs, now);
    if (!needsRefresh) {
      headMtime = await getGitHeadMtime(project.path);
      if (headMtime !== undefined) {
        needsRefresh = shouldRefreshGitCommitWithHead(cacheEntry, ttlMs, now, headMtime);
      } else {
        headHash = await getGitHeadHash(project.path);
        if (headHash) {
          needsRefresh = !cacheEntry?.headHash || cacheEntry.headHash !== headHash;
        }
      }
    }

    const cachedCommit = cacheEntry?.lastCommit ?? project.lastGitCommit;
    const baseProject = cachedCommit === project.lastGitCommit ? project : { ...project, lastGitCommit: cachedCommit };
    const index = results.push(baseProject) - 1;

    if (needsRefresh) {
      pending.push({ project: baseProject, index, headMtime, headHash });
    } else {
      if (cacheEntry && (headMtime !== undefined || headHash)) {
        const nextHeadMtime = headMtime ?? cacheEntry.headMtime;
        const nextHeadHash = headHash ?? cacheEntry.headHash;
        if (nextHeadMtime !== cacheEntry.headMtime || nextHeadHash !== cacheEntry.headHash) {
          cacheUpdates.push({
            projectId: baseProject.id,
            path: baseProject.path,
            lastCommit: baseProject.lastGitCommit,
            headMtime: nextHeadMtime,
            headHash: nextHeadHash,
            fetchedAt: Date.now()
          });
        }
      }
    }
  }

  params.onStart(pending.length);

  let completed = 0;
  for (const entry of pending) {
    if (params.runId !== params.scanVersion()) {
      return results;
    }
    const headMtime = entry.headMtime ?? await getGitHeadMtime(entry.project.path);
    const headHash = headMtime === undefined
      ? (entry.headHash ?? await getGitHeadHash(entry.project.path))
      : entry.headHash;
    if (params.runId !== params.scanVersion()) {
      return results;
    }
    const gitInfo = await getLocalGitInfo(entry.project.path);
    if (params.runId !== params.scanVersion()) {
      return results;
    }
    const lastCommit = gitInfo?.lastCommit ? Date.parse(gitInfo.lastCommit) : undefined;
    const lastGitCommit = Number.isNaN(lastCommit ?? NaN) ? undefined : lastCommit;
    const updated = { ...entry.project, lastGitCommit };
    cacheUpdates.push({
      projectId: entry.project.id,
      path: entry.project.path,
      lastCommit: lastGitCommit,
      headMtime,
      headHash,
      fetchedAt: Date.now()
    });
    results[entry.index] = updated;
    completed += 1;
    params.onProgress(completed, pending.length);
  }

  await persistProjectField(params.projectsStore, results, 'lastGitCommit');
  if (cacheUpdates.length > 0) {
    await params.gitCommitCacheStore.upsertEntries(cacheUpdates);
  }
  return results;
}

async function persistProjectField(
  projectsStore: ProjectsStore,
  updates: Project[],
  field: 'lastModified' | 'lastGitCommit'
): Promise<void> {
  if (updates.length === 0) {
    return;
  }
  const latest = projectsStore.list();
  const updatesById = new Map(updates.map((project) => [project.id, project]));
  let changed = false;
  const merged = latest.map((project) => {
    const update = updatesById.get(project.id);
    if (!update) {
      return project;
    }
    if (project[field] === update[field]) {
      return project;
    }
    changed = true;
    return {
      ...project,
      [field]: update[field]
    };
  });
  if (!changed) {
    return;
  }
  await projectsStore.saveProjects(merged);
}
