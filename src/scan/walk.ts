import * as path from 'path';
import type * as vscode from 'vscode';
import { readDirectory } from '../util/fs';

export interface ScanWalkDirectory {
  readonly dir: string;
  readonly depth: number;
  readonly entries: [string, vscode.FileType][];
  enqueue(name: string): void;
  enqueuePath(entryPath: string): void;
}

export async function walkDirectoriesBreadthFirst(
  root: string,
  maxDepth: number,
  visit: (directory: ScanWalkDirectory) => Promise<void>
): Promise<void> {
  const depthLimit = Math.max(0, maxDepth);
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      continue;
    }
    const entries = await readDirectory(next.dir);
    const enqueuePath = (entryPath: string): void => {
      if (next.depth < depthLimit) {
        queue.push({ dir: entryPath, depth: next.depth + 1 });
      }
    };
    const enqueue = (name: string): void => {
      enqueuePath(path.join(next.dir, name));
    };
    await visit({
      dir: next.dir,
      depth: next.depth,
      entries,
      enqueue,
      enqueuePath
    });
  }
}
