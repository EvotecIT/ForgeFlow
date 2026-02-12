import * as vscode from 'vscode';
import { baseName } from '../util/path';

interface PathTreeItemOptions {
  contextValue: string;
  description?: string;
  tooltipPath?: boolean;
  openCommandId?: string;
  openTitle?: string;
}

interface LabelTreeNode {
  getTreeItem(): vscode.TreeItem;
}

export function collapsibleForFileType(entryType: vscode.FileType): vscode.TreeItemCollapsibleState {
  return entryType === vscode.FileType.Directory
    ? vscode.TreeItemCollapsibleState.Collapsed
    : vscode.TreeItemCollapsibleState.None;
}

export function createHintTreeItem(
  message: string,
  contextValue: string,
  commandId?: string
): vscode.TreeItem {
  const item = new vscode.TreeItem(message, vscode.TreeItemCollapsibleState.None);
  item.iconPath = new vscode.ThemeIcon('info');
  item.contextValue = contextValue;
  if (commandId) {
    item.command = { command: commandId, title: message };
  }
  return item;
}

export function createPathTreeItem(
  entryPath: string,
  entryType: vscode.FileType,
  options: PathTreeItemOptions
): vscode.TreeItem {
  const item = new vscode.TreeItem(baseName(entryPath), collapsibleForFileType(entryType));
  item.resourceUri = vscode.Uri.file(entryPath);
  item.contextValue = options.contextValue;
  if (options.description) {
    item.description = options.description;
  }
  if (options.tooltipPath) {
    item.tooltip = entryPath;
  }
  if (options.openCommandId && entryType !== vscode.FileType.Directory) {
    item.command = {
      command: options.openCommandId,
      title: options.openTitle ?? 'Open',
      arguments: [entryPath]
    };
  }
  return item;
}

export function compareTreeNodeLabels<T extends LabelTreeNode>(a: T, b: T): number {
  const aLabel = a.getTreeItem().label?.toString() ?? '';
  const bLabel = b.getTreeItem().label?.toString() ?? '';
  return aLabel.localeCompare(bLabel);
}

export function pushByFileType<T>(
  entryType: vscode.FileType,
  item: T,
  directories: T[],
  files: T[]
): void {
  if (entryType === vscode.FileType.Directory) {
    directories.push(item);
    return;
  }
  files.push(item);
}
