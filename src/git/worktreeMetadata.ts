import * as path from 'path';
import * as vscode from 'vscode';
import { readFileText, statPath } from '../util/fs';
import { normalizeFsPath } from '../extension/pathUtils';

export type DotGitKind = 'none' | 'directory' | 'file' | 'other';

export interface ProjectGitWorktreeMetadata {
  readonly dotGitKind: DotGitKind;
  readonly hasGitDir: boolean;
  readonly isWorktree: boolean;
  readonly commonDir?: string;
  readonly gitDirRaw?: string;
  readonly gitDirResolved?: string;
}

export async function readProjectGitWorktreeMetadata(projectPath: string): Promise<ProjectGitWorktreeMetadata> {
  const dotGitPath = path.join(projectPath, '.git');
  const dotGitStat = await statPath(dotGitPath);
  if (!dotGitStat) {
    return { dotGitKind: 'none', hasGitDir: false, isWorktree: false };
  }
  if (dotGitStat.type === vscode.FileType.Directory) {
    return {
      dotGitKind: 'directory',
      hasGitDir: true,
      isWorktree: false,
      commonDir: normalizeGitCommonDir(dotGitPath)
    };
  }
  if (dotGitStat.type !== vscode.FileType.File) {
    return { dotGitKind: 'other', hasGitDir: false, isWorktree: false };
  }
  const text = await readFileText(dotGitPath);
  const gitDirRaw = text ? parseGitDirDirective(text) : undefined;
  if (!gitDirRaw) {
    return { dotGitKind: 'file', hasGitDir: false, isWorktree: false };
  }
  const resolvedGitDir = resolveGitDirValue(dotGitPath, gitDirRaw);
  const info = deriveGitDirInfo(resolvedGitDir);
  return {
    dotGitKind: 'file',
    hasGitDir: true,
    isWorktree: info.isWorktree,
    commonDir: info.commonDir,
    gitDirRaw,
    gitDirResolved: resolvedGitDir
  };
}

export function parseGitDirDirective(text: string): string | undefined {
  const match = /^\s*gitdir:\s*(.+)\s*$/im.exec(text);
  return match?.[1]?.trim() || undefined;
}

export function resolveGitDirValue(dotGitPath: string, gitDirValue: string): string {
  return path.isAbsolute(gitDirValue)
    ? gitDirValue
    : path.resolve(path.dirname(dotGitPath), gitDirValue);
}

export function normalizeGitCommonDir(value: string): string {
  const resolved = path.resolve(normalizeFsPath(value)).replace(/\\/g, '/');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function deriveGitDirInfo(gitDirPath: string): { isWorktree: boolean; commonDir: string } {
  const normalized = normalizeGitCommonDir(gitDirPath);
  const marker = '/worktrees/';
  const index = normalized.indexOf(marker);
  if (index < 0) {
    return { isWorktree: false, commonDir: normalized };
  }
  return { isWorktree: true, commonDir: normalized.slice(0, index) };
}

export function deriveRepoGitDirFromGitDir(gitDirPath: string): string | undefined {
  const info = deriveGitDirInfo(gitDirPath);
  if (!info.isWorktree) {
    return undefined;
  }
  return path.normalize(info.commonDir);
}
