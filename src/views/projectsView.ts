import * as path from 'path';
import * as vscode from 'vscode';
import type { Project, ProjectEntryPoint } from '../models/project';
import { detectEntryPoints } from '../scan/entryPointDetector';
import { detectProjectIdentity } from '../scan/identityDetector';
import { ProjectScanner } from '../scan/projectScanner';
import type { ProjectsStore } from '../store/projectsStore';
import { getForgeFlowSettings, ProjectSortMode } from '../util/config';
import { readDirectory, statPath } from '../util/fs';
import { treeId } from '../util/ids';
import { baseName } from '../util/path';

interface ProjectNode {
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

export class ProjectsViewProvider implements vscode.TreeDataProvider<ProjectNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ProjectNode | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private projects: Project[] = [];
  private favoriteIds: string[] = [];

  public constructor(
    private readonly projectsStore: ProjectsStore,
    private readonly scanner: ProjectScanner
  ) {}

  public async refresh(): Promise<void> {
    const settings = getForgeFlowSettings();
    const roots = getScanRoots();
    const existing = this.projectsStore.list();
    const projects = await this.scanner.scan(roots, settings.projectScanMaxDepth, existing);
    const hydrated = await this.hydrateIdentities(projects);
    await this.projectsStore.saveProjects(hydrated);
    this.projects = hydrated;
    this.favoriteIds = this.projectsStore.getFavoriteIds();
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(element: ProjectNode): vscode.TreeItem {
    return element.getTreeItem();
  }

  public async getChildren(element?: ProjectNode): Promise<ProjectNode[]> {
    if (!element) {
      const roots = getScanRoots();
      if (roots.length === 0) {
        return [new ProjectHintNode('Select project roots to scan', 'forgeflow.projects.configureScanRoots')];
      }
      if (this.projects.length === 0) {
        return [new ProjectHintNode('No projects found. Refresh or adjust scan roots.', 'forgeflow.projects.refresh')];
      }
      const favorites = this.getFavoriteProjects();
      const others = this.getOtherProjects();
      return [
        new ProjectGroupNode('Favorite Projects', 'forgeflowGroup', favorites, true),
        new ProjectGroupNode('Projects', 'forgeflowGroup', others, false)
      ];
    }
    return await element.getChildren();
  }

  public getParent(): ProjectNode | undefined {
    return undefined;
  }

  private getFavoriteProjects(): Project[] {
    const favorites = this.favoriteIds
      .map((id) => this.projects.find((project) => project.id === id))
      .filter((project): project is Project => project !== undefined);
    return favorites;
  }

  private getOtherProjects(): Project[] {
    const favorites = new Set(this.favoriteIds);
    const others = this.projects.filter((project) => !favorites.has(project.id));
    return sortProjects(others, getForgeFlowSettings().projectSortMode);
  }

  private async hydrateIdentities(projects: Project[]): Promise<Project[]> {
    const results: Project[] = [];
    for (const project of projects) {
      if (project.identity) {
        results.push(project);
        continue;
      }
      const detected = await detectProjectIdentity(project.path);
      if (!detected.identity) {
        results.push(project);
        continue;
      }
      const updated = { ...project, identity: detected.identity };
      await this.projectsStore.updateProject(updated);
      results.push(updated);
    }
    return results;
  }
}

class ProjectHintNode implements ProjectNode {
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

class ProjectGroupNode implements ProjectNode {
  public readonly id: string;

  public constructor(
    private readonly label: string,
    private readonly contextValue: string,
    private readonly projects: Project[],
    private readonly isFavoriteGroup: boolean
  ) {
    this.id = treeId('projects-group', label);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    return this.projects.map((project) => new ProjectItemNode(project, this.isFavoriteGroup));
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.label, vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = this.contextValue;
    item.iconPath = new vscode.ThemeIcon(this.isFavoriteGroup ? 'star-full' : 'folder-library');
    return item;
  }
}

class ProjectItemNode implements ProjectNode, ProjectNodeWithProject {
  public readonly id: string;

  public constructor(public readonly project: Project, private readonly isFavorite: boolean) {
    this.id = treeId('project', project.id);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    return [
      new ProjectPinnedGroupNode(this.project),
      new ProjectEntryGroupNode(this.project),
      new ProjectBrowseGroupNode(this.project)
    ];
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.project.name, vscode.TreeItemCollapsibleState.Collapsed);
    item.resourceUri = vscode.Uri.file(this.project.path);
    item.contextValue = this.isFavorite ? 'forgeflowProjectFavorite' : 'forgeflowProject';
    item.description = this.project.type;
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

class ProjectEntryGroupNode implements ProjectNode {
  public readonly id: string;

  public constructor(private readonly project: Project) {
    this.id = treeId('project-entry-group', project.id);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    const entries = await detectEntryPoints(this.project.path);
    return entries.map((entry) => new ProjectEntryNode(this.project, entry));
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

  public constructor(project: Project, public readonly entry: ProjectEntryPoint) {
    this.id = treeId('project-entry', `${project.id}:${entry.path}`);
  }

  public async getChildren(): Promise<ProjectNode[]> {
    return [];
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.entry.label, vscode.TreeItemCollapsibleState.None);
    item.resourceUri = vscode.Uri.file(this.entry.path);
    item.contextValue = 'forgeflowProjectEntry';
    item.command = {
      command: 'forgeflow.projects.openEntryPoint',
      title: 'Open Entry Point',
      arguments: [this.entry]
    };
    item.description = this.entry.kind;
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

class ProjectBrowseNode implements ProjectNode, ProjectNodeWithPath {
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

async function readBrowseChildren(folderPath: string, project: Project): Promise<ProjectNode[]> {
  const entries = await readDirectory(folderPath);
  const directories: ProjectNode[] = [];
  const files: ProjectNode[] = [];

  for (const [name, type] of entries) {
    if (name === '.git') {
      continue;
    }
    const entryPath = path.join(folderPath, name);
    const node = new ProjectBrowseNode(project, entryPath, type);
    if (type === vscode.FileType.Directory) {
      directories.push(node);
    } else {
      files.push(node);
    }
  }

  const byName = (a: ProjectNode, b: ProjectNode): number => {
    const aLabel = a.getTreeItem().label?.toString() ?? '';
    const bLabel = b.getTreeItem().label?.toString() ?? '';
    return aLabel.localeCompare(bLabel);
  };

  return [...directories.sort(byName), ...files.sort(byName)];
}

function sortProjects(projects: Project[], mode: ProjectSortMode): Project[] {
  const sorted = [...projects];
  sorted.sort((a, b) => {
    if (mode === 'alphabetical') {
      return a.name.localeCompare(b.name);
    }

    if (mode === 'recentModified') {
      const diff = (b.lastModified ?? 0) - (a.lastModified ?? 0);
      if (diff !== 0) {
        return diff;
      }
      return a.name.localeCompare(b.name);
    }

    const openedDiff = (b.lastOpened ?? 0) - (a.lastOpened ?? 0);
    if (openedDiff !== 0) {
      return openedDiff;
    }
    const modifiedDiff = (b.lastModified ?? 0) - (a.lastModified ?? 0);
    if (modifiedDiff !== 0) {
      return modifiedDiff;
    }
    return a.name.localeCompare(b.name);
  });
  return sorted;
}

function getScanRoots(): string[] {
  const settings = getForgeFlowSettings();
  if (settings.projectScanRoots.length > 0) {
    return settings.projectScanRoots;
  }
  return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
}
