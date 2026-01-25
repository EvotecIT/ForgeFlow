import * as path from 'path';
import * as vscode from 'vscode';
import { readDirectory, statPath } from '../util/fs';

interface ModifiedScanOptions {
  ignoreFolders: string[];
  ignoreExtensions: string[];
}

export async function findRecentWriteTime(
  root: string,
  depth: number,
  options: ModifiedScanOptions
): Promise<number | undefined> {
  let newest: number | undefined;
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  const ignoredFolders = new Set(options.ignoreFolders.map((entry) => entry.toLowerCase()));
  const ignoredExts = new Set(options.ignoreExtensions.map((entry) => entry.toLowerCase().replace(/^\./, '')));

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      continue;
    }
    const entries = await readDirectory(next.dir);
    for (const [name, type] of entries) {
      const loweredName = name.toLowerCase();
      if (ignoredFolders.has(loweredName) || loweredName.startsWith('.')) {
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
        const ext = path.extname(name).toLowerCase().replace('.', '');
        if (ext && ignoredExts.has(ext)) {
          continue;
        }
        const stat = await statPath(entryPath);
        if (stat?.mtime) {
          newest = newest ? Math.max(newest, stat.mtime) : stat.mtime;
        }
      }
    }
  }

  return newest;
}
