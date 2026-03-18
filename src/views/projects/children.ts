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
  getWorktreeSiblingProjects,
  getScanRoots,
  matchesProjectFilter,
  matchesTagFilter,
  shouldShowLoadMore,
  sortProjects
} from './helpers';
import { pickPrimaryByPath } from '../../util/worktreePrimary';
import { ProjectGroupNode, ProjectHintNode, ProjectLoadMoreNode, ProjectTagFilterNode } from './nodes';

export interface ProjectChildrenContext {
  projects: Project[];
  favoriteIds: string[];
  duplicateInfo: Map<string, DuplicateInfo>;
  worktreeInfo: Map<string, boolean>;
  worktreeCommonDirs: Map<string, string>;
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
  const settings = getForgeFlowSettings();
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
      ...getRootGroups(context, settings)
    ]);
  }
  if (context.gitCommitLoading) {
    const label = context.gitCommitTotal > 0
      ? `Loading git commit data (${context.gitCommitProgress}/${context.gitCommitTotal})...`
      : 'Loading git commit data...';
    return withRootHint([
      new ProjectHintNode(label, 'forgeflow.projects.refresh'),
      ...getRootGroups(context, settings)
    ]);
  }
  if (context.modifiedLoading) {
    const label = context.modifiedTotal > 0
      ? `Loading modified times (${context.modifiedProgress}/${context.modifiedTotal})...`
      : 'Loading modified times...';
    return withRootHint([
      new ProjectHintNode(label, 'forgeflow.projects.refresh'),
      ...getRootGroups(context, settings)
    ]);
  }
  if (context.projects.length === 0) {
    return withRootHint([
      new ProjectHintNode('No projects found. Refresh or adjust scan roots.', 'forgeflow.projects.configureOrRefresh')
    ]);
  }
  const minChars = settings.filtersProjectsMinChars;
  const trimmedFilter = context.filterText.trim();
  const hasTextFilter = trimmedFilter.length >= minChars;
  const filteredProjects = getFilteredProjects(context.projects, context);
  if (trimmedFilter && !hasTextFilter) {
    return withRootHint([
      new ProjectHintNode(`Filter needs at least ${minChars} characters.`, 'forgeflow.projects.filter'),
      ...getRootGroups(context, settings)
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
  return withRootHint(getRootGroups(context, settings));
}

function getRootGroups(context: ProjectChildrenContext, settings: ReturnType<typeof getForgeFlowSettings>): ProjectNode[] {
  const favorites = getFavoriteProjects(context);
  const othersResult = getOtherProjects(context, settings);
  const others = othersResult.items;
  const resolvers = createGroupResolvers(context);
  const summaries = context.gitStore.getSummaries();
  const showSummary = settings.gitShowProjectSummary;
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
      true,
      summaries,
      showSummary,
      undefined,
      resolvers
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
      true,
      summaries,
      showSummary,
      undefined,
      resolvers
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
      true,
      summaries,
      showSummary,
      tailNodes,
      resolvers
    ));
  }
  const worktreeGroupMode = settings.projectWorktreesGroupMode;
  const worktrees = settings.projectShowWorktreesGroup
    ? getWorktreeProjects(context, settings, worktreeGroupMode === 'grouped')
    : [];
  if (worktrees.length > 0) {
    const worktreeCount = worktrees.filter((project) => context.worktreeInfo.get(project.id)).length;
    groups.push(new ProjectGroupNode(
      'Worktrees',
      'forgeflowGroup',
      worktrees,
      false,
      `Scan Roots • ${worktreeCount}`,
      context.duplicateInfo,
      worktreeGroupMode === 'grouped',
      summaries,
      showSummary,
      undefined,
      resolvers
    ));
  }
  return groups;
}

function createGroupResolvers(context: ProjectChildrenContext): {
  entryPointResolver: (project: Project) => Promise<EntryPointGroups>;
  tagsResolver: (projectId: string) => string[];
  historyResolver: (project: Project) => RunHistoryEntry[];
  worktreeSiblingsResolver: (project: Project) => Project[];
} {
  return {
    entryPointResolver: (project) => context.getEntryPointGroups(project),
    tagsResolver: (projectId) => context.tagsStore.getTags(projectId),
    historyResolver: (project) => context.getRecentRuns(project),
    worktreeSiblingsResolver: (project) => getWorktreeSiblingsForProject(context, project)
  };
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

function getOtherProjects(
  context: ProjectChildrenContext,
  settings: ReturnType<typeof getForgeFlowSettings>
): { items: Project[]; total: number } {
  const favorites = new Set(context.favoriteIds);
  const hideWorktreesInProjects = settings.projectShowWorktreesGroup;
  const others = context.projects.filter((project) => {
    if (favorites.has(project.id)) {
      return false;
    }
    if (hideWorktreesInProjects && context.worktreeInfo.get(project.id)) {
      return false;
    }
    return true;
  });
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

function getWorktreeProjects(
  context: ProjectChildrenContext,
  settings: ReturnType<typeof getForgeFlowSettings>,
  includePrimaryProjects: boolean
): Project[] {
  const favorites = new Set(context.favoriteIds);
  const visible = context.projects.filter((project) => {
    if (!context.worktreeInfo.get(project.id)) {
      return false;
    }
    if (context.favoritesOnly && !favorites.has(project.id)) {
      return false;
    }
    return true;
  });
  if (includePrimaryProjects && visible.length > 0) {
    const existing = new Set(visible.map((project) => project.id));
    const duplicateKeys = new Set(
      visible
        .map((project) => context.duplicateInfo.get(project.id)?.key)
        .filter((key): key is string => Boolean(key))
    );
    for (const key of duplicateKeys) {
      const siblings = context.projects.filter((project) => context.duplicateInfo.get(project.id)?.key === key);
      maybeAddPrimaryWorktreeSibling(siblings, context, favorites, existing, visible);
    }
    const commonDirs = new Set(
      visible
        .map((project) => context.worktreeCommonDirs.get(project.id))
        .filter((value): value is string => Boolean(value))
    );
    for (const commonDir of commonDirs) {
      const siblings = context.projects.filter((project) => context.worktreeCommonDirs.get(project.id) === commonDir);
      if (siblings.length < 2) {
        continue;
      }
      maybeAddPrimaryWorktreeSibling(siblings, context, favorites, existing, visible);
    }
  }
  const filtered = getFilteredProjects(visible, context);
  const fallbackToName = !(
    (settings.projectSortMode === 'gitCommit' && context.gitCommitLoading)
    || (settings.projectSortMode === 'recentModified' && context.modifiedLoading)
  );
  return sortProjects(filtered, settings.projectSortMode, settings.projectSortDirection, fallbackToName);
}

function maybeAddPrimaryWorktreeSibling(
  siblings: Project[],
  context: Pick<ProjectChildrenContext, 'worktreeInfo' | 'favoritesOnly'>,
  favorites: Set<string>,
  existing: Set<string>,
  target: Project[]
): void {
  if (siblings.length === 0) {
    return;
  }
  const primary = pickPrimaryWorktreeSibling(siblings, context.worktreeInfo);
  if (!primary || existing.has(primary.id)) {
    return;
  }
  if (context.favoritesOnly && !favorites.has(primary.id)) {
    return;
  }
  target.push(primary);
  existing.add(primary.id);
}

function pickPrimaryWorktreeSibling(siblings: Project[], worktreeInfo: Map<string, boolean>): Project | undefined {
  return pickPrimaryByPath(siblings, (project) => Boolean(worktreeInfo.get(project.id)));
}

function getWorktreeSiblingsForProject(context: ProjectChildrenContext, project: Project): Project[] {
  const siblings = getWorktreeSiblingProjects(context.projects, project, context.duplicateInfo, context.worktreeInfo);
  const settings = getForgeFlowSettings();
  const fallbackToName = !(
    (settings.projectSortMode === 'gitCommit' && context.gitCommitLoading)
    || (settings.projectSortMode === 'recentModified' && context.modifiedLoading)
  );
  return sortProjects(siblings, settings.projectSortMode, settings.projectSortDirection, fallbackToName);
}
