import * as path from 'path';
import * as vscode from 'vscode';
import type { FilesViewProvider } from '../../views/filesView';
import type { ProjectsViewProvider } from '../../views/projectsView';
import type { FavoritesStore } from '../../store/favoritesStore';
import type { FilterPresetStore } from '../../store/filterPresetStore';
import { getForgeFlowSettings } from '../../util/config';
import { deleteFilterPreset, openLiveFilterInput, pickFilterPreset, saveFilterPreset } from '../filters';
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

  context.subscriptions.push(
    vscode.commands.registerCommand('forgeflow.files.open', async (target?: unknown) => {
      const targets = collectSelectedPaths(target, filesView, filesPanelView);
      if (targets.length === 0) {
        return;
      }
      if (targets.length > 1) {
        vscode.window.setStatusBarMessage(`ForgeFlow: Opening ${targets.length} items.`, 2000);
      }
      for (const filePath of targets) {
        await openPath(filePath);
      }
    }),
    vscode.commands.registerCommand('forgeflow.worktrees.open', async (target?: unknown) => {
      await openWorktrees(target, false);
    }),
    vscode.commands.registerCommand('forgeflow.worktrees.openInNewWindow', async (target?: unknown) => {
      await openWorktrees(target, true);
    }),
    vscode.commands.registerCommand('forgeflow.worktrees.addToWorkspace', async (target?: unknown) => {
      const targets = collectSelectedPaths(target, filesView, filesPanelView);
      if (targets.length === 0) {
        return;
      }
      const folders = vscode.workspace.workspaceFolders ?? [];
      const existing = new Set(folders.map((folder) => path.resolve(folder.uri.fsPath)));
      const additions: vscode.WorkspaceFolder[] = [];
      for (const folderPath of targets) {
        const resolved = path.resolve(folderPath);
        if (existing.has(resolved)) {
          continue;
        }
        additions.push({ uri: vscode.Uri.file(folderPath), name: path.basename(folderPath) });
        existing.add(resolved);
      }
      if (additions.length === 0) {
        vscode.window.showWarningMessage('ForgeFlow: Worktree is already in the workspace.');
        return;
      }
      const success = vscode.workspace.updateWorkspaceFolders(folders.length, 0, ...additions);
      if (!success) {
        vscode.window.showWarningMessage('ForgeFlow: Unable to add worktree to workspace.');
      }
    }),
    vscode.commands.registerCommand('forgeflow.files.filter', async () => {
      await openLiveFilterInput({
        title: 'Filter files',
        value: filesProvider.getFilter(),
        minChars: getForgeFlowSettings().filtersFilesMinChars,
        onChange: (value) => filesProvider.setFilter(value)
      });
    }),
    vscode.commands.registerCommand('forgeflow.files.refresh', async () => {
      filesProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.files.focusFilter', async () => {
      await openLiveFilterInput({
        title: 'Filter files',
        value: filesProvider.getFilter(),
        minChars: getForgeFlowSettings().filtersFilesMinChars,
        onChange: (value) => filesProvider.setFilter(value)
      });
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
      const targets = collectSelectedPaths(target, filesView, filesPanelView);
      if (targets.length === 0) {
        return;
      }
      if (targets.length === 1) {
        const [first] = targets;
        if (!first) {
          return;
        }
        await copyPathToClipboard(first);
        return;
      }
      await vscode.env.clipboard.writeText(targets.join('\n'));
      vscode.window.setStatusBarMessage('ForgeFlow: Paths copied.', 2000);
    }),
    vscode.commands.registerCommand('forgeflow.files.copyRelativePath', async (target?: unknown) => {
      const targets = collectSelectedPaths(target, filesView, filesPanelView);
      if (targets.length === 0) {
        return;
      }
      if (targets.length === 1) {
        const [first] = targets;
        if (!first) {
          return;
        }
        await copyRelativePathToClipboard(first);
        return;
      }
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
      if (!fileClipboard || fileClipboard.paths.length === 0) {
        vscode.window.showWarningMessage('ForgeFlow: Clipboard is empty.');
        return;
      }
      const baseDir = await resolveBaseDirectory(target);
      if (!baseDir) {
        return;
      }
      await pastePaths(baseDir, fileClipboard);
      if (fileClipboard.mode === 'cut') {
        fileClipboard = undefined;
      }
      filesProvider.refresh();
      await projectsProvider.refresh();
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
      filesProvider.refresh();
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.files.delete', async (target?: unknown) => {
      const targets = collectSelectedPaths(target, filesView, filesPanelView);
      if (targets.length === 0) {
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
      filesProvider.refresh();
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.files.newFile', async (target?: unknown) => {
      const baseDir = await resolveBaseDirectory(target);
      if (!baseDir) {
        return;
      }
      await createNewFile(baseDir);
      filesProvider.refresh();
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.files.newFolder', async (target?: unknown) => {
      const baseDir = await resolveBaseDirectory(target);
      if (!baseDir) {
        return;
      }
      await createNewFolder(baseDir);
      filesProvider.refresh();
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.files.pasteRoot', async () => {
      if (!fileClipboard || fileClipboard.paths.length === 0) {
        vscode.window.showWarningMessage('ForgeFlow: Clipboard is empty.');
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
      await pastePaths(baseDir, fileClipboard);
      if (fileClipboard.mode === 'cut') {
        fileClipboard = undefined;
      }
      filesProvider.refresh();
      await projectsProvider.refresh();
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
