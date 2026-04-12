import * as path from 'path';
import * as vscode from 'vscode';
import type { FilesNode, PathNode } from './filesView';
import { isWithin, normalizeFsPath } from '../extension/pathUtils';
import { statPath } from '../util/fs';

const INTERNAL_MIME = 'application/vnd.code.tree.forgeflow.files';

export class FilesDragAndDropController implements vscode.TreeDragAndDropController<FilesNode> {
  public readonly dragMimeTypes = ['text/uri-list', INTERNAL_MIME];
  public readonly dropMimeTypes = ['text/uri-list', INTERNAL_MIME];

  public async handleDrag(
    sources: readonly FilesNode[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    void _token;
    const paths = sources.flatMap((node) => (isPathNode(node) ? [node.path] : []));
    if (paths.length === 0) {
      return;
    }
    const uris = paths.map((entry) => vscode.Uri.file(entry));
    dataTransfer.set('text/uri-list', new vscode.DataTransferItem(uris.map((uri) => uri.toString()).join('\n')));
    dataTransfer.set(INTERNAL_MIME, new vscode.DataTransferItem({ paths }));
  }

  public async handleDrop(
    target: FilesNode | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    void _token;
    const destination = await resolveDestination(target);
    if (!destination) {
      return;
    }

    const internal = dataTransfer.get(INTERNAL_MIME);
    const internalPayload = internal?.value as { paths?: string[] } | undefined;
    const internalPaths = Array.isArray(internalPayload?.paths) ? internalPayload?.paths : [];

    const externalUris = internalPaths.length === 0 ? await parseExternalUris(dataTransfer) : [];
    const externalPaths = externalUris.map((uri) => uri.fsPath);

    const sources = internalPaths.length > 0 ? internalPaths : externalPaths;
    if (sources.length === 0) {
      return;
    }

    const isInternal = internalPaths.length > 0;
    const jobLabel = isInternal ? 'Moving items' : 'Copying items';
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `ForgeFlow: ${jobLabel}`, cancellable: false },
      async () => {
        const workspaceRoots = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
        for (const sourcePath of sources) {
          const mode = resolveDropMode(sourcePath, destination, isInternal, workspaceRoots);
          await moveOrCopy(sourcePath, destination, mode);
        }
      }
    );
  }
}

function isPathNode(node: FilesNode): node is FilesNode & PathNode {
  const candidate = node as unknown as PathNode;
  return typeof candidate.path === 'string';
}

async function resolveDestination(target: FilesNode | undefined): Promise<string | undefined> {
  if (target && !isPathNode(target)) {
    vscode.window.showWarningMessage('ForgeFlow: Drop on a folder or empty area to move/copy.');
    return undefined;
  }

  if (target && isPathNode(target)) {
    const targetStat = await statPath(target.path);
    if (targetStat?.type === vscode.FileType.Directory) {
      return target.path;
    }
    if (targetStat?.type === vscode.FileType.File) {
      return path.dirname(target.path);
    }
    vscode.window.showWarningMessage('ForgeFlow: Drop on a folder or empty area to move/copy.');
    return undefined;
  }

  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: Open a folder before dropping files.');
    return undefined;
  }
  if (folders.length === 1) {
    return folders[0]?.uri.fsPath;
  }
  const picked = await vscode.window.showQuickPick(
    folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
    { placeHolder: 'Select a workspace folder to drop into' }
  );
  return picked?.folder.uri.fsPath;
}

async function parseExternalUris(dataTransfer: vscode.DataTransfer): Promise<vscode.Uri[]> {
  const uriList = dataTransfer.get('text/uri-list');
  if (!uriList) {
    return [];
  }
  const raw = await uriList.asString();
  return raw
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      try {
        return vscode.Uri.parse(line);
      } catch {
        return undefined;
      }
    })
    .filter((uri): uri is vscode.Uri => Boolean(uri));
}

async function moveOrCopy(sourcePath: string, destinationFolder: string, mode: 'move' | 'copy'): Promise<void> {
  const sourceUri = vscode.Uri.file(sourcePath);
  const targetPath = path.join(destinationFolder, path.basename(sourcePath));
  const targetUri = vscode.Uri.file(targetPath);

  if (normalizeFsPath(sourcePath) === normalizeFsPath(targetPath)) {
    return;
  }
  if (isWithin(sourcePath, destinationFolder)) {
    vscode.window.showWarningMessage(`ForgeFlow: Cannot ${mode} "${path.basename(sourcePath)}" into itself.`);
    return;
  }
  try {
    if (mode === 'move') {
      await vscode.workspace.fs.rename(sourceUri, targetUri, { overwrite: false });
    } else {
      await vscode.workspace.fs.copy(sourceUri, targetUri, { overwrite: false });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showWarningMessage(`ForgeFlow: Failed to ${mode} "${path.basename(sourcePath)}": ${message}`);
  }
}

function resolveDropMode(
  sourcePath: string,
  destinationFolder: string,
  isInternal: boolean,
  workspaceRoots: string[]
): 'move' | 'copy' {
  if (!isInternal) {
    return 'copy';
  }
  const sourceRoot = findWorkspaceRoot(sourcePath, workspaceRoots);
  const destinationRoot = findWorkspaceRoot(destinationFolder, workspaceRoots);
  if (!sourceRoot || !destinationRoot || normalizeFsPath(sourceRoot) !== normalizeFsPath(destinationRoot)) {
    return 'copy';
  }
  return 'move';
}

function findWorkspaceRoot(candidatePath: string, workspaceRoots: string[]): string | undefined {
  for (const root of workspaceRoots) {
    if (isWithin(root, candidatePath)) {
      return root;
    }
  }
  return undefined;
}
