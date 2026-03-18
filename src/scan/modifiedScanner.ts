import * as path from 'path';
import * as vscode from 'vscode';
import { statPath } from '../util/fs';
import { walkDirectoriesBreadthFirst } from './walk';

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
  const ignoredFolders = new Set(options.ignoreFolders.map((entry) => entry.toLowerCase()));
  const ignoredExts = new Set(options.ignoreExtensions.map((entry) => entry.toLowerCase().replace(/^\./, '')));
  await walkDirectoriesBreadthFirst(root, depth, async ({ dir, depth: currentDepth, entries, enqueue }) => {
    for (const [name, type] of entries) {
      const loweredName = name.toLowerCase();
      if (ignoredFolders.has(loweredName) || loweredName.startsWith('.')) {
        continue;
      }
      const entryPath = path.join(dir, name);
      if (type === vscode.FileType.Directory) {
        if (currentDepth < depth) {
          enqueue(name);
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
  });

  return newest;
}
