import * as path from 'path';
import * as vscode from 'vscode';
import type { Project } from '../../models/project';
import { readDirectory } from '../../util/fs';
import type { ProjectNode, ProjectsWebviewBrowseEntry } from './types';
import { ProjectBrowseNode } from './nodes';

export async function readBrowseChildren(folderPath: string, project: Project): Promise<ProjectNode[]> {
  const entries = await readDirectory(folderPath);
  const directories: ProjectNode[] = [];
  const files: ProjectNode[] = [];

  for (const [name, type] of entries) {
    if (name === '.git') {
      continue;
    }
    const entryPath = path.join(folderPath, name);
    const node = new ProjectBrowseNode(project, entryPath, type);
    if (type === vscode.FileType.Directory) {
      directories.push(node);
    } else {
      files.push(node);
    }
  }

  const byName = (a: ProjectNode, b: ProjectNode): number => {
    const aLabel = a.getTreeItem().label?.toString() ?? '';
    const bLabel = b.getTreeItem().label?.toString() ?? '';
    return aLabel.localeCompare(bLabel);
  };

  return [...directories.sort(byName), ...files.sort(byName)];
}

export async function readBrowseEntries(folderPath: string): Promise<ProjectsWebviewBrowseEntry[]> {
  const entries = await readDirectory(folderPath);
  const directories: ProjectsWebviewBrowseEntry[] = [];
  const files: ProjectsWebviewBrowseEntry[] = [];

  for (const [name, type] of entries) {
    if (name === '.git') {
      continue;
    }
    const entryPath = path.join(folderPath, name);
    const entry = {
      path: entryPath,
      name,
      isDirectory: type === vscode.FileType.Directory
    };
    if (entry.isDirectory) {
      directories.push(entry);
    } else {
      files.push(entry);
    }
  }

  const byName = (a: ProjectsWebviewBrowseEntry, b: ProjectsWebviewBrowseEntry): number => a.name.localeCompare(b.name);
  return [...directories.sort(byName), ...files.sort(byName)];
}

export function isPathUnderRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  if (!relative) {
    return true;
  }
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}
