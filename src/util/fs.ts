import * as vscode from 'vscode';

export async function pathExists(path: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(path));
    return true;
  } catch {
    return false;
  }
}

export async function statPath(path: string): Promise<vscode.FileStat | undefined> {
  try {
    return await vscode.workspace.fs.stat(vscode.Uri.file(path));
  } catch {
    return undefined;
  }
}

export async function readDirectory(path: string): Promise<[string, vscode.FileType][]> {
  try {
    return await vscode.workspace.fs.readDirectory(vscode.Uri.file(path));
  } catch {
    return [];
  }
}

export async function readFileText(path: string): Promise<string | undefined> {
  try {
    const data = await vscode.workspace.fs.readFile(vscode.Uri.file(path));
    return Buffer.from(data).toString('utf8');
  } catch {
    return undefined;
  }
}

export function isDirectory(stat: vscode.FileStat | undefined): boolean {
  return stat !== undefined && (stat.type & vscode.FileType.Directory) !== 0;
}
