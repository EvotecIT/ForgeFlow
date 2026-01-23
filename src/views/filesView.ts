import * as path from 'path';
import * as vscode from 'vscode';
import type { FavoritesStore, FavoriteItem } from '../store/favoritesStore';
import type { FilesFilterStore } from '../store/filesFilterStore';
import { baseName } from '../util/path';
import { readDirectory, statPath } from '../util/fs';
import { treeId } from '../util/ids';
import { getForgeFlowSettings } from '../util/config';
import { resolveProfileLabel } from '../run/powershellProfiles';
import { matchesFilterQuery } from '../util/filter';

interface FilesNode {
  readonly id: string;
  getChildren(): Promise<FilesNode[]>;
  getTreeItem(): vscode.TreeItem;
}

export interface PathNode {
  readonly path: string;
}

export class FilesViewProvider implements vscode.TreeDataProvider<FilesNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<FilesNode | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private filterText = '';

  public constructor(
    private readonly favoritesStore: FavoritesStore,
    private readonly filterStore: FilesFilterStore
  ) {
    this.filterText = filterStore.getFilter();
  }

  public getFilter(): string {
    return this.filterText;
  }

  public setFilter(value: string): void {
    this.filterText = value;
    void this.filterStore.setFilter(value);
    this.refresh();
  }

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(element: FilesNode): vscode.TreeItem {
    return element.getTreeItem();
  }

  public async getChildren(element?: FilesNode): Promise<FilesNode[]> {
    if (!element) {
      return [
        new FavoritesRootNode(this.favoritesStore, this.filterText),
        new WorkspaceRootNode(this.filterText)
      ];
    }
    return await element.getChildren();
  }

  public getParent(): FilesNode | undefined {
    return undefined;
  }
}

class FavoritesRootNode implements FilesNode {
  public readonly id = treeId('files', 'favorites-root');

  public constructor(
    private readonly favoritesStore: FavoritesStore,
    private readonly filterText: string
  ) {}

  public async getChildren(): Promise<FilesNode[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    const workspaceRoots = workspaceFolders.map((folder) => normalizeFsPath(path.resolve(folder.uri.fsPath)));
    const minChars = getForgeFlowSettings().filtersFilesMinChars;
    const filter = normalizeFilter(this.filterText, minChars);
    const settings = getForgeFlowSettings();
    const favorites = this.favoritesStore.list();
    const viewMode = settings.filesFavoritesViewMode;
    let visible = favorites;
    if (viewMode === 'workspace') {
      if (workspaceRoots.length === 0) {
        return [new HintNode('Open a folder to show workspace favorites')];
      }
      visible = favorites.filter((item) => workspaceRoots.some((root) => isWithin(root, item.path)));
      if (visible.length === 0) {
        return [new HintNode('No favorites in this workspace')];
      }
    }
    if (viewMode === 'pinned') {
      const pinned = new Set(this.favoritesStore.listWorkspacePinned());
      visible = favorites.filter((item) => pinned.has(item.path));
      if (visible.length === 0) {
        return [new HintNode('No pinned favorites in this workspace')];
      }
    }
    return visible
      .filter((item) => !filter || matchesFilterQuery(baseName(item.path), filter, getForgeFlowSettings().filtersMatchMode))
      .map((item) => new FavoriteItemNode(item, this.filterText));
  }

  public getTreeItem(): vscode.TreeItem {
    const viewMode = getForgeFlowSettings().filesFavoritesViewMode;
    const label = 'Favorites';
    const description = viewMode === 'workspace'
      ? 'Workspace'
      : (viewMode === 'pinned' ? 'Pinned' : 'All');
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = 'forgeflowGroup';
    item.iconPath = new vscode.ThemeIcon('star-full');
    item.description = description;
    return item;
  }
}

class WorkspaceRootNode implements FilesNode {
  public readonly id = treeId('files', 'workspace-root');

  public constructor(private readonly filterText: string) {}

  public async getChildren(): Promise<FilesNode[]> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) {
      return [new HintNode('Open a folder to populate Workspace')];
    }
    const minChars = getForgeFlowSettings().filtersFilesMinChars;
    const filter = normalizeFilter(this.filterText, minChars);
    const mode = getForgeFlowSettings().filtersMatchMode;
    const maxDepth = Math.max(0, getForgeFlowSettings().filtersFilesMaxDepth);
    const results: WorkspaceFolderNode[] = [];
    for (const folder of folders) {
      if (filter) {
        const includeRoot = matchesFilterQuery(folder.name, filter, mode)
          || await hasMatchingDescendant(folder.uri.fsPath, filter, mode, maxDepth);
        if (!includeRoot) {
          continue;
        }
      }
      results.push(new WorkspaceFolderNode(folder.uri.fsPath, folder.name, this.filterText));
    }
    return results;
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem('Workspace', vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = 'forgeflowGroup';
    item.iconPath = new vscode.ThemeIcon('folder');
    return item;
  }
}

class FavoriteItemNode implements FilesNode, PathNode {
  public readonly id: string;
  public readonly path: string;

  public constructor(private readonly favorite: FavoriteItem, private readonly filterText: string) {
    this.path = favorite.path;
    this.id = treeId('favorite', favorite.path);
  }

  public async getChildren(): Promise<FilesNode[]> {
    const stat = await statPath(this.favorite.path);
    if (!stat || stat.type !== vscode.FileType.Directory) {
      return [];
    }
    return await readChildren(this.favorite.path, this.filterText);
  }

  public getTreeItem(): vscode.TreeItem {
    const label = baseName(this.favorite.path);
    const isFolder = this.favorite.kind === 'folder';
    const collapsible = isFolder
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(label, collapsible);
    item.resourceUri = vscode.Uri.file(this.favorite.path);
    item.tooltip = this.favorite.path;
    item.contextValue = 'forgeflowFavorite';
    const profileLabel = resolveFavoriteProfileLabel(this.favorite);
    if (profileLabel) {
      item.description = profileLabel;
    }
    if (!isFolder) {
      item.command = {
        command: 'forgeflow.files.open',
        title: 'Open',
        arguments: [this.favorite.path]
      };
    }
    return item;
  }
}

function resolveFavoriteProfileLabel(favorite: FavoriteItem): string | undefined {
  if (!favorite.profileOverrideId) {
    return undefined;
  }
  const ext = path.extname(favorite.path).toLowerCase();
  if (ext !== '.ps1') {
    return undefined;
  }
  const settings = getForgeFlowSettings();
  return resolveProfileLabel(favorite.profileOverrideId, settings.powershellProfiles);
}

class WorkspaceFolderNode implements FilesNode, PathNode {
  public readonly id: string;
  public readonly path: string;

  public constructor(folderPath: string, private readonly label: string, private readonly filterText: string) {
    this.path = folderPath;
    this.id = treeId('workspace', folderPath);
  }

  public async getChildren(): Promise<FilesNode[]> {
    return await readChildren(this.path, this.filterText);
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.label, vscode.TreeItemCollapsibleState.Expanded);
    item.resourceUri = vscode.Uri.file(this.path);
    item.tooltip = this.path;
    item.contextValue = 'forgeflowWorkspaceRoot';
    return item;
  }
}

class WorkspaceEntryNode implements FilesNode, PathNode {
  public readonly id: string;
  public readonly path: string;

  public constructor(entryPath: string, private readonly entryType: vscode.FileType, private readonly filterText: string) {
    this.path = entryPath;
    this.id = treeId('workspaceEntry', entryPath);
  }

  public async getChildren(): Promise<FilesNode[]> {
    if (this.entryType !== vscode.FileType.Directory) {
      return [];
    }
    return await readChildren(this.path, this.filterText);
  }

  public getTreeItem(): vscode.TreeItem {
    const label = baseName(this.path);
    const collapsible = this.entryType === vscode.FileType.Directory
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(label, collapsible);
    item.resourceUri = vscode.Uri.file(this.path);
    item.tooltip = this.path;
    item.contextValue = 'forgeflowFile';
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

class HintNode implements FilesNode {
  public readonly id: string;

  public constructor(private readonly message: string) {
    this.id = treeId('files', `hint-${message}`);
  }

  public async getChildren(): Promise<FilesNode[]> {
    return [];
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.message, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('info');
    item.contextValue = 'forgeflowHint';
    return item;
  }
}

async function readChildren(folderPath: string, filterText: string): Promise<FilesNode[]> {
  const entries = await readDirectory(folderPath);
  const directories: FilesNode[] = [];
  const files: FilesNode[] = [];
  const minChars = getForgeFlowSettings().filtersFilesMinChars;
  const filter = normalizeFilter(filterText, minChars);
  const mode = getForgeFlowSettings().filtersMatchMode;
  const maxDepth = Math.max(0, getForgeFlowSettings().filtersFilesMaxDepth);

  for (const [name, type] of entries) {
    if (name === '.git') {
      continue;
    }
    const entryPath = path.join(folderPath, name);
    if (type === vscode.FileType.Directory && filter) {
      const includeDir = matchesFilterQuery(name, filter, mode)
        || await hasMatchingDescendant(entryPath, filter, mode, maxDepth - 1);
      if (!includeDir) {
        continue;
      }
    } else if (filter && type !== vscode.FileType.Directory && !matchesFilterQuery(name, filter, mode)) {
      continue;
    }
    const node = new WorkspaceEntryNode(entryPath, type, filterText);
    if (type === vscode.FileType.Directory) {
      directories.push(node);
    } else {
      files.push(node);
    }
  }

  const byName = (a: FilesNode, b: FilesNode): number => {
    const aLabel = a.getTreeItem().label?.toString() ?? '';
    const bLabel = b.getTreeItem().label?.toString() ?? '';
    return aLabel.localeCompare(bLabel);
  };

  return [...directories.sort(byName), ...files.sort(byName)];
}

function normalizeFilter(value: string, minChars: number): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length < minChars) {
    return undefined;
  }
  return trimmed;
}

function isWithin(parent: string, child: string): boolean {
  const resolvedParent = normalizeFsPath(path.resolve(parent));
  const resolvedChild = normalizeFsPath(path.resolve(child));
  const compareParent = process.platform === 'win32' ? resolvedParent.toLowerCase() : resolvedParent;
  const compareChild = process.platform === 'win32' ? resolvedChild.toLowerCase() : resolvedChild;
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

async function hasMatchingDescendant(
  folderPath: string,
  filter: string,
  mode: ReturnType<typeof getForgeFlowSettings>['filtersMatchMode'],
  remainingDepth: number
): Promise<boolean> {
  if (remainingDepth < 0) {
    return false;
  }
  const entries = await readDirectory(folderPath);
  for (const [name, type] of entries) {
    if (name === '.git') {
      continue;
    }
    if (matchesFilterQuery(name, filter, mode)) {
      return true;
    }
    if (type === vscode.FileType.Directory && remainingDepth > 0) {
      const childPath = path.join(folderPath, name);
      if (await hasMatchingDescendant(childPath, filter, mode, remainingDepth - 1)) {
        return true;
      }
    }
  }
  return false;
}
