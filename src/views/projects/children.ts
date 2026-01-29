import type { Project } from '../../models/project';
import type { RunHistoryEntry } from '../../models/run';
import type { TagsStore } from '../../store/tagsStore';
import type { GitStore } from '../../git/gitStore';
import type { EntryPointGroups } from '../../scan/entryPointDetector';
import { getForgeFlowSettings } from '../../util/config';
import type { DuplicateInfo, ProjectNode } from './types';
import {
  buildSortDescription,
  collectTagCounts,
  getScanRoots,
  matchesProjectFilter,
  matchesTagFilter,
  shouldShowLoadMore,
  sortProjects
} from './helpers';
import { ProjectGroupNode, ProjectHintNode, ProjectLoadMoreNode, ProjectTagFilterNode } from './nodes';

export interface ProjectChildrenContext {
  projects: Project[];
  favoriteIds: string[];
  duplicateInfo: Map<string, DuplicateInfo>;
  filterText: string;
  tagFilter: string[];
  favoritesOnly: boolean;
  visibleCount: number;
  isScanning: boolean;
  scanNotice?: string;
  gitCommitLoading: boolean;
  gitCommitProgress: number;
  gitCommitTotal: number;
  modifiedLoading: boolean;
  modifiedProgress: number;
  modifiedTotal: number;
  tagsStore: TagsStore;
  gitStore: GitStore;
  getEntryPointGroups: (project: Project) => Promise<EntryPointGroups>;
  getRecentRuns: (project: Project) => RunHistoryEntry[];
}

export async function getProjectChildren(context: ProjectChildrenContext, element?: ProjectNode): Promise<ProjectNode[]> {
  if (element) {
    return await element.getChildren();
  }
  const projectIds = context.projects.map((project) => project.id);
  const tagCounts = collectTagCounts(context.tagsStore, projectIds);
  const showTagsNode = context.tagFilter.length > 0 || tagCounts.size > 0;
  const tagsNode = showTagsNode
    ? new ProjectTagFilterNode(context.tagFilter, context.tagsStore, projectIds)
    : undefined;
  const roots = getScanRoots();
  const baseNodes: ProjectNode[] = [];
  if (tagsNode) {
    baseNodes.push(tagsNode);
  }
  if (roots.length === 0 && context.projects.length === 0) {
    return [
      ...baseNodes,
      new ProjectHintNode('Select project roots to scan', 'forgeflow.projects.configureOrRefresh')
    ];
  }
  const rootHint = roots.length === 0
    ? new ProjectHintNode('No scan roots configured. Showing cached projects.', 'forgeflow.projects.configureOrRefresh')
    : undefined;
  const withRootHint = (nodes: ProjectNode[]): ProjectNode[] => (
    rootHint ? [...baseNodes, rootHint, ...nodes] : [...baseNodes, ...nodes]
  );
  if (context.isScanning) {
    return withRootHint([
      new ProjectHintNode('Scanning projects...', 'forgeflow.projects.refresh'),
      ...getRootGroups(context)
    ]);
  }
  if (context.gitCommitLoading) {
    const label = context.gitCommitTotal > 0
      ? `Loading git commit data (${context.gitCommitProgress}/${context.gitCommitTotal})...`
      : 'Loading git commit data...';
    return withRootHint([
      new ProjectHintNode(label, 'forgeflow.projects.refresh'),
      ...getRootGroups(context)
    ]);
  }
  if (context.modifiedLoading) {
    const label = context.modifiedTotal > 0
      ? `Loading modified times (${context.modifiedProgress}/${context.modifiedTotal})...`
      : 'Loading modified times...';
    return withRootHint([
      new ProjectHintNode(label, 'forgeflow.projects.refresh'),
      ...getRootGroups(context)
    ]);
  }
  if (context.projects.length === 0) {
    return withRootHint([
      new ProjectHintNode('No projects found. Refresh or adjust scan roots.', 'forgeflow.projects.configureOrRefresh')
    ]);
  }
  const minChars = getForgeFlowSettings().filtersProjectsMinChars;
  const trimmedFilter = context.filterText.trim();
  const hasTextFilter = trimmedFilter.length >= minChars;
  const filteredProjects = getFilteredProjects(context.projects, context);
  if (trimmedFilter && !hasTextFilter) {
    return withRootHint([
      new ProjectHintNode(`Filter needs at least ${minChars} characters.`, 'forgeflow.projects.filter'),
      ...getRootGroups(context)
    ]);
  }
  if ((trimmedFilter || context.tagFilter.length > 0) && filteredProjects.length === 0) {
    const hint = trimmedFilter
      ? `No projects match filter: ${trimmedFilter}`
      : 'No projects match selected tags.';
    return withRootHint([
      new ProjectHintNode(hint, 'forgeflow.projects.clearFilter')
    ]);
  }
  return withRootHint(getRootGroups(context));
}

function getRootGroups(context: ProjectChildrenContext): ProjectNode[] {
  const favorites = getFavoriteProjects(context);
  const othersResult = getOtherProjects(context);
  const others = othersResult.items;
  const summaries = context.gitStore.getSummaries();
  const showSummary = getForgeFlowSettings().gitShowProjectSummary;
  const sortDescription = buildSortDescription(others, {
    gitCommit: { loading: context.gitCommitLoading, progress: context.gitCommitProgress, total: context.gitCommitTotal },
    modified: { loading: context.modifiedLoading, progress: context.modifiedProgress, total: context.modifiedTotal }
  }, context.filterText, context.tagFilter, context.scanNotice);
  const groups: ProjectNode[] = [];
  if (!context.favoritesOnly) {
    groups.push(new ProjectGroupNode(
      'Favorite Projects',
      'forgeflowGroup',
      favorites,
      true,
      undefined,
      context.duplicateInfo,
      summaries,
      showSummary,
      undefined,
      (project) => context.getEntryPointGroups(project),
      (projectId) => context.tagsStore.getTags(projectId),
      (project) => context.getRecentRuns(project)
    ));
  } else {
    const label = favorites.length === 0 ? 'Favorite Projects (none)' : 'Favorite Projects';
    groups.push(new ProjectGroupNode(
      label,
      'forgeflowGroup',
      favorites,
      true,
      undefined,
      context.duplicateInfo,
      summaries,
      showSummary,
      undefined,
      (project) => context.getEntryPointGroups(project),
      (projectId) => context.tagsStore.getTags(projectId),
      (project) => context.getRecentRuns(project)
    ));
  }
  if (!context.favoritesOnly) {
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
      context.duplicateInfo,
      summaries,
      showSummary,
      tailNodes,
      (project) => context.getEntryPointGroups(project),
      (projectId) => context.tagsStore.getTags(projectId),
      (project) => context.getRecentRuns(project)
    ));
  }
  return groups;
}

function getFilteredProjects(projects: Project[], context: ProjectChildrenContext): Project[] {
  const filterRaw = context.filterText.trim();
  const minChars = getForgeFlowSettings().filtersProjectsMinChars;
  const hasTextFilter = filterRaw.length >= minChars;
  const hasTagFilter = context.tagFilter.length > 0;
  if (!hasTextFilter && !hasTagFilter) {
    return projects;
  }
  return projects.filter((project) => {
    const tags = context.tagsStore.getTags(project.id);
    if (!matchesTagFilter(tags, context.tagFilter)) {
      return false;
    }
    if (!hasTextFilter) {
      return true;
    }
    return matchesProjectFilter(project, filterRaw, tags);
  });
}

function getFavoriteProjects(context: ProjectChildrenContext): Project[] {
  const favorites = context.favoriteIds
    .map((id) => context.projects.find((project) => project.id === id))
    .filter((project): project is Project => project !== undefined);
  return getFilteredProjects(favorites, context);
}

function getOtherProjects(context: ProjectChildrenContext): { items: Project[]; total: number } {
  const favorites = new Set(context.favoriteIds);
  const others = context.projects.filter((project) => !favorites.has(project.id));
  const settings = getForgeFlowSettings();
  const filtered = getFilteredProjects(others, context);
  const fallbackToName = !(
    (settings.projectSortMode === 'gitCommit' && context.gitCommitLoading)
    || (settings.projectSortMode === 'recentModified' && context.modifiedLoading)
  );
  const sorted = sortProjects(filtered, settings.projectSortMode, settings.projectSortDirection, fallbackToName);
  if (context.favoritesOnly) {
    return { items: [], total: sorted.length };
  }
  const pageSize = settings.projectPageSize;
  if (pageSize > 0 && context.visibleCount > 0 && sorted.length > context.visibleCount) {
    return { items: sorted.slice(0, context.visibleCount), total: sorted.length };
  }
  return { items: sorted, total: sorted.length };
}
