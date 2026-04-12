import * as path from 'path';

export interface ParsedWorktreeEntry {
  path: string;
  branch?: string;
  detached: boolean;
}

export function parseWorktreeListPorcelain(
  output: string,
  repoPath: string,
  resolvePath: (repoPath: string, rawPath: string) => string = defaultResolveWorktreePath
): ParsedWorktreeEntry[] {
  const entries: ParsedWorktreeEntry[] = [];
  let current: ParsedWorktreeEntry | undefined;

  for (const line of output.split(/\r?\n/g)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('worktree ')) {
      if (current) {
        entries.push(current);
      }
      const rawPath = trimmed.slice('worktree '.length).trim();
      if (!rawPath) {
        current = undefined;
        continue;
      }
      current = { path: resolvePath(repoPath, rawPath), detached: false };
      continue;
    }

    if (!current) {
      continue;
    }

    if (trimmed.startsWith('branch ')) {
      const ref = trimmed.slice('branch '.length).trim();
      current.branch = ref.replace(/^refs\/heads\//, '');
      continue;
    }

    if (trimmed === 'detached') {
      current.detached = true;
    }
  }

  if (current) {
    entries.push(current);
  }

  return entries;
}

function defaultResolveWorktreePath(repoPath: string, rawPath: string): string {
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(repoPath, rawPath);
}
