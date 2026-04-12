import { execFile } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { isPathCoveredByWorkspaceFolders, resolveGitPathOutput } from '../pathUtils';

const execFileAsync = promisify(execFile);

export type WorktreeRemoveFailure = 'openInWorkspace' | 'repoRootNotFound' | 'gitRemoveFailed';

export interface WorktreeRemoveResult {
  removed: boolean;
  failure?: WorktreeRemoveFailure;
  message?: string;
}

export async function resolveWorktreeRepoRoot(worktreePath: string): Promise<string | undefined> {
  try {
    const result = await execFileAsync('git', ['-C', worktreePath, 'rev-parse', '--show-toplevel']);
    const output = result.stdout?.trim();
    return output ? resolveGitPathOutput(worktreePath, output) : undefined;
  } catch {
    return undefined;
  }
}

export async function removeWorktreeSafely(worktreePath: string, repoRoot?: string): Promise<WorktreeRemoveResult> {
  const folders = vscode.workspace.workspaceFolders;
  if (isPathCoveredByWorkspaceFolders(worktreePath, folders)) {
    return { removed: false, failure: 'openInWorkspace' };
  }
  const resolvedRepoRoot = repoRoot ?? await resolveWorktreeRepoRoot(worktreePath);
  if (!resolvedRepoRoot) {
    return { removed: false, failure: 'repoRootNotFound' };
  }
  try {
    await execFileAsync('git', ['-C', resolvedRepoRoot, 'worktree', 'remove', worktreePath]);
    return { removed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { removed: false, failure: 'gitRemoveFailed', message };
  }
}
