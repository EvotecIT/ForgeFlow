import * as path from 'path';
import * as vscode from 'vscode';
import { readDirectory, statPath } from '../util/fs';

const ignoredFolders = new Set([
  '.git',
  '.github',
  '.vscode',
  'node_modules',
  'bin',
  'obj',
  'dist',
  'out',
  'artifacts',
  'packages'
]);

export async function findRecentWriteTime(root: string, depth: number): Promise<number | undefined> {
  let newest: number | undefined;
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      continue;
    }
    const entries = await readDirectory(next.dir);
    for (const [name, type] of entries) {
      if (ignoredFolders.has(name) || name.startsWith('.')) {
        continue;
      }
      const entryPath = path.join(next.dir, name);
      if (type === vscode.FileType.Directory) {
        if (next.depth < depth) {
          queue.push({ dir: entryPath, depth: next.depth + 1 });
        }
        continue;
      }
      if (type === vscode.FileType.File) {
        const stat = await statPath(entryPath);
        if (stat?.mtime) {
          newest = newest ? Math.max(newest, stat.mtime) : stat.mtime;
        }
      }
    }
  }

  return newest;
}
