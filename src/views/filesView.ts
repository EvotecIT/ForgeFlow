import { execFile } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import type { FavoritesStore, FavoriteItem } from '../store/favoritesStore';
import type { FilesFilterStore } from '../store/filesFilterStore';
import { baseName } from '../util/path';
import { readDirectory, statPath } from '../util/fs';
import { treeId } from '../util/ids';
import { getForgeFlowSettings } from '../util/config';
import { resolveProfileLabel } from '../run/powershellProfiles';
import { matchesFilterQuery } from '../util/filter';

const execFileAsync = promisify(execFile);

export interface FilesNode {
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
  private worktreeCache = new Map<string, WorktreeGroupCacheEntry>();
  private readonly worktreeCacheTtlMs = 30_000;

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

  public syncFilterFromStore(): void {
    const next = this.filterStore.getFilter();
    if (next === this.filterText) {
      return;
    }
    this.filterText = next;
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
        new WorkspaceRootNode(this.filterText),
        new WorktreesRootNode(this.filterText, () => this.getWorktreeGroups())
      ];
    }
    return await element.getChildren();
  }

  public getParent(): FilesNode | undefined {
    return undefined;
  }

  private async getWorktreeGroups(): Promise<WorktreeGroup[]> {
    const roots = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
    if (roots.length === 0) {
      return [];
    }
    return await loadWorktreeGroups(roots, this.worktreeCache, this.worktreeCacheTtlMs);
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

class WorktreesRootNode implements FilesNode {
  public readonly id = treeId('files', 'worktrees-root');

  public constructor(
    private readonly filterText: string,
    private readonly loadGroups: () => Promise<WorktreeGroup[]>
  ) {}

  public async getChildren(): Promise<FilesNode[]> {
    const groups = await this.loadGroups();
    if (groups.length === 0) {
      return [new HintNode('No git worktrees found for current workspace')];
    }
    const filtered = groups.filter((group) => group.worktrees.length > 0);
    if (filtered.length === 0) {
      return [new HintNode('No git worktrees found for current workspace')];
    }
    if (filtered.length === 1) {
      return buildWorktreeNodes(filtered[0], this.filterText);
    }
    return filtered.map((group) => new WorktreeRepoNode(group, this.filterText));
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem('Worktrees', vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = 'forgeflowGroup';
    item.iconPath = new vscode.ThemeIcon('repo');
    return item;
  }
}

class WorktreeRepoNode implements FilesNode {
  public readonly id: string;

  public constructor(
    private readonly group: WorktreeGroup,
    private readonly filterText: string
  ) {
    this.id = treeId('files', `worktrees-${group.commonDir}`);
  }

  public async getChildren(): Promise<FilesNode[]> {
    return buildWorktreeNodes(this.group, this.filterText);
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.group.repoName, vscode.TreeItemCollapsibleState.Collapsed);
    item.contextValue = 'forgeflowGroup';
    item.iconPath = new vscode.ThemeIcon('repo');
    item.description = `${this.group.worktrees.length} worktree${this.group.worktrees.length === 1 ? '' : 's'}`;
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
      // Leave click to select (Explorer-like). Use Enter or context menu to open.
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
      // Leave click to select (Explorer-like). Use Enter or context menu to open.
    }
    return item;
  }
}

class WorktreeItemNode implements FilesNode, PathNode {
  public readonly id: string;
  public readonly path: string;

  public constructor(private readonly entry: WorktreeEntry, private readonly isCurrent: boolean) {
    this.path = entry.path;
    this.id = treeId('worktree', entry.path);
  }

  public async getChildren(): Promise<FilesNode[]> {
    return [];
  }

  public getTreeItem(): vscode.TreeItem {
    const label = baseName(this.path);
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.resourceUri = vscode.Uri.file(this.path);
    item.tooltip = this.path;
    item.contextValue = 'forgeflowWorktree';
    const detailParts: string[] = [];
    if (this.entry.detached) {
      detailParts.push('detached');
    } else if (this.entry.branch) {
      detailParts.push(this.entry.branch);
    }
    if (this.isCurrent) {
      detailParts.push('current');
    }
    if (detailParts.length > 0) {
      item.description = detailParts.join(' • ');
    }
    item.command = { command: 'forgeflow.worktrees.open', title: 'Open worktree', arguments: [this.path] };
    item.iconPath = new vscode.ThemeIcon('repo');
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

interface WorktreeEntry {
  path: string;
  branch?: string;
  detached: boolean;
}

interface WorktreeGroup {
  commonDir: string;
  repoRoot: string;
  repoName: string;
  worktrees: WorktreeEntry[];
  workspaceRoots: string[];
}

interface WorktreeGroupCacheEntry {
  fetchedAt: number;
  group: WorktreeGroup;
}

async function loadWorktreeGroups(
  workspaceRoots: string[],
  cache: Map<string, WorktreeGroupCacheEntry>,
  ttlMs: number
): Promise<WorktreeGroup[]> {
  const now = Date.now();
  const groupedRoots = new Map<string, string[]>();
  for (const root of workspaceRoots) {
    const commonDir = await resolveGitCommonDir(root);
    if (!commonDir) {
      continue;
    }
    const normalized = normalizeFsPath(commonDir);
    const list = groupedRoots.get(normalized) ?? [];
    list.push(root);
    groupedRoots.set(normalized, list);
  }

  const groups: WorktreeGroup[] = [];
  for (const [commonDir, roots] of groupedRoots) {
    const cached = cache.get(commonDir);
    if (cached && now - cached.fetchedAt < ttlMs) {
      groups.push({ ...cached.group, workspaceRoots: roots });
      continue;
    }
    const root = roots[0];
    if (!root) {
      continue;
    }
    const repoRoot = await resolveRepoRoot(root);
    if (!repoRoot) {
      continue;
    }
    const worktrees = await listWorktrees(root, repoRoot);
    const repoName = path.basename(repoRoot);
    const group: WorktreeGroup = {
      commonDir,
      repoRoot,
      repoName,
      worktrees,
      workspaceRoots: roots
    };
    cache.set(commonDir, { fetchedAt: now, group });
    groups.push(group);
  }
  return groups;
}

async function resolveGitCommonDir(root: string): Promise<string | undefined> {
  const output = await execGit(root, ['rev-parse', '--git-common-dir']);
  if (!output) {
    return undefined;
  }
  return path.resolve(root, output);
}

async function resolveRepoRoot(root: string): Promise<string | undefined> {
  const output = await execGit(root, ['rev-parse', '--show-toplevel']);
  if (!output) {
    return undefined;
  }
  return path.resolve(root, output);
}

async function listWorktrees(root: string, repoRoot: string): Promise<WorktreeEntry[]> {
  const output = await execGit(root, ['worktree', 'list', '--porcelain']);
  if (!output) {
    return [];
  }
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | undefined;
  for (const line of output.split(/\r?\n/g)) {
    if (!line.trim()) {
      continue;
    }
    if (line.startsWith('worktree ')) {
      if (current) {
        entries.push(current);
      }
      const rawPath = line.slice('worktree '.length).trim();
      if (!rawPath) {
        current = undefined;
        continue;
      }
      const resolved = path.isAbsolute(rawPath) ? rawPath : path.resolve(repoRoot, rawPath);
      current = { path: resolved, detached: false };
      continue;
    }
    if (!current) {
      continue;
    }
    if (line.startsWith('branch ')) {
      const ref = line.slice('branch '.length).trim();
      current.branch = ref.replace(/^refs\/heads\//, '');
      continue;
    }
    if (line.trim() === 'detached') {
      current.detached = true;
    }
  }
  if (current) {
    entries.push(current);
  }
  return entries;
}

function buildWorktreeNodes(group: WorktreeGroup, filterText: string): FilesNode[] {
  const minChars = getForgeFlowSettings().filtersFilesMinChars;
  const filter = normalizeFilter(filterText, minChars);
  const mode = getForgeFlowSettings().filtersMatchMode;
  const currentRoots = new Set(group.workspaceRoots.map((root) => normalizeFsPath(path.resolve(root))));
  const filtered = group.worktrees.filter((entry) => {
    if (!filter) {
      return true;
    }
    const label = baseName(entry.path);
    if (matchesFilterQuery(label, filter, mode)) {
      return true;
    }
    if (entry.branch && matchesFilterQuery(entry.branch, filter, mode)) {
      return true;
    }
    return matchesFilterQuery(entry.path, filter, mode);
  });
  const byName = (a: WorktreeEntry, b: WorktreeEntry): number => {
    return baseName(a.path).localeCompare(baseName(b.path));
  };
  const sorted = filtered.sort(byName);
  return sorted.map((entry) => {
    const normalized = normalizeFsPath(path.resolve(entry.path));
    return new WorktreeItemNode(entry, currentRoots.has(normalized));
  });
}

async function execGit(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const result = await execFileAsync('git', ['-C', cwd, ...args]);
    return result.stdout?.trim();
  } catch {
    return undefined;
  }
}
