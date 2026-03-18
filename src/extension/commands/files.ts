import { execFile } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import type { FilesViewProvider } from '../../views/filesView';
import type { ProjectsViewProvider } from '../../views/projectsView';
import type { FavoritesStore } from '../../store/favoritesStore';
import type { FilterPresetStore } from '../../store/filterPresetStore';
import { getForgeFlowSettings } from '../../util/config';
import { statPath } from '../../util/fs';
import { normalizePathKey } from '../pathUtils';
import { deleteFilterPreset, openLiveFilterInput, pickFilterPreset, saveFilterPreset } from '../filters';
import { cleanupStaleWorktreesInPaths } from '../projects/worktrees';
import { removeWorktreeSafely, resolveWorktreeRepoRoot } from '../projects/worktreeGit';
import {
  collectSelectedPaths,
  extractPath,
  getActiveEditorPath,
  resolveBaseDirectory
} from '../selection';
import {
  copyPathToClipboard,
  copyRelativePathToClipboard,
  createNewFile,
  createNewFolder,
  deletePath,
  deletePaths,
  openInTerminal,
  openPath,
  openPathToSide,
  openWith,
  pastePaths,
  pinFavorite,
  renamePath,
  revealPath
} from '../fsActions';
import { configureFavoritesViewMode } from '../filesFavorites';

let fileClipboard: { mode: 'copy' | 'cut'; paths: string[] } | undefined;
const execFileAsync = promisify(execFile);

export interface FileCommandDeps {
  context: vscode.ExtensionContext;
  filesProvider: FilesViewProvider;
  filesView: vscode.TreeView<unknown>;
  filesPanelView: vscode.TreeView<unknown>;
  projectsProvider: ProjectsViewProvider;
  favoritesStore: FavoritesStore;
  filterPresetStore: FilterPresetStore;
}

export function registerFileCommands(deps: FileCommandDeps): void {
  const {
    context,
    filesProvider,
    filesView,
    filesPanelView,
    projectsProvider,
    favoritesStore,
    filterPresetStore
  } = deps;

  const refreshFilesAndProjects = async (forceProjectsRefresh = false): Promise<void> => {
    filesProvider.refresh();
    await projectsProvider.refresh(forceProjectsRefresh);
  };

  const openFilesFilterInput = async (): Promise<void> => {
    await openLiveFilterInput({
      title: 'Filter files',
      value: filesProvider.getFilter(),
      minChars: getForgeFlowSettings().filtersFilesMinChars,
      onChange: (value) => filesProvider.setFilter(value)
    });
  };

  const ensureClipboard = (): { mode: 'copy' | 'cut'; paths: string[] } | undefined => {
    if (!fileClipboard || fileClipboard.paths.length === 0) {
      vscode.window.showWarningMessage('ForgeFlow: Clipboard is empty.');
      return undefined;
    }
    return fileClipboard;
  };

  const pasteIntoDirectory = async (baseDir: string): Promise<void> => {
    const clipboard = ensureClipboard();
    if (!clipboard) {
      return;
    }
    await pastePaths(baseDir, clipboard);
    if (clipboard.mode === 'cut') {
      fileClipboard = undefined;
    }
    await refreshFilesAndProjects();
  };

  const createInBaseDirectory = async (
    target: unknown,
    creator: (baseDir: string) => Promise<void>
  ): Promise<void> => {
    const baseDir = await resolveBaseDirectory(target);
    if (!baseDir) {
      return;
    }
    await creator(baseDir);
    await refreshFilesAndProjects();
  };

  const copySelectedPaths = async (
    target: unknown,
    copySingle: (filePath: string) => Promise<void>,
    copyMany: (paths: string[]) => Promise<void>
  ): Promise<void> => {
    const targets = collectSelectedPaths(target, filesView, filesPanelView);
    if (targets.length === 0) {
      return;
    }
    if (targets.length === 1) {
      const [first] = targets;
      if (!first) {
        return;
      }
      await copySingle(first);
      return;
    }
    await copyMany(targets);
  };

  const getDiscoveredWorktreeMap = async (): Promise<Map<string, string>> => {
    const discovered = await filesProvider.listWorktreePaths();
    const result = new Map<string, string>();
    for (const worktreePath of discovered) {
      const key = normalizePathKey(worktreePath);
      if (!result.has(key)) {
        result.set(key, worktreePath);
      }
    }
    return result;
  };

  const resolveSelectedWorktreePaths = async (target: unknown): Promise<string[]> => {
    const selected = collectSelectedPaths(target, filesView, filesPanelView);
    if (selected.length === 0) {
      return [];
    }
    const known = await getDiscoveredWorktreeMap();
    const resolved: string[] = [];
    const seen = new Set<string>();
    for (const candidate of selected) {
      const match = known.get(normalizePathKey(candidate));
      if (!match) {
        continue;
      }
      const key = normalizePathKey(match);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      resolved.push(match);
    }
    return resolved;
  };

  const resolveCleanupScopePaths = async (target: unknown): Promise<string[]> => {
    const discovered = await filesProvider.listWorktreePaths();
    if (discovered.length === 0) {
      return [];
    }
    const known = new Map<string, string>();
    for (const worktreePath of discovered) {
      const key = normalizePathKey(worktreePath);
      if (!known.has(key)) {
        known.set(key, worktreePath);
      }
    }
    const selected = collectSelectedPaths(target, filesView, filesPanelView);
    if (selected.length === 0) {
      return discovered;
    }
    const selectedWorktrees = selected
      .map((candidate) => known.get(normalizePathKey(candidate)))
      .filter((value): value is string => Boolean(value));
    if (selectedWorktrees.length > 0) {
      return selectedWorktrees;
    }
    if (selected.length === 1) {
      const [single] = selected;
      if (single) {
        const repoScoped = await filesProvider.listWorktreePathsForRepo(single);
        if (repoScoped.length > 0) {
          return repoScoped;
        }
      }
    }
    return discovered;
  };

  const addPathsToWorkspace = async (
    paths: string[],
    options: {
      itemLabel: string;
      noneAddedMessage: string;
      failedMessage: string;
      skippedMessage: (added: number, skippedMissing: number) => string;
    }
  ): Promise<void> => {
    if (paths.length === 0) {
      return;
    }
    const folders = vscode.workspace.workspaceFolders ?? [];
    const existing = new Set(folders.map((folder) => normalizePathKey(folder.uri.fsPath)));
    const additions: Array<{ uri: vscode.Uri; name?: string }> = [];
    let skippedMissing = 0;
    for (const folderPath of paths) {
      const stat = await statPath(folderPath);
      if (stat?.type !== vscode.FileType.Directory) {
        skippedMissing += 1;
        continue;
      }
      const resolved = normalizePathKey(folderPath);
      if (existing.has(resolved)) {
        continue;
      }
      additions.push({ uri: vscode.Uri.file(folderPath), name: path.basename(folderPath) });
      existing.add(resolved);
    }
    if (additions.length === 0) {
      vscode.window.showWarningMessage(options.noneAddedMessage);
      return;
    }
    const success = vscode.workspace.updateWorkspaceFolders(folders.length, 0, ...additions);
    if (!success) {
      vscode.window.showWarningMessage(options.failedMessage);
      return;
    }
    if (skippedMissing > 0) {
      vscode.window.showWarningMessage(options.skippedMessage(additions.length, skippedMissing));
      return;
    }
    const suffix = additions.length === 1 ? options.itemLabel : `${options.itemLabel}s`;
    vscode.window.setStatusBarMessage(`ForgeFlow: Added ${additions.length} ${suffix} to workspace.`, 3000);
  };

  const addWorktreesToWorkspace = async (paths: string[]): Promise<void> => {
    await addPathsToWorkspace(paths, {
      itemLabel: 'worktree',
      noneAddedMessage: 'ForgeFlow: No worktrees were added (already in workspace or missing on disk).',
      failedMessage: 'ForgeFlow: Unable to add worktree to workspace.',
      skippedMessage: (added, skippedMissing) => `ForgeFlow: Added ${added} worktree(s); skipped ${skippedMissing} missing path(s).`
    });
  };

  const addFoldersToWorkspace = async (): Promise<void> => {
    const picks = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: true,
      openLabel: 'Add to Workspace'
    });
    if (!picks || picks.length === 0) {
      return;
    }
    const paths = picks.map((pick) => pick.fsPath);
    await addPathsToWorkspace(paths, {
      itemLabel: 'folder',
      noneAddedMessage: 'ForgeFlow: Selected folders are already in the workspace or missing on disk.',
      failedMessage: 'ForgeFlow: Unable to add selected folders to workspace.',
      skippedMessage: (added, skippedMissing) => `ForgeFlow: Added ${added} folder(s); skipped ${skippedMissing} missing path(s).`
    });
  };

  const openWorktrees = async (target: unknown, openInNewWindow: boolean): Promise<void> => {
    const targets = collectSelectedPaths(target, filesView, filesPanelView);
    if (targets.length === 0) {
      return;
    }
    if (!openInNewWindow && targets.length > 1) {
      vscode.window.showWarningMessage('ForgeFlow: Open Worktree supports a single selection.');
    }
    const toOpen = openInNewWindow ? targets : targets.slice(0, 1);
    for (const folderPath of toOpen) {
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folderPath), openInNewWindow);
    }
  };

  const removeWorktree = async (worktreePath: string): Promise<void> => {
    const repoRoot = await resolveWorktreeRepoRoot(worktreePath);
    if (!repoRoot) {
      vscode.window.showWarningMessage('ForgeFlow: Unable to resolve repository for this worktree.');
      return;
    }
    const name = path.basename(worktreePath);
    const confirm = await vscode.window.showWarningMessage(
      `ForgeFlow: Remove worktree "${name}"? This deletes the worktree folder.`,
      { modal: true },
      'Remove'
    );
    if (confirm !== 'Remove') {
      return;
    }
    const result = await removeWorktreeSafely(worktreePath, repoRoot);
    if (!result.removed) {
      if (result.failure === 'openInWorkspace') {
        vscode.window.showWarningMessage('ForgeFlow: Cannot remove a worktree that is open in the workspace.');
      } else if (result.failure === 'repoRootNotFound') {
        vscode.window.showWarningMessage('ForgeFlow: Unable to resolve repository for this worktree.');
      } else {
        const message = result.message ?? 'Unknown error';
        vscode.window.showWarningMessage(`ForgeFlow: Failed to remove worktree "${name}": ${message}`);
      }
      return;
    }
    filesProvider.refreshWorktrees();
    await projectsProvider.refresh(true);
  };

  const pruneWorktrees = async (worktreePath: string): Promise<void> => {
    const repoRoot = await resolveWorktreeRepoRoot(worktreePath);
    if (!repoRoot) {
      vscode.window.showWarningMessage('ForgeFlow: Unable to resolve repository for this worktree.');
      return;
    }
    const confirm = await vscode.window.showWarningMessage(
      'ForgeFlow: Prune stale worktree entries for this repo?',
      { modal: true },
      'Prune'
    );
    if (confirm !== 'Prune') {
      return;
    }
    try {
      await execFileAsync('git', ['-C', repoRoot, 'worktree', 'prune']);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showWarningMessage(`ForgeFlow: Failed to prune worktrees: ${message}`);
      return;
    }
    filesProvider.refreshWorktrees();
    await projectsProvider.refresh(true);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('forgeflow.files.open', async (target?: unknown) => {
      const targets = collectSelectedPaths(target, filesView, filesPanelView);
      if (targets.length === 0) {
        return;
      }
      if (targets.length === 1) {
        const [only] = targets;
        if (only) {
          const stat = await statPath(only);
          if (stat?.type === vscode.FileType.Directory) {
            await vscode.commands.executeCommand('list.toggleExpand');
            return;
          }
        }
      }
      if (targets.length > 1) {
        vscode.window.setStatusBarMessage(`ForgeFlow: Opening ${targets.length} items.`, 2000);
      }
      for (const filePath of targets) {
        const stat = await statPath(filePath);
        if (stat?.type === vscode.FileType.Directory) {
          continue;
        }
        await openPath(filePath);
      }
    }),
    vscode.commands.registerCommand('forgeflow.worktrees.open', async (target?: unknown) => {
      await openWorktrees(target, false);
    }),
    vscode.commands.registerCommand('forgeflow.worktrees.openDefault', async (target?: unknown) => {
      const action = getForgeFlowSettings().worktreesOpenAction;
      if (action === 'expand') {
        await vscode.commands.executeCommand('list.toggleExpand');
        return;
      }
      if (action === 'addToWorkspace') {
        const targets = collectSelectedPaths(target, filesView, filesPanelView);
        await addWorktreesToWorkspace(targets);
        return;
      }
      if (action === 'openInNewWindow') {
        await openWorktrees(target, true);
        return;
      }
      await openWorktrees(target, false);
    }),
    vscode.commands.registerCommand('forgeflow.worktrees.openInNewWindow', async (target?: unknown) => {
      await openWorktrees(target, true);
    }),
    vscode.commands.registerCommand('forgeflow.worktrees.addToWorkspace', async (target?: unknown) => {
      const targets = collectSelectedPaths(target, filesView, filesPanelView);
      await addWorktreesToWorkspace(targets);
    }),
    vscode.commands.registerCommand('forgeflow.worktrees.addAllToWorkspace', async () => {
      const paths = await filesProvider.listWorktreePaths();
      if (paths.length === 0) {
        vscode.window.showInformationMessage('ForgeFlow: No discovered worktrees to add.');
        return;
      }
      await addWorktreesToWorkspace(paths);
    }),
    vscode.commands.registerCommand('forgeflow.worktrees.cleanup', async (target?: unknown) => {
      const scopePaths = await resolveCleanupScopePaths(target);
      if (scopePaths.length === 0) {
        vscode.window.showInformationMessage('ForgeFlow: No discovered worktrees in this scope.');
        return;
      }
      await cleanupStaleWorktreesInPaths(scopePaths, projectsProvider, filesProvider);
    }),
    vscode.commands.registerCommand('forgeflow.worktrees.remove', async (target?: unknown) => {
      const selected = await resolveSelectedWorktreePaths(target);
      const first = selected[0];
      if (!first) {
        vscode.window.showWarningMessage('ForgeFlow: Select a linked worktree to remove.');
        return;
      }
      await removeWorktree(first);
    }),
    vscode.commands.registerCommand('forgeflow.worktrees.prune', async (target?: unknown) => {
      const targets = collectSelectedPaths(target, filesView, filesPanelView);
      const first = targets[0];
      if (!first) {
        return;
      }
      await pruneWorktrees(first);
    }),
    vscode.commands.registerCommand('forgeflow.files.filter', async () => {
      await openFilesFilterInput();
    }),
    vscode.commands.registerCommand('forgeflow.files.refresh', async () => {
      filesProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.files.focusFilter', async () => {
      await openFilesFilterInput();
    }),
    vscode.commands.registerCommand('forgeflow.files.saveFilterPreset', async () => {
      await saveFilterPreset('files', filesProvider.getFilter(), filterPresetStore);
    }),
    vscode.commands.registerCommand('forgeflow.files.applyFilterPreset', async () => {
      const preset = await pickFilterPreset('files', filterPresetStore);
      if (!preset) {
        return;
      }
      filesProvider.setFilter(preset.value);
    }),
    vscode.commands.registerCommand('forgeflow.files.deleteFilterPreset', async () => {
      await deleteFilterPreset('files', filterPresetStore);
    }),
    vscode.commands.registerCommand('forgeflow.files.setFavoritesViewMode', async () => {
      await configureFavoritesViewMode(filesProvider);
    }),
    vscode.commands.registerCommand('forgeflow.files.clearFilter', async () => {
      filesProvider.setFilter('');
    }),
    vscode.commands.registerCommand('forgeflow.files.openToSide', async (target?: unknown) => {
      const targets = collectSelectedPaths(target, filesView, filesPanelView);
      if (targets.length === 0) {
        return;
      }
      for (const filePath of targets) {
        await openPathToSide(filePath);
      }
    }),
    vscode.commands.registerCommand('forgeflow.files.openWith', async (target?: unknown) => {
      const targets = collectSelectedPaths(target, filesView, filesPanelView);
      if (targets.length === 0) {
        return;
      }
      if (targets.length > 1) {
        vscode.window.showWarningMessage('ForgeFlow: Open With supports a single selection.');
        return;
      }
      const [first] = targets;
      if (!first) {
        return;
      }
      await openWith(first);
    }),
    vscode.commands.registerCommand('forgeflow.files.openInTerminal', async (target?: unknown) => {
      const targets = collectSelectedPaths(target, filesView, filesPanelView);
      if (targets.length === 0) {
        return;
      }
      const [first] = targets;
      if (!first) {
        return;
      }
      await openInTerminal(first);
    }),
    vscode.commands.registerCommand('forgeflow.files.revealInOs', async (target?: unknown) => {
      const targets = collectSelectedPaths(target, filesView, filesPanelView);
      if (targets.length === 0) {
        return;
      }
      for (const filePath of targets) {
        await revealPath(filePath);
      }
    }),
    vscode.commands.registerCommand('forgeflow.files.copyPath', async (target?: unknown) => {
      await copySelectedPaths(
        target,
        async (filePath) => await copyPathToClipboard(filePath),
        async (paths) => {
          await vscode.env.clipboard.writeText(paths.join('\n'));
          vscode.window.setStatusBarMessage('ForgeFlow: Paths copied.', 2000);
        }
      );
    }),
    vscode.commands.registerCommand('forgeflow.files.copyRelativePath', async (target?: unknown) => {
      await copySelectedPaths(
        target,
        async (filePath) => await copyRelativePathToClipboard(filePath),
        async (targets) => {
          const relPaths: string[] = [];
          let outside = 0;
          for (const filePath of targets) {
            const uri = vscode.Uri.file(filePath);
            const folder = vscode.workspace.getWorkspaceFolder(uri);
            if (!folder) {
              relPaths.push(filePath);
              outside += 1;
              continue;
            }
            relPaths.push(path.relative(folder.uri.fsPath, filePath));
          }
          await vscode.env.clipboard.writeText(relPaths.join('\n'));
          if (outside > 0) {
            vscode.window.showWarningMessage('ForgeFlow: Some items are outside the workspace; absolute paths were used.');
          }
          vscode.window.setStatusBarMessage('ForgeFlow: Relative paths copied.', 2000);
        }
      );
    }),
    vscode.commands.registerCommand('forgeflow.files.copy', async (target?: unknown) => {
      const targets = collectSelectedPaths(target, filesView, filesPanelView);
      if (targets.length === 0) {
        return;
      }
      fileClipboard = { mode: 'copy', paths: targets };
      vscode.window.setStatusBarMessage(`ForgeFlow: Copied ${targets.length} item(s).`, 2000);
    }),
    vscode.commands.registerCommand('forgeflow.files.cut', async (target?: unknown) => {
      const targets = collectSelectedPaths(target, filesView, filesPanelView);
      if (targets.length === 0) {
        return;
      }
      fileClipboard = { mode: 'cut', paths: targets };
      vscode.window.setStatusBarMessage(`ForgeFlow: Cut ${targets.length} item(s).`, 2000);
    }),
    vscode.commands.registerCommand('forgeflow.files.paste', async (target?: unknown) => {
      const baseDir = await resolveBaseDirectory(target);
      if (!baseDir) {
        return;
      }
      await pasteIntoDirectory(baseDir);
    }),
    vscode.commands.registerCommand('forgeflow.files.pinWorkspaceFavorite', async (target?: unknown) => {
      const targets = collectSelectedPaths(target, filesView, filesPanelView);
      if (targets.length === 0) {
        return;
      }
      for (const filePath of targets) {
        await favoritesStore.pinToWorkspace(filePath);
      }
      filesProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.files.unpinWorkspaceFavorite', async (target?: unknown) => {
      const targets = collectSelectedPaths(target, filesView, filesPanelView);
      if (targets.length === 0) {
        return;
      }
      for (const filePath of targets) {
        await favoritesStore.unpinFromWorkspace(filePath);
      }
      filesProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.files.rename', async (target?: unknown) => {
      const targets = collectSelectedPaths(target, filesView, filesPanelView);
      if (targets.length === 0) {
        return;
      }
      if (targets.length > 1) {
        vscode.window.showWarningMessage('ForgeFlow: Rename supports a single selection.');
        return;
      }
      const [first] = targets;
      if (!first) {
        return;
      }
      await renamePath(first);
      await refreshFilesAndProjects();
    }),
    vscode.commands.registerCommand('forgeflow.files.delete', async (target?: unknown) => {
      const targets = collectSelectedPaths(target, filesView, filesPanelView);
      if (targets.length === 0) {
        return;
      }
      const selectedWorktrees = await resolveSelectedWorktreePaths(target);
      if (selectedWorktrees.length > 0) {
        if (selectedWorktrees.length !== targets.length) {
          vscode.window.showWarningMessage(
            'ForgeFlow: Cannot delete mixed worktree and non-worktree selections in one action.'
          );
          return;
        }
        if (selectedWorktrees.length > 1) {
          vscode.window.showWarningMessage(
            'ForgeFlow: Remove one worktree at a time with Delete, or use Worktrees Cleanup for bulk operations.'
          );
          return;
        }
        const [firstWorktree] = selectedWorktrees;
        if (!firstWorktree) {
          return;
        }
        await removeWorktree(firstWorktree);
        return;
      }
      if (targets.length === 1) {
        const [first] = targets;
        if (!first) {
          return;
        }
        await deletePath(first);
      } else {
        await deletePaths(targets);
      }
      await refreshFilesAndProjects();
    }),
    vscode.commands.registerCommand('forgeflow.files.newFile', async (target?: unknown) => {
      await createInBaseDirectory(target, createNewFile);
    }),
    vscode.commands.registerCommand('forgeflow.files.newFolder', async (target?: unknown) => {
      await createInBaseDirectory(target, createNewFolder);
    }),
    vscode.commands.registerCommand('forgeflow.files.pasteRoot', async () => {
      if (!ensureClipboard()) {
        return;
      }
      const folders = vscode.workspace.workspaceFolders ?? [];
      if (folders.length === 0) {
        vscode.window.showWarningMessage('ForgeFlow: No workspace folder available.');
        return;
      }
      let baseDir = folders[0]?.uri.fsPath;
      if (folders.length > 1) {
        const pick = await vscode.window.showQuickPick(
          folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
          { placeHolder: 'Select target folder' }
        );
        if (!pick) {
          return;
        }
        baseDir = pick.folder.uri.fsPath;
      }
      if (!baseDir) {
        return;
      }
      await pasteIntoDirectory(baseDir);
    }),
    vscode.commands.registerCommand('forgeflow.workspace.addFolder', async () => {
      await addFoldersToWorkspace();
      filesProvider.refresh();
      await projectsProvider.refresh(true);
    }),
    vscode.commands.registerCommand('forgeflow.files.run', async (target?: unknown) => {
      const filePath = extractPath(target);
      await vscode.commands.executeCommand('forgeflow.run', filePath);
    }),
    vscode.commands.registerCommand('forgeflow.files.pinFavorite', async (target?: unknown) => {
      const filePath = extractPath(target) ?? getActiveEditorPath();
      if (filePath) {
        await pinFavorite(filePath, favoritesStore);
        filesProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('forgeflow.files.unpinFavorite', async (target?: unknown) => {
      const filePath = extractPath(target);
      if (filePath) {
        await favoritesStore.remove(filePath);
        filesProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('forgeflow.files.moveFavoriteUp', async (target?: unknown) => {
      const filePath = extractPath(target);
      if (filePath) {
        await favoritesStore.move(filePath, 'up');
        filesProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('forgeflow.files.moveFavoriteDown', async (target?: unknown) => {
      const filePath = extractPath(target);
      if (filePath) {
        await favoritesStore.move(filePath, 'down');
        filesProvider.refresh();
      }
    })
  );
}
