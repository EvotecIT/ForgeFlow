import * as path from 'path';
import * as vscode from 'vscode';
import type { FavoritesStore, FavoriteItem } from '../store/favoritesStore';
import { baseName } from '../util/path';
import { readDirectory, statPath } from '../util/fs';
import { treeId } from '../util/ids';

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

  public constructor(private readonly favoritesStore: FavoritesStore) {}

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(element: FilesNode): vscode.TreeItem {
    return element.getTreeItem();
  }

  public async getChildren(element?: FilesNode): Promise<FilesNode[]> {
    if (!element) {
      return [new FavoritesRootNode(this.favoritesStore), new WorkspaceRootNode()];
    }
    return await element.getChildren();
  }

  public getParent(): FilesNode | undefined {
    return undefined;
  }
}

class FavoritesRootNode implements FilesNode {
  public readonly id = treeId('files', 'favorites-root');

  public constructor(private readonly favoritesStore: FavoritesStore) {}

  public async getChildren(): Promise<FilesNode[]> {
    return this.favoritesStore.list().map((item) => new FavoriteItemNode(item));
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem('Favorites', vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = 'forgeflowGroup';
    item.iconPath = new vscode.ThemeIcon('star-full');
    return item;
  }
}

class WorkspaceRootNode implements FilesNode {
  public readonly id = treeId('files', 'workspace-root');

  public async getChildren(): Promise<FilesNode[]> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    return folders.map((folder) => new WorkspaceFolderNode(folder.uri.fsPath, folder.name));
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

  public constructor(private readonly favorite: FavoriteItem) {
    this.path = favorite.path;
    this.id = treeId('favorite', favorite.path);
  }

  public async getChildren(): Promise<FilesNode[]> {
    const stat = await statPath(this.favorite.path);
    if (!stat || stat.type !== vscode.FileType.Directory) {
      return [];
    }
    return await readChildren(this.favorite.path);
  }

  public getTreeItem(): vscode.TreeItem {
    const label = baseName(this.favorite.path);
    const collapsible = this.favorite.kind === 'folder'
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(label, collapsible);
    item.resourceUri = vscode.Uri.file(this.favorite.path);
    item.contextValue = 'forgeflowFavorite';
    item.command = {
      command: 'forgeflow.files.open',
      title: 'Open',
      arguments: [this.favorite.path]
    };
    return item;
  }
}

class WorkspaceFolderNode implements FilesNode, PathNode {
  public readonly id: string;
  public readonly path: string;

  public constructor(folderPath: string, private readonly label: string) {
    this.path = folderPath;
    this.id = treeId('workspace', folderPath);
  }

  public async getChildren(): Promise<FilesNode[]> {
    return await readChildren(this.path);
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.label, vscode.TreeItemCollapsibleState.Expanded);
    item.resourceUri = vscode.Uri.file(this.path);
    item.contextValue = 'forgeflowWorkspaceRoot';
    return item;
  }
}

class WorkspaceEntryNode implements FilesNode, PathNode {
  public readonly id: string;
  public readonly path: string;

  public constructor(entryPath: string, private readonly entryType: vscode.FileType) {
    this.path = entryPath;
    this.id = treeId('workspaceEntry', entryPath);
  }

  public async getChildren(): Promise<FilesNode[]> {
    if (this.entryType !== vscode.FileType.Directory) {
      return [];
    }
    return await readChildren(this.path);
  }

  public getTreeItem(): vscode.TreeItem {
    const label = baseName(this.path);
    const collapsible = this.entryType === vscode.FileType.Directory
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(label, collapsible);
    item.resourceUri = vscode.Uri.file(this.path);
    item.contextValue = 'forgeflowFile';
    item.command = {
      command: 'forgeflow.files.open',
      title: 'Open',
      arguments: [this.path]
    };
    return item;
  }
}

async function readChildren(folderPath: string): Promise<FilesNode[]> {
  const entries = await readDirectory(folderPath);
  const directories: FilesNode[] = [];
  const files: FilesNode[] = [];

  for (const [name, type] of entries) {
    if (name === '.git') {
      continue;
    }
    const entryPath = path.join(folderPath, name);
    const node = new WorkspaceEntryNode(entryPath, type);
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
