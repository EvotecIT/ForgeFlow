import * as path from 'path';
import * as vscode from 'vscode';
import type { Project, ProjectEntryPoint, ProjectIdentity } from '../../models/project';
import type { RunPreset } from '../../models/run';
import type { RunHistoryEntry } from '../../models/run';
import type { GitProjectSummary } from '../../git/gitSummary';
import { getForgeFlowSettings } from '../../util/config';
import type { ForgeFlowSettings, ProjectSortMode, SortDirection } from '../../util/config';
import type { ProjectSortOrder } from '../../store/projectsStore';
import type { ProjectScanRootMeta } from '../../store/projectsStore';
import type { TagsStore } from '../../store/tagsStore';
import { matchesFilterQuery } from '../../util/filter';
import { resolveProfileLabel } from '../../run/powershellProfiles';
import { statPath } from '../../util/fs';
import type { GitCommitCacheEntry } from '../../store/gitCommitCacheStore';
import type { DuplicateInfo, ProjectsWebviewEntry } from './types';

export function sortProjects(
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
      const diff = (projectA.lastModified ?? 0) - (projectB.lastModified ?? 0);
      if (diff !== 0) {
        return dir * diff;
      }
      return fallbackToName ? dir * projectA.name.localeCompare(projectB.name) : a.index - b.index;
    }

    if (mode === 'lastActive') {
      const diff = (projectA.lastActivity ?? 0) - (projectB.lastActivity ?? 0);
      if (diff !== 0) {
        return dir * diff;
      }
      return fallbackToName ? dir * projectA.name.localeCompare(projectB.name) : a.index - b.index;
    }

    if (mode === 'gitCommit') {
      const diff = (projectA.lastGitCommit ?? 0) - (projectB.lastGitCommit ?? 0);
      if (diff !== 0) {
        return dir * diff;
      }
      return fallbackToName ? dir * projectA.name.localeCompare(projectB.name) : a.index - b.index;
    }

    const openedDiff = (projectA.lastOpened ?? 0) - (projectB.lastOpened ?? 0);
    if (openedDiff !== 0) {
      return dir * openedDiff;
    }
    const modifiedDiff = (projectA.lastModified ?? 0) - (projectB.lastModified ?? 0);
    if (modifiedDiff !== 0) {
      return dir * modifiedDiff;
    }
    return fallbackToName ? dir * projectA.name.localeCompare(projectB.name) : a.index - b.index;
  });
  return indexed.map((item) => item.project);
}

export function applyStoredOrder(
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

export function shouldRefreshGitCommit(cacheEntry: GitCommitCacheEntry | undefined, ttlMs: number, now: number): boolean {
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

export function shouldRefreshGitCommitWithHead(
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

export function getScanRoots(): string[] {
  const settings = getForgeFlowSettings();
  if (settings.projectScanRoots.length > 0) {
    return settings.projectScanRoots;
  }
  return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
}

export function buildEntryPointCacheKey(project: Project, settings: ForgeFlowSettings): string {
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

export function buildDuplicateInfo(projects: Project[]): Map<string, DuplicateInfo> {
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

export function shouldShowLoadMore(total: number, visible: number): boolean {
  if (total <= 0) {
    return false;
  }
  return visible < total;
}

export function buildProjectDuplicateKey(project: Project): string | undefined {
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

export function formatProjectDescription(
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

export function formatSummaryParts(summary: GitProjectSummary): string[] {
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

export function formatSummaryTooltip(summary: GitProjectSummary): string {
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

export function resolveProjectProfileLabel(project: Project): string | undefined {
  if (!project.preferredRunProfileId) {
    return undefined;
  }
  const settings = getForgeFlowSettings();
  return resolveProfileLabel(project.preferredRunProfileId, settings.powershellProfiles);
}

export function isPowerShellPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.ps1' || ext === '.psm1' || ext === '.psd1';
}

export function formatSummaryAge(timestamp: number): string {
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

export function matchesProjectFilter(project: Project, filter: string, tags: string[] = []): boolean {
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

export function matchesTagFilter(projectTags: string[], activeTags: string[]): boolean {
  if (activeTags.length === 0) {
    return true;
  }
  const tagSet = new Set(projectTags.map((tag) => tag.toLowerCase()));
  return activeTags.every((tag) => tagSet.has(tag.toLowerCase()));
}

export function formatPresetLabel(preset: RunPreset): string | undefined {
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

export function formatHistoryLabel(entry: RunHistoryEntry): string | undefined {
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

export function historyIconForEntry(entry: RunHistoryEntry): vscode.ThemeIcon {
  if (entry.kind === 'task') {
    return new vscode.ThemeIcon('checklist');
  }
  if (entry.kind === 'command') {
    return new vscode.ThemeIcon('terminal');
  }
  return new vscode.ThemeIcon('play');
}

export function collectTagCounts(
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

export function normalizeTagFilter(tags: string[]): string[] {
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

export function toWebviewEntry(entry: ProjectEntryPoint): ProjectsWebviewEntry {
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

export function buildSortDescription(
  projects: Project[],
  progress?: {
    gitCommit: { loading: boolean; progress: number; total: number };
    modified: { loading: boolean; progress: number; total: number };
  },
  filterText?: string,
  tagFilter: string[] = [],
  scanNotice?: string
): string {
  const settings = getForgeFlowSettings();
  const modeLabel = getSortModeLabel(settings.projectSortMode);
  const timeBased = new Set<ProjectSortMode>(['recentOpened', 'recentModified', 'lastActive', 'gitCommit']);
  const directionLabel = timeBased.has(settings.projectSortMode)
    ? (settings.projectSortDirection === 'asc' ? 'oldest first' : 'newest first')
    : (settings.projectSortDirection === 'asc' ? 'ascending' : 'descending');
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
  const noticeSuffix = scanNotice ? ` • ${scanNotice}` : '';
  return `Sorted by ${modeLabel} (${directionLabel})${suffix}${filterSuffix}${tagSuffix}${noticeSuffix}`;
}

export function shouldSkipScan(
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

export async function getStaleScanRoots(
  meta: Record<string, ProjectScanRootMeta>,
  roots: string[],
  maxDepth: number,
  cacheMinutes: number
): Promise<string[]> {
  if (cacheMinutes <= 0) {
    return [...roots];
  }
  const ttlMs = cacheMinutes * 60_000;
  const now = Date.now();
  const stale: string[] = [];
  for (const root of roots) {
    const key = normalizeRoot(root);
    const entry = meta[key];
    if (!entry) {
      stale.push(root);
      continue;
    }
    if (entry.maxDepth !== maxDepth) {
      stale.push(root);
      continue;
    }
    if (now - entry.fetchedAt >= ttlMs) {
      stale.push(root);
      continue;
    }
    if (entry.rootMtime === undefined) {
      stale.push(root);
      continue;
    }
    const stat = await statPath(root);
    const currentMtime = stat?.mtime;
    if (currentMtime === undefined || currentMtime !== entry.rootMtime) {
      stale.push(root);
    }
  }
  return stale;
}

export function sameRoots(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const normalizedLeft = left.map((value) => normalizeRoot(value)).sort();
  const normalizedRight = right.map((value) => normalizeRoot(value)).sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

export function normalizeRoot(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function getSortModeLabel(mode: ProjectSortMode): string {
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

export function needsRepositoryIdentity(identity: ProjectIdentity | undefined): boolean {
  if (!identity) {
    return true;
  }
  return !identity.repositoryUrl && !identity.repositoryProvider && !identity.repositoryPath && !identity.githubRepo;
}

export function mergeIdentity(
  existing: ProjectIdentity | undefined,
  detected: ProjectIdentity,
  options?: { overrideRepository?: boolean }
): ProjectIdentity {
  if (!existing) {
    return detected;
  }
  const overrideRepository = options?.overrideRepository === true;
  const repositoryUrl = overrideRepository && detected.repositoryUrl ? detected.repositoryUrl : existing.repositoryUrl ?? detected.repositoryUrl;
  const repositoryProvider = overrideRepository && detected.repositoryProvider ? detected.repositoryProvider : existing.repositoryProvider ?? detected.repositoryProvider;
  const repositoryPath = overrideRepository && detected.repositoryPath ? detected.repositoryPath : existing.repositoryPath ?? detected.repositoryPath;
  const githubRepo = overrideRepository && detected.githubRepo ? detected.githubRepo : existing.githubRepo ?? detected.githubRepo;
  return {
    repositoryUrl,
    repositoryProvider,
    repositoryPath,
    githubRepo,
    powershellModule: existing.powershellModule ?? detected.powershellModule,
    nugetPackage: existing.nugetPackage ?? detected.nugetPackage,
    vscodeExtensionId: existing.vscodeExtensionId ?? detected.vscodeExtensionId,
    vscodeExtensionVersion: existing.vscodeExtensionVersion ?? detected.vscodeExtensionVersion
  };
}
