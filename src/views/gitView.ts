import * as path from 'path';
import * as vscode from 'vscode';
import type { Project } from '../models/project';
import type { ProjectsStore } from '../store/projectsStore';
import { treeId } from '../util/ids';
import type { GitService, GitBranchGroup, GitBranchInfo, GitRepoStatus } from '../git/gitService';
import type { GitFilterStore } from '../store/gitFilterStore';
import { matchesFilterQuery } from '../util/filter';
import type { ForgeFlowLogger } from '../util/log';
import type { GitStore } from '../git/gitStore';
import { buildProjectSummary } from '../git/gitSummary';
import { getForgeFlowSettings, type GitBranchFilterMode, type GitBranchSortMode } from '../util/config';

interface GitNode {
  readonly id: string;
  getChildren(): Promise<GitNode[]>;
  getTreeItem(): vscode.TreeItem;
}

interface GitNodeWithBranch {
  readonly branch: GitBranchInfo;
}

interface GitNodeWithProject {
  readonly project: Project;
}

export class GitViewProvider implements vscode.TreeDataProvider<GitNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<GitNode | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private status?: GitRepoStatus;
  private isLoading = false;
  private pendingRefresh = false;
  private errorMessage?: string;
  private lastErrorProjectId?: string;
  private filterText = '';

  public constructor(
    private readonly projectsStore: ProjectsStore,
    private readonly gitService: GitService,
    private readonly gitStore: GitStore,
    private readonly filterStore: GitFilterStore,
    private readonly logger: ForgeFlowLogger
  ) {
    this.filterText = filterStore.getFilter();
  }

  public getFilter(): string {
    return this.filterText;
  }

  public setFilter(value: string): void {
    this.filterText = value;
    void this.filterStore.setFilter(value);
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public async refresh(): Promise<void> {
    if (this.isLoading) {
      this.pendingRefresh = true;
      return;
    }
    this.isLoading = true;
    this.onDidChangeTreeDataEmitter.fire(undefined);
    const project = await this.resolveSelectedProject();
    if (!project) {
      this.status = undefined;
      this.isLoading = false;
      this.onDidChangeTreeDataEmitter.fire(undefined);
      return;
    }
    try {
      const overrides = this.gitStore.getProjectSettings(project.id);
      this.status = await this.gitService.getRepoStatus(project.path, project.name, overrides);
      this.errorMessage = undefined;
      this.lastErrorProjectId = undefined;
      if (this.status) {
        await this.gitStore.setSummary(project.id, buildProjectSummary(this.status));
      } else {
        this.errorMessage = `ForgeFlow: Git status failed for ${project.name}. See Output > ForgeFlow for details.`;
        if (this.lastErrorProjectId !== project.id) {
          this.lastErrorProjectId = project.id;
          vscode.window.showWarningMessage(this.errorMessage);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Git status failed for ${project.name}: ${message}`);
      this.status = undefined;
      this.errorMessage = `ForgeFlow: Git status failed for ${project.name}. See Output > ForgeFlow for details.`;
      if (this.lastErrorProjectId !== project.id) {
        this.lastErrorProjectId = project.id;
        vscode.window.showWarningMessage(this.errorMessage);
      }
    } finally {
      this.isLoading = false;
      this.onDidChangeTreeDataEmitter.fire(undefined);
      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        await this.refresh();
      }
    }
  }

  public async selectProject(projectId?: string): Promise<void> {
    await this.gitStore.setSelectedProjectId(projectId);
    await this.refresh();
  }

  public getSelectedProjectId(): string | undefined {
    return this.gitStore.getSelectedProjectId();
  }

  public getTreeItem(element: GitNode): vscode.TreeItem {
    return element.getTreeItem();
  }

  public async getChildren(element?: GitNode): Promise<GitNode[]> {
    if (element) {
      return await element.getChildren();
    }

    const gitProjects = this.getGitProjects();
    const minChars = getForgeFlowSettings().filtersGitMinChars;
    const filter = normalizeFilter(this.filterText, minChars);
    const mode = getForgeFlowSettings().filtersMatchMode;
    const filteredProjects = filter
      ? gitProjects.filter((project) => matchesFilterQuery(`${project.name} ${project.path}`, filter, mode))
      : gitProjects;
    if (gitProjects.length === 0) {
      return [new GitHintNode('No git projects found. Adjust scan roots.', 'forgeflow.projects.configureScanRoots')];
    }

    const selected = await this.resolveSelectedProject();
    if (!selected) {
      return [
        new GitProjectPickerNode(filteredProjects),
        new GitHintNode('Select a project to inspect branches', 'forgeflow.git.selectProject')
      ];
    }

    if (this.isLoading) {
      return [
        new GitProjectPickerNode(filteredProjects, selected.id),
        new GitHintNode('Loading git status...', 'forgeflow.git.refresh'),
        new GitProjectNode(selected, this.status)
      ];
    }

    if (!this.status) {
      void this.refresh();
      if (this.errorMessage) {
        return [
          new GitProjectPickerNode(filteredProjects, selected.id),
          new GitHintNode(this.errorMessage, 'forgeflow.git.refresh'),
          new GitProjectNode(selected, this.status)
        ];
      }
      return [
        new GitProjectPickerNode(filteredProjects, selected.id),
        new GitHintNode('Loading git status...', 'forgeflow.git.refresh'),
        new GitProjectNode(selected, this.status)
      ];
    }

    return [
      new GitProjectPickerNode(filteredProjects, selected.id),
      new GitProjectNode(selected, this.status),
      ...buildBranchGroups(this.status, this.filterText)
    ];
  }

  public getParent(): GitNode | undefined {
    return undefined;
  }

  private getGitProjects(): Project[] {
    return this.projectsStore.list().filter((project) => project.type === 'git');
  }

  private async resolveSelectedProject(): Promise<Project | undefined> {
    const gitProjects = this.getGitProjects();
    if (gitProjects.length === 0) {
      return undefined;
    }
    const selectedId = this.gitStore.getSelectedProjectId();
    if (selectedId) {
      const match = gitProjects.find((project) => project.id === selectedId);
      if (match) {
        return match;
      }
    }
    const activePath = getActiveFilePath();
    if (activePath) {
      const match = findProjectByPath(gitProjects, activePath);
      if (match) {
        await this.gitStore.setSelectedProjectId(match.id);
        return match;
      }
    }
    const workspacePath = getWorkspacePath();
    if (workspacePath) {
      const match = findProjectByPath(gitProjects, workspacePath);
      if (match) {
        await this.gitStore.setSelectedProjectId(match.id);
        return match;
      }
    }
    const fallback = gitProjects[0];
    if (fallback) {
      await this.gitStore.setSelectedProjectId(fallback.id);
    }
    return fallback;
  }
}

class GitHintNode implements GitNode {
  public readonly id: string;

  public constructor(private readonly message: string, private readonly commandId: string) {
    this.id = treeId('git-hint', message);
  }

  public async getChildren(): Promise<GitNode[]> {
    return [];
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.message, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('info');
    item.contextValue = 'forgeflowGitHint';
    item.command = { command: this.commandId, title: this.message };
    return item;
  }
}

class GitProjectPickerNode implements GitNode {
  public readonly id: string;

  public constructor(private readonly projects: Project[], private readonly selectedId?: string) {
    this.id = treeId('git-projects', 'root');
  }

  public async getChildren(): Promise<GitNode[]> {
    return this.projects.map((project) => new GitProjectChoiceNode(project, project.id === this.selectedId));
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem('Projects', vscode.TreeItemCollapsibleState.Collapsed);
    item.contextValue = 'forgeflowGitProjects';
    item.iconPath = new vscode.ThemeIcon('repo');
    return item;
  }
}

class GitProjectChoiceNode implements GitNode, GitNodeWithProject {
  public readonly id: string;

  public constructor(public readonly project: Project, private readonly isSelected: boolean) {
    this.id = treeId('git-project-choice', project.id);
  }

  public async getChildren(): Promise<GitNode[]> {
    return [];
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.project.name, vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'forgeflowGitProjectChoice';
    item.iconPath = new vscode.ThemeIcon(this.isSelected ? 'check' : 'repo');
    item.description = this.isSelected ? 'selected' : undefined;
    item.command = {
      command: 'forgeflow.git.selectProject',
      title: 'Select Git Project',
      arguments: [this.project.id]
    };
    return item;
  }
}

class GitProjectNode implements GitNode, GitNodeWithProject {
  public readonly id: string;

  public constructor(public readonly project: Project, private readonly status?: GitRepoStatus) {
    this.id = treeId('git-project', project.id);
  }

  public async getChildren(): Promise<GitNode[]> {
    const details: GitNode[] = [];
    details.push(new GitDetailNode('Path', this.project.path));
    if (this.status) {
      details.push(new GitDetailNode('Current', this.status.isDetached ? 'DETACHED' : this.status.currentBranch));
      details.push(new GitDetailNode('Default', this.status.defaultBranch));
      details.push(new GitDetailNode('Dirty', this.status.isDirty ? 'Yes' : 'No'));
    }
    return details;
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.project.name, vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = 'forgeflowGitProject';
    item.iconPath = new vscode.ThemeIcon('source-control');
    if (this.status) {
      item.description = this.status.isDetached ? 'DETACHED' : this.status.currentBranch;
      item.tooltip = this.project.path;
    }
    return item;
  }
}

function getActiveFilePath(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.scheme !== 'file') {
    return undefined;
  }
  return normalizeFsPath(editor.document.uri.fsPath);
}

function getWorkspacePath(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  const first = folders[0];
  if (!first) {
    return undefined;
  }
  return normalizeFsPath(first.uri.fsPath);
}

function findProjectByPath(projects: Project[], filePath: string): Project | undefined {
  const resolved = normalizeFsPath(path.resolve(filePath));
  return projects.find((project) => isWithin(normalizeFsPath(project.path), resolved));
}

function isWithin(parent: string, child: string): boolean {
  const compareParent = process.platform === 'win32' ? parent.toLowerCase() : parent;
  const compareChild = process.platform === 'win32' ? child.toLowerCase() : child;
  const relative = path.relative(compareParent, compareChild);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizeFsPath(value: string): string {
  if (process.platform === 'win32') {
    const match = /^\/([a-zA-Z]:)(\/.*)/.exec(value);
    if (match) {
      return `${match[1]}${match[2]}`.replace(/\//g, '\\');
    }
    return value.replace(/\//g, '\\');
  }
  return value;
}

class GitDetailNode implements GitNode {
  public readonly id: string;

  public constructor(private readonly label: string, private readonly value: string) {
    this.id = treeId('git-detail', `${label}:${value}`);
  }

  public async getChildren(): Promise<GitNode[]> {
    return [];
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(`${this.label}: ${this.value}`, vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'forgeflowGitDetail';
    item.iconPath = new vscode.ThemeIcon('circle-small-filled');
    return item;
  }
}

class GitBranchGroupNode implements GitNode {
  public readonly id: string;

  public constructor(private readonly label: string, private readonly branches: GitBranchInfo[], private readonly kind: GitBranchGroup) {
    this.id = treeId('git-branch-group', `${label}:${kind}`);
  }

  public async getChildren(): Promise<GitNode[]> {
    return this.branches.map((branch) => new GitBranchNode(branch, this.kind));
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.label, vscode.TreeItemCollapsibleState.Collapsed);
    item.contextValue = 'forgeflowGitGroup';
    item.description = String(this.branches.length);
    item.iconPath = new vscode.ThemeIcon(groupIcon(this.kind));
    return item;
  }
}

class GitBranchNode implements GitNode, GitNodeWithBranch {
  public readonly id: string;

  public constructor(public readonly branch: GitBranchInfo, kind: GitBranchGroup) {
    this.id = treeId('git-branch', `${branch.name}:${kind}`);
  }

  public async getChildren(): Promise<GitNode[]> {
    return [];
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.branch.name, vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'forgeflowGitBranch';
    item.description = this.branch.statusLabel;
    item.iconPath = new vscode.ThemeIcon(this.branch.isCurrent ? 'check' : 'git-branch');
    return item;
  }
}

function buildBranchGroups(status: GitRepoStatus, filterText: string): GitNode[] {
  const settings = getForgeFlowSettings();
  const showClean = settings.gitShowCleanBranches;
  const minChars = settings.filtersGitMinChars;
  const filter = normalizeFilter(filterText, minChars);
  const filtered = filter
    ? status.branches.filter((branch) => matchesBranchFilter(branch, filter))
    : status.branches;
  const sorted = sortBranches(filtered, settings.gitBranchSortMode, settings.gitBranchSortDirection);
  const groups = groupBranches(sorted);
  const nodes: GitNode[] = [];
  const filterMode = settings.gitBranchFilter;

  if (shouldIncludeGroup(filterMode, 'gone') && groups.gone.length > 0) {
    nodes.push(new GitBranchGroupNode('Gone Branches', groups.gone, 'gone'));
  }
  if (shouldIncludeGroup(filterMode, 'merged') && groups.merged.length > 0) {
    nodes.push(new GitBranchGroupNode('Merged Branches', groups.merged, 'merged'));
  }
  if (shouldIncludeGroup(filterMode, 'noUpstream') && groups.noUpstream.length > 0) {
    nodes.push(new GitBranchGroupNode('No Upstream', groups.noUpstream, 'noUpstream'));
  }
  if (shouldIncludeGroup(filterMode, 'aheadBehind') && groups.aheadBehind.length > 0) {
    nodes.push(new GitBranchGroupNode('Ahead/Behind', groups.aheadBehind, 'aheadBehind'));
  }
  if (shouldIncludeGroup(filterMode, 'stale') && groups.stale.length > 0) {
    nodes.push(new GitBranchGroupNode('Stale Branches', groups.stale, 'stale'));
  }
  if (showClean && shouldIncludeGroup(filterMode, 'clean') && groups.clean.length > 0) {
    nodes.push(new GitBranchGroupNode('Clean Branches', groups.clean, 'clean'));
  }

  return nodes;
}

function matchesBranchFilter(branch: GitBranchInfo, filter: string): boolean {
  const haystack = [
    branch.name,
    branch.upstream,
    branch.statusLabel,
    branch.track
  ].filter(Boolean).join(' ');
  return matchesFilterQuery(haystack, filter, getForgeFlowSettings().filtersMatchMode);
}

function normalizeFilter(value: string, minChars: number): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length < minChars) {
    return undefined;
  }
  return trimmed;
}

function groupBranches(branches: GitBranchInfo[]): Record<GitBranchGroup, GitBranchInfo[]> {
  const result: Record<GitBranchGroup, GitBranchInfo[]> = {
    current: [],
    gone: [],
    merged: [],
    noUpstream: [],
    aheadBehind: [],
    stale: [],
    clean: []
  };

  for (const branch of branches) {
    if (branch.isCurrent) {
      result.current.push(branch);
      continue;
    }
    if (branch.isGone) {
      result.gone.push(branch);
      continue;
    }
    if (branch.isMerged) {
      result.merged.push(branch);
      continue;
    }
    if (!branch.hasUpstream) {
      result.noUpstream.push(branch);
      continue;
    }
    if (branch.ahead > 0 || branch.behind > 0) {
      result.aheadBehind.push(branch);
      continue;
    }
    if (branch.isStale) {
      result.stale.push(branch);
      continue;
    }
    result.clean.push(branch);
  }

  return result;
}

function groupIcon(kind: GitBranchGroup): string {
  switch (kind) {
    case 'gone':
      return 'trash';
    case 'merged':
      return 'check';
    case 'noUpstream':
      return 'circle-slash';
    case 'aheadBehind':
      return 'arrow-both';
    case 'stale':
      return 'clock';
    case 'clean':
      return 'circle-large-outline';
    default:
      return 'git-branch';
  }
}

export function isGitBranchNode(target: unknown): target is GitNodeWithBranch {
  return typeof target === 'object' && target !== null && 'branch' in target;
}

export function isGitProjectNode(target: unknown): target is GitNodeWithProject {
  return typeof target === 'object' && target !== null && 'project' in target;
}

function shouldIncludeGroup(filter: GitBranchFilterMode, group: GitBranchGroup): boolean {
  if (filter === 'all') {
    return group !== 'current';
  }
  if (filter === 'actionable') {
    return group !== 'current' && group !== 'clean';
  }
  return filter === group;
}

function sortBranches(
  branches: GitBranchInfo[],
  mode: GitBranchSortMode,
  direction: 'asc' | 'desc'
): GitBranchInfo[] {
  const dir = direction === 'asc' ? 1 : -1;
  const list = [...branches];
  list.sort((a, b) => {
    if (mode === 'name') {
      return dir * a.name.localeCompare(b.name);
    }
    if (mode === 'lastCommit') {
      const aTime = a.lastCommit ? Date.parse(a.lastCommit) : 0;
      const bTime = b.lastCommit ? Date.parse(b.lastCommit) : 0;
      return dir * (aTime - bTime);
    }
    if (mode === 'age') {
      const aAge = a.ageDays ?? Number.MAX_SAFE_INTEGER;
      const bAge = b.ageDays ?? Number.MAX_SAFE_INTEGER;
      return dir * (aAge - bAge);
    }
    const aRank = statusRank(a);
    const bRank = statusRank(b);
    if (aRank !== bRank) {
      return dir * (aRank - bRank);
    }
    return dir * a.name.localeCompare(b.name);
  });
  return list;
}

function statusRank(branch: GitBranchInfo): number {
  if (branch.isGone) {
    return 1;
  }
  if (branch.isMerged) {
    return 2;
  }
  if (!branch.hasUpstream) {
    return 3;
  }
  if (branch.ahead > 0 || branch.behind > 0) {
    return 4;
  }
  if (branch.isStale) {
    return 5;
  }
  if (branch.isCurrent) {
    return 6;
  }
  return 7;
}
