import * as vscode from 'vscode';
import type { Project, ProjectEntryPoint } from '../../models/project';
import type { RunPreset } from '../../models/run';
import type { RunHistoryEntry } from '../../models/run';
import type { TagsStore } from '../../store/tagsStore';
import type { GitProjectSummary } from '../../git/gitSummary';
import { detectEntryPointGroups, type EntryPointGroups } from '../../scan/entryPointDetector';
import { getForgeFlowSettings } from '../../util/config';
import { resolveProfileLabel } from '../../run/powershellProfiles';
import { treeId } from '../../util/ids';
import { baseName } from '../../util/path';
import { statPath } from '../../util/fs';
import { readBrowseChildren } from './browse';
import type { DuplicateInfo, ProjectNode, ProjectNodeWithEntry, ProjectNodeWithHistory, ProjectNodeWithPath, ProjectNodeWithPreset, ProjectNodeWithProject } from './types';
import {
  collectTagCounts,
  formatHistoryLabel,
  formatPresetLabel,
  formatProjectDescription,
  formatSummaryTooltip,
  historyIconForEntry,
  isPowerShellPath,
  resolveProjectProfileLabel,
  sortProjects
} from './helpers';
import { groupProjectsWithWorktrees } from './duplicateGrouping';

export class ProjectHintNode implements ProjectNode {
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

export class ProjectTagFilterNode implements ProjectNode {
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

export class ProjectTagItemNode implements ProjectNode {
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

export class ProjectTagClearNode implements ProjectNode {
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

export class ProjectGroupNode implements ProjectNode {
  public readonly id: string;

  public constructor(
    private readonly label: string,
    private readonly contextValue: string,
    private readonly projects: Project[],
    private readonly isFavoriteGroup: boolean,
    private readonly description?: string,
    private readonly duplicateInfo?: Map<string, DuplicateInfo>,
    private readonly useDuplicateGrouping = true,
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
    if (!this.duplicateInfo || this.duplicateInfo.size === 0 || !this.useDuplicateGrouping) {
      const nodes = this.projects.map((project) => this.createProjectNode(project));
      return [...nodes, ...this.tailNodes];
    }
    const grouped = await groupProjectsWithWorktrees(this.projects, this.duplicateInfo);
    const nodes: ProjectNode[] = [];
    for (const entry of grouped) {
      if (entry.kind === 'single') {
        nodes.push(this.createProjectNode(entry.project));
        continue;
      }
      nodes.push(
        new ProjectDuplicateGroupNode(
          entry.duplicate.mainProject,
          entry.duplicate.projects,
          entry.duplicate.worktrees,
          this.isFavoriteGroup,
          this.duplicateInfo,
          this.summaries,
          this.showSummary ?? false,
          this.entryPointResolver,
          this.tagsResolver,
          this.historyResolver
        )
      );
    }
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

  private createProjectNode(project: Project): ProjectItemNode {
    return new ProjectItemNode(
      project,
      this.isFavoriteGroup,
      this.duplicateInfo?.get(project.id),
      this.summaries?.[project.id],
      this.showSummary ?? false,
      this.entryPointResolver,
      this.tagsResolver?.(project.id) ?? [],
      this.historyResolver?.(project) ?? []
    );
  }
}

export class ProjectLoadMoreNode implements ProjectNode {
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

export class ProjectDuplicateGroupNode implements ProjectNode {
  public readonly id: string;

  public constructor(
    private readonly mainProject: Project,
    private readonly projects: Project[],
    private readonly worktrees: Project[],
    private readonly isFavoriteGroup: boolean,
    private readonly duplicateInfo?: Map<string, DuplicateInfo>,
    private readonly summaries?: Record<string, GitProjectSummary>,
    private readonly showSummary = false,
    private readonly entryPointResolver?: (project: Project) => Promise<EntryPointGroups>,
    private readonly tagsResolver?: (projectId: string) => string[],
    private readonly historyResolver?: (project: Project) => RunHistoryEntry[]
  ) {
    this.id = treeId('project-duplicate-group', mainProject.id);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    const settings = getForgeFlowSettings();
    const ordered = sortProjects(
      this.projects.slice(),
      settings.projectSortMode,
      settings.projectSortDirection,
      true
    );
    if (settings.projectDuplicateGroupMainFirst) {
      const mainIndex = ordered.findIndex((project) => project.id === this.mainProject.id);
      if (mainIndex > 0) {
        const [main] = ordered.splice(mainIndex, 1);
        if (main) {
          ordered.unshift(main);
        }
      }
    }
    return ordered.map((project) => {
      const node = new ProjectItemNode(
        project,
        this.isFavoriteGroup,
        this.duplicateInfo?.get(project.id),
        this.summaries?.[project.id],
        this.showSummary,
        this.entryPointResolver,
        this.tagsResolver?.(project.id) ?? [],
        this.historyResolver?.(project) ?? []
      );
      return node;
    });
  }

  public getTreeItem(): vscode.TreeItem {
    const worktreeCount = this.worktrees.length;
    const duplicateCount = this.projects.length - 1;
    let description: string | undefined;
    if (worktreeCount > 0) {
      const worktreeSuffix = worktreeCount === 1 ? 'worktree' : 'worktrees';
      const plainDuplicates = Math.max(0, duplicateCount - worktreeCount);
      const duplicateSuffix = plainDuplicates === 1 ? 'duplicate' : 'duplicates';
      description = plainDuplicates > 0
        ? `${worktreeCount} ${worktreeSuffix} • ${plainDuplicates} ${duplicateSuffix}`
        : `${worktreeCount} ${worktreeSuffix}`;
    } else if (duplicateCount > 0) {
      const duplicateSuffix = duplicateCount === 1 ? 'duplicate' : 'duplicates';
      description = `${duplicateCount} ${duplicateSuffix}`;
    }
    const item = new vscode.TreeItem(this.mainProject.name, vscode.TreeItemCollapsibleState.Collapsed);
    item.contextValue = 'forgeflowProjectDuplicateGroup';
    item.resourceUri = vscode.Uri.file(this.mainProject.path);
    item.tooltip = `${this.mainProject.name}\n${this.mainProject.path}`;
    item.iconPath = new vscode.ThemeIcon('repo');
    if (description) {
      item.description = description;
    }
    return item;
  }
}

export class ProjectItemNode implements ProjectNode, ProjectNodeWithProject {
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
    if (this.project.preferredRunKeepOpen) {
      tooltip = tooltip
        ? `${tooltip}\nRun keep-open: ${this.project.preferredRunKeepOpen}`
        : `Run keep-open: ${this.project.preferredRunKeepOpen}`;
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

export class ProjectBrowseNode implements ProjectNode, ProjectNodeWithPath {
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
