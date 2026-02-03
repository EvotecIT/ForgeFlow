import * as vscode from 'vscode';
import type { Project } from '../../models/project';
import type { RunHistoryEntry } from '../../models/run';
import type { EntryPointGroups } from '../../scan/entryPointDetector';
import type { GitStore } from '../../git/gitStore';
import type { ProjectScanMeta } from '../../store/projectsStore';
import type { TagsStore } from '../../store/tagsStore';
import { getForgeFlowSettings } from '../../util/config';
import { statPath } from '../../util/fs';
import type {
  DuplicateInfo,
  ProjectsWebviewBrowseEntry,
  ProjectsWebviewDetails,
  ProjectsWebviewSnapshot
} from './types';
import { isPathUnderRoot, readBrowseEntries } from './browse';
import {
  buildSortDescription,
  collectTagCounts,
  formatProjectDescription,
  formatSummaryTooltip,
  resolveProjectProfileLabel,
  sortProjects,
  toWebviewEntry
} from './helpers';

interface WebviewSnapshotParams {
  projects: Project[];
  favoriteIds: string[];
  duplicateInfo: Map<string, DuplicateInfo>;
  gitStore: GitStore;
  tagsStore: TagsStore;
  tagFilter: string[];
  filterText: string;
  favoritesOnly: boolean;
  visibleCount: number;
  gitCommitLoading: boolean;
  gitCommitProgress: number;
  gitCommitTotal: number;
  modifiedLoading: boolean;
  modifiedProgress: number;
  modifiedTotal: number;
  scanMeta?: ProjectScanMeta;
  scanNotice?: string;
}

export function buildProjectsWebviewSnapshot(params: WebviewSnapshotParams): ProjectsWebviewSnapshot {
  const settings = getForgeFlowSettings();
  const fallbackToName = !(
    (settings.projectSortMode === 'gitCommit' && params.gitCommitLoading)
    || (settings.projectSortMode === 'recentModified' && params.modifiedLoading)
  );
  const sorted = sortProjects(params.projects, settings.projectSortMode, settings.projectSortDirection, fallbackToName);
  const favorites = new Set(params.favoriteIds);
  const summaries = params.gitStore.getSummaries();
  const showSummary = settings.gitShowProjectSummary;
  const tagCounts = collectTagCounts(params.tagsStore, sorted.map((project) => project.id));
  const activeTagKeys = new Set(params.tagFilter.map((tag) => tag.toLowerCase()));
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
      gitCommit: { loading: params.gitCommitLoading, progress: params.gitCommitProgress, total: params.gitCommitTotal },
      modified: { loading: params.modifiedLoading, progress: params.modifiedProgress, total: params.modifiedTotal }
    },
    params.filterText,
    params.tagFilter,
    params.scanNotice
  );

  return {
    updatedAt: Date.now(),
    dataUpdatedAt: params.scanMeta?.fetchedAt,
    filterText: params.filterText,
    tagFilter: [...params.tagFilter],
    favoritesOnly: params.favoritesOnly,
    filterMinChars: settings.filtersProjectsMinChars,
    filterMatchMode: settings.filtersMatchMode,
    sortDescription,
    showSummary,
    pageSize: settings.projectPageSize,
    visibleCount: params.visibleCount,
    gitCommitLoading: params.gitCommitLoading,
    gitCommitProgress: params.gitCommitProgress,
    gitCommitTotal: params.gitCommitTotal,
    modifiedLoading: params.modifiedLoading,
    modifiedProgress: params.modifiedProgress,
    modifiedTotal: params.modifiedTotal,
    projects: sorted.map((project) => {
      const tags = params.tagsStore.getTags(project.id);
      const duplicate = params.duplicateInfo.get(project.id);
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
        preferredRunProfileLabel: resolveProjectProfileLabel(project),
        preferredRunTarget: project.preferredRunTarget,
        preferredRunWorkingDirectory: project.preferredRunWorkingDirectory,
        preferredRunKeepOpen: project.preferredRunKeepOpen,
        lastOpened: project.lastOpened,
        lastActivity: project.lastActivity,
        lastModified: project.lastModified,
        lastGitCommit: project.lastGitCommit
      };
    }),
    tagCounts: tagEntries
  };
}

interface WebviewDetailsParams {
  project: Project;
  getEntryPointGroups: (project: Project) => Promise<EntryPointGroups>;
  getRecentRuns: (project: Project) => RunHistoryEntry[];
}

export async function buildProjectsWebviewDetails(
  params: WebviewDetailsParams
): Promise<ProjectsWebviewDetails> {
  const groups = await params.getEntryPointGroups(params.project);
  const pinnedItems = await Promise.all(params.project.pinnedItems.map(async (itemPath) => {
    const stat = await statPath(itemPath);
    return {
      path: itemPath,
      isDirectory: stat?.type === vscode.FileType.Directory
    };
  }));
  const recentRuns = params.getRecentRuns(params.project);
  const runPresets = params.project.runPresets ?? [];
  const browseRoot = await readBrowseEntries(params.project.path);
  const profileLabel = resolveProjectProfileLabel(params.project);
  return {
    projectId: params.project.id,
    preferredRunProfileId: params.project.preferredRunProfileId,
    preferredRunProfileLabel: profileLabel,
    preferredRunTarget: params.project.preferredRunTarget,
    preferredRunWorkingDirectory: params.project.preferredRunWorkingDirectory,
    preferredRunKeepOpen: params.project.preferredRunKeepOpen,
    pinnedItems,
    entryPoints: groups.entryPoints.map((entry) => toWebviewEntry(entry)),
    buildScripts: groups.buildScripts.map((entry) => toWebviewEntry(entry)),
    recentRuns,
    runPresets,
    browseRoot
  };
}

export async function buildProjectsWebviewBrowseEntries(
  project: Project,
  folderPath: string
): Promise<ProjectsWebviewBrowseEntry[] | undefined> {
  if (!isPathUnderRoot(project.path, folderPath)) {
    return undefined;
  }
  return await readBrowseEntries(folderPath);
}
