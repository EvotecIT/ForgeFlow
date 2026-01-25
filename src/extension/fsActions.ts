import * as path from 'path';
import * as vscode from 'vscode';
import type { FavoritesStore } from '../store/favoritesStore';
import { pathExists, statPath } from '../util/fs';
import { isWithin, normalizeFsPath } from './pathUtils';

export async function openPath(targetPath: string): Promise<void> {
  const stat = await statPath(targetPath);
  if (stat?.type === vscode.FileType.Directory) {
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetPath), false);
    return;
  }
  await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(targetPath));
}

export async function openPathToSide(targetPath: string): Promise<void> {
  const stat = await statPath(targetPath);
  if (stat?.type === vscode.FileType.Directory) {
    vscode.window.showWarningMessage('ForgeFlow: Open to Side is only available for files.');
    return;
  }
  await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(targetPath), {
    viewColumn: vscode.ViewColumn.Beside,
    preview: false
  });
}

export async function openWith(targetPath: string): Promise<void> {
  const uri = vscode.Uri.file(targetPath);
  await vscode.commands.executeCommand('workbench.action.openWith', uri);
}

export async function openInTerminal(targetPath: string): Promise<void> {
  const stat = await statPath(targetPath);
  const cwd = stat?.type === vscode.FileType.Directory ? targetPath : path.dirname(targetPath);
  const terminal = vscode.window.createTerminal({ name: 'ForgeFlow', cwd });
  terminal.show(true);
}

export async function revealPath(targetPath: string): Promise<void> {
  await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(targetPath));
}

export async function renamePath(targetPath: string): Promise<void> {
  await vscode.commands.executeCommand('renameFile', vscode.Uri.file(targetPath));
}

export async function copyPathToClipboard(targetPath: string): Promise<void> {
  await vscode.env.clipboard.writeText(targetPath);
  vscode.window.setStatusBarMessage('ForgeFlow: Path copied.', 2000);
}

export async function copyRelativePathToClipboard(targetPath: string): Promise<void> {
  const uri = vscode.Uri.file(targetPath);
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) {
    await copyPathToClipboard(targetPath);
    vscode.window.showWarningMessage('ForgeFlow: File is outside the workspace, copied absolute path.');
    return;
  }
  const relative = path.relative(folder.uri.fsPath, targetPath);
  await vscode.env.clipboard.writeText(relative);
  vscode.window.setStatusBarMessage('ForgeFlow: Relative path copied.', 2000);
}

export async function deletePath(targetPath: string): Promise<void> {
  const stat = await statPath(targetPath);
  const label = stat?.type === vscode.FileType.Directory ? 'folder' : 'file';
  const confirmation = await vscode.window.showWarningMessage(
    `ForgeFlow: Delete ${label} "${path.basename(targetPath)}"?`,
    { modal: true },
    'Delete'
  );
  if (confirmation !== 'Delete') {
    return;
  }
  await vscode.workspace.fs.delete(vscode.Uri.file(targetPath), { recursive: true, useTrash: true });
}

export async function deletePaths(targetPaths: string[]): Promise<void> {
  const confirmation = await vscode.window.showWarningMessage(
    `ForgeFlow: Delete ${targetPaths.length} items?`,
    { modal: true },
    'Delete'
  );
  if (confirmation !== 'Delete') {
    return;
  }
  for (const targetPath of targetPaths) {
    await vscode.workspace.fs.delete(vscode.Uri.file(targetPath), { recursive: true, useTrash: true });
  }
}

export async function pastePaths(
  baseDirectory: string,
  clipboard: { mode: 'copy' | 'cut'; paths: string[] }
): Promise<void> {
  let completed = 0;
  for (const sourcePath of clipboard.paths) {
    const sourceStat = await statPath(sourcePath);
    if (sourceStat?.type === vscode.FileType.Directory && isWithin(sourcePath, baseDirectory)) {
      const label = clipboard.mode === 'copy' ? 'copy' : 'move';
      vscode.window.showWarningMessage(`ForgeFlow: Cannot ${label} a folder into its own subfolder.`);
      continue;
    }
    const targetPath = await buildUniqueTargetPath(baseDirectory, sourcePath);
    if (!targetPath) {
      continue;
    }
    if (clipboard.mode === 'copy') {
      await vscode.workspace.fs.copy(vscode.Uri.file(sourcePath), vscode.Uri.file(targetPath), { overwrite: false });
    } else {
      if (normalizeFsPath(sourcePath) === normalizeFsPath(targetPath)) {
        continue;
      }
      await vscode.workspace.fs.rename(vscode.Uri.file(sourcePath), vscode.Uri.file(targetPath), { overwrite: false });
    }
    completed += 1;
  }
  if (completed > 0) {
    const label = clipboard.mode === 'copy' ? 'Pasted' : 'Moved';
    vscode.window.setStatusBarMessage(`ForgeFlow: ${label} ${completed} item(s).`, 3000);
  }
}

export async function buildUniqueTargetPath(targetDirectory: string, sourcePath: string): Promise<string | undefined> {
  const baseName = path.basename(sourcePath);
  let candidate = path.join(targetDirectory, baseName);
  if (!(await pathExists(candidate))) {
    return candidate;
  }
  const ext = path.extname(baseName);
  const name = path.basename(baseName, ext);
  let index = 1;
  while (index < 1000) {
    const suffix = index === 1 ? ' - Copy' : ` - Copy ${index}`;
    candidate = path.join(targetDirectory, `${name}${suffix}${ext}`);
    if (!(await pathExists(candidate))) {
      return candidate;
    }
    index += 1;
  }
  vscode.window.showWarningMessage(`ForgeFlow: Unable to find a free name for ${baseName}.`);
  return undefined;
}

export async function createNewFile(baseDirectory: string): Promise<void> {
  const name = await vscode.window.showInputBox({ prompt: 'New file name', value: '' });
  if (!name) {
    return;
  }
  const target = path.join(baseDirectory, name);
  await vscode.workspace.fs.writeFile(vscode.Uri.file(target), new Uint8Array());
  await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(target));
}

export async function createNewFolder(baseDirectory: string): Promise<void> {
  const name = await vscode.window.showInputBox({ prompt: 'New folder name', value: '' });
  if (!name) {
    return;
  }
  const target = path.join(baseDirectory, name);
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(target));
}

export async function pinFavorite(targetPath: string, store: FavoritesStore): Promise<void> {
  const stat = await statPath(targetPath);
  const kind = stat?.type === vscode.FileType.Directory ? 'folder' : 'file';
  await store.add({ path: targetPath, kind });
}
