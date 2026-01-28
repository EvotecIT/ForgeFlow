import { execFile } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import type { ProjectsViewProvider } from '../../views/projectsView';
import { getForgeFlowSettings } from '../../util/config';
import { readDirectory, readFileText, statPath } from '../../util/fs';
import { normalizeFsPath } from '../pathUtils';
import { getScanRoots } from '../../views/projects/helpers';

const execFileAsync = promisify(execFile);

interface WorktreeCandidate {
  readonly repoRoot: string;
  readonly repoGitDir: string;
  readonly worktreePath: string;
  readonly branch: string;
  readonly defaultBranch: string;
  readonly clean: boolean;
  readonly merged: boolean;
}

export async function cleanupStaleWorktrees(projectsProvider: ProjectsViewProvider): Promise<void> {
  const roots = getScanRoots();
  if (roots.length === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No scan roots configured for worktree cleanup.');
    return;
  }

  const worktrees = await findWorktreesInRoots(roots);
  if (worktrees.length === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No git worktrees found in current scan roots.');
    return;
  }

  const evaluated = await evaluateWorktrees(worktrees);
  const mergedClean = evaluated.filter((item) => item.clean && item.merged && item.branch !== item.defaultBranch);
  const cleanUnmerged = evaluated.filter((item) => item.clean && !item.merged && item.branch !== item.defaultBranch);

  let candidates = mergedClean;
  if (candidates.length === 0 && cleanUnmerged.length > 0) {
    const include = await vscode.window.showWarningMessage(
      `ForgeFlow: No merged clean worktrees found. Include ${cleanUnmerged.length} clean but unmerged worktrees?`,
      { modal: true },
      'Include'
    );
    if (include === 'Include') {
      candidates = cleanUnmerged;
    }
  }

  if (candidates.length === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No stale worktrees matched cleanup criteria.');
    return;
  }

  const picks = await pickWorktrees(candidates, mergedClean.length > 0 && cleanUnmerged.length > 0 ? cleanUnmerged : []);
  if (!picks || picks.length === 0) {
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `ForgeFlow: Remove ${picks.length} worktree${picks.length === 1 ? '' : 's'}?`,
    { modal: true },
    'Remove'
  );
  if (confirm !== 'Remove') {
    return;
  }

  let removed = 0;
  for (const candidate of picks) {
    const ok = await removeWorktree(candidate);
    if (ok) {
      removed += 1;
    }
  }

  if (removed > 0) {
    await projectsProvider.refresh(true);
  }
  vscode.window.setStatusBarMessage(`ForgeFlow: Removed ${removed}/${picks.length} worktrees.`, 4000);
}

async function findWorktreesInRoots(roots: string[]): Promise<Array<{ repoGitDir: string; worktreePath: string }>> {
  const results: Array<{ repoGitDir: string; worktreePath: string }> = [];
  for (const root of roots) {
    const entries = await readDirectory(root);
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.Directory) {
        continue;
      }
      const candidatePath = path.join(root, name);
      const gitFile = path.join(candidatePath, '.git');
      const gitStat = await statPath(gitFile);
      if (!gitStat || gitStat.type !== vscode.FileType.File) {
        continue;
      }
      const gitdir = await readGitdir(gitFile);
      if (!gitdir) {
        continue;
      }
      const repoGitDir = deriveRepoGitDir(gitdir);
      if (!repoGitDir) {
        continue;
      }
      results.push({ repoGitDir, worktreePath: candidatePath });
    }
  }
  return results;
}

async function evaluateWorktrees(items: Array<{ repoGitDir: string; worktreePath: string }>): Promise<WorktreeCandidate[]> {
  const byRepo = new Map<string, Array<{ repoGitDir: string; worktreePath: string }>>();
  for (const item of items) {
    const key = normalizeFsPath(item.repoGitDir);
    const list = byRepo.get(key) ?? [];
    list.push(item);
    byRepo.set(key, list);
  }

  const evaluated: WorktreeCandidate[] = [];
  for (const [repoGitDir, repoItems] of byRepo) {
    const repoRoot = path.dirname(repoGitDir);
    const defaultBranch = await detectDefaultBranch(repoRoot);
    for (const item of repoItems) {
      const branch = await git(item.worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD']);
      const porcelain = (await git(item.worktreePath, ['status', '--porcelain'])) ?? '';
      const clean = porcelain.trim().length === 0;
      const merged = branch
        ? await isBranchMerged(repoRoot, branch, defaultBranch)
        : false;
      if (!branch) {
        continue;
      }
      evaluated.push({
        repoRoot,
        repoGitDir,
        worktreePath: item.worktreePath,
        branch,
        defaultBranch,
        clean,
        merged
      });
    }
  }
  return evaluated;
}

async function pickWorktrees(primary: WorktreeCandidate[], secondary: WorktreeCandidate[]): Promise<WorktreeCandidate[] | undefined> {
  const items: Array<vscode.QuickPickItem & { candidate?: WorktreeCandidate }> = [];
  if (primary.length > 0) {
    items.push({ label: 'Merged & clean', kind: vscode.QuickPickItemKind.Separator });
    items.push(...primary.map((candidate) => toQuickPickItem(candidate, true)));
  }
  if (secondary.length > 0) {
    items.push({ label: 'Clean but unmerged', kind: vscode.QuickPickItemKind.Separator });
    items.push(...secondary.map((candidate) => toQuickPickItem(candidate, false)));
  }
  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: 'Select worktrees to remove'
  });
  if (!picked) {
    return undefined;
  }
  return picked
    .map((item) => item.candidate)
    .filter((candidate): candidate is WorktreeCandidate => Boolean(candidate));
}

function toQuickPickItem(candidate: WorktreeCandidate, merged: boolean): vscode.QuickPickItem & { candidate: WorktreeCandidate } {
  const repoName = path.basename(candidate.repoRoot);
  const worktreeName = path.basename(candidate.worktreePath);
  const status = merged ? 'merged' : 'unmerged';
  const description = `${candidate.branch} • ${status} • ${repoName}`;
  return {
    label: worktreeName,
    description,
    detail: candidate.worktreePath,
    candidate
  };
}

async function removeWorktree(candidate: WorktreeCandidate): Promise<boolean> {
  const args = ['worktree', 'remove', candidate.worktreePath];
  try {
    await execFileAsync('git', ['-C', candidate.repoRoot, ...args]);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showWarningMessage(`ForgeFlow: Failed to remove worktree "${path.basename(candidate.worktreePath)}": ${message}`);
    return false;
  }
}

async function readGitdir(gitFile: string): Promise<string | undefined> {
  const text = await readFileText(gitFile);
  if (!text) {
    return undefined;
  }
  const match = /^\s*gitdir:\s*(.+)\s*$/im.exec(text);
  const value = match?.[1]?.trim();
  if (!value) {
    return undefined;
  }
  return value;
}

function deriveRepoGitDir(gitdir: string): string | undefined {
  const normalized = gitdir.replace(/\\/g, '/');
  const marker = '/worktrees/';
  const index = normalized.toLowerCase().indexOf(marker);
  if (index < 0) {
    return undefined;
  }
  const repoGitDir = normalized.slice(0, index);
  return path.normalize(repoGitDir);
}

async function detectDefaultBranch(repoRoot: string): Promise<string> {
  const symbolic = await git(repoRoot, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (symbolic) {
    const parts = symbolic.split('/');
    const branch = parts[parts.length - 1];
    if (branch) {
      return branch;
    }
  }
  return getForgeFlowSettings().gitDefaultBranch;
}

async function isBranchMerged(repoRoot: string, branch: string, defaultBranch: string): Promise<boolean> {
  const output = await git(repoRoot, ['branch', '--merged', defaultBranch]);
  if (!output) {
    return false;
  }
  const lines = output
    .split(/\r?\n/g)
    .map((line) => line.replace(/^\*/, '').trim())
    .filter((line) => line.length > 0);
  return lines.includes(branch);
}

async function git(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const result = await execFileAsync('git', ['-C', cwd, ...args]);
    return result.stdout?.trim();
  } catch {
    return undefined;
  }
}
