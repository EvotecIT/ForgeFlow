import * as vscode from 'vscode';

export function hasWorkspaceFolders(): boolean {
  const folders = vscode.workspace.workspaceFolders ?? [];
  return folders.length > 0;
}

export async function pickWorkspaceFolderPath(placeHolder: string): Promise<string | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    return undefined;
  }
  if (folders.length === 1) {
    return folders[0]?.uri.fsPath;
  }
  const pick = await vscode.window.showQuickPick(
    folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
    { placeHolder }
  );
  return pick?.folder.uri.fsPath;
}
