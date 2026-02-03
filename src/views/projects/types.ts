import type * as vscode from 'vscode';
import type { Project, ProjectEntryPoint, ProjectIdentity } from '../../models/project';
import type { RunPreset } from '../../models/run';
import type { RunHistoryEntry } from '../../models/run';
import type { GitProjectSummary } from '../../git/gitSummary';
import type { ForgeFlowSettings } from '../../util/config';
import type { EntryPointGroups } from '../../scan/entryPointDetector';

export interface ProjectNode {
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
  preferredRunKeepOpen?: Project['preferredRunKeepOpen'];
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
  dataUpdatedAt?: number;
  filterText: string;
  tagFilter: string[];
  favoritesOnly: boolean;
  filterMinChars: number;
  filterMatchMode: ForgeFlowSettings['filtersMatchMode'];
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
  preferredRunProfileId?: string;
  preferredRunProfileLabel?: string;
  preferredRunTarget?: Project['preferredRunTarget'];
  preferredRunWorkingDirectory?: string;
  preferredRunKeepOpen?: Project['preferredRunKeepOpen'];
  pinnedItems: ProjectsWebviewPinnedItem[];
  entryPoints: ProjectsWebviewEntry[];
  buildScripts: ProjectsWebviewEntry[];
  recentRuns: RunHistoryEntry[];
  runPresets: RunPreset[];
  browseRoot: ProjectsWebviewBrowseEntry[];
}

export interface EntryPointCacheEntry {
  key: string;
  fetchedAt: number;
  groups: EntryPointGroups;
}

export interface DuplicateInfo {
  index: number;
  total: number;
  key: string;
}
