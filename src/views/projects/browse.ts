import * as path from 'path';
import * as vscode from 'vscode';
import type { Project } from '../../models/project';
import { readDirectory } from '../../util/fs';
import type { ProjectNode, ProjectsWebviewBrowseEntry } from './types';
import { ProjectBrowseNode } from './nodes';
import { compareTreeNodeLabels, pushByFileType } from '../treeItems';

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
    pushByFileType(type, node, directories, files);
  }

  return [...directories.sort(compareTreeNodeLabels), ...files.sort(compareTreeNodeLabels)];
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
    pushByFileType(type, entry, directories, files);
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
