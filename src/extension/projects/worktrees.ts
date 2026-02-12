import * as path from 'path';
import * as vscode from 'vscode';
import type { ProjectsViewProvider } from '../../views/projectsView';
import type { FilesViewProvider } from '../../views/filesView';
import { readProjectGitWorktreeMetadata } from '../../git/worktreeMetadata';
import { tryExecGitTrimmed } from '../../git/exec';
import { getForgeFlowSettings } from '../../util/config';
import { readDirectory } from '../../util/fs';
import { normalizePathKey } from '../pathUtils';
import { getScanRoots } from '../../views/projects/helpers';
import { removeWorktreeSafely } from './worktreeGit';

interface WorktreeCandidate {
  readonly repoRoot: string;
  readonly repoGitDir: string;
  readonly worktreePath: string;
  readonly branch: string;
  readonly defaultBranch: string;
  readonly clean: boolean;
  readonly merged: boolean;
}

interface WorktreeDiscovery {
  readonly repoGitDir: string;
  readonly worktreePath: string;
}

export async function cleanupStaleWorktrees(
  projectsProvider: ProjectsViewProvider,
  filesProvider?: FilesViewProvider
): Promise<number> {
  const roots = getScanRoots();
  if (roots.length === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No scan roots configured for worktree cleanup.');
    return 0;
  }

  const worktrees = await findWorktreesInRoots(roots);
  if (worktrees.length === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No git worktrees found in current scan roots.');
    return 0;
  }
  return await runWorktreeCleanup(worktrees, projectsProvider, filesProvider);
}

export async function cleanupStaleWorktreesInPaths(
  worktreePaths: string[],
  projectsProvider: ProjectsViewProvider,
  filesProvider?: FilesViewProvider
): Promise<number> {
  if (worktreePaths.length === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No discovered worktrees in this scope.');
    return 0;
  }
  const worktrees = await findWorktreesInPaths(worktreePaths);
  if (worktrees.length === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No linked git worktrees found in this scope.');
    return 0;
  }
  return await runWorktreeCleanup(worktrees, projectsProvider, filesProvider);
}

async function runWorktreeCleanup(
  worktrees: WorktreeDiscovery[],
  projectsProvider: ProjectsViewProvider,
  filesProvider?: FilesViewProvider
): Promise<number> {
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
    return 0;
  }

  const picks = await pickWorktrees(candidates, mergedClean.length > 0 && cleanUnmerged.length > 0 ? cleanUnmerged : []);
  if (!picks || picks.length === 0) {
    return 0;
  }

  const confirm = await vscode.window.showWarningMessage(
    `ForgeFlow: Remove ${picks.length} worktree${picks.length === 1 ? '' : 's'}?`,
    { modal: true },
    'Remove'
  );
  if (confirm !== 'Remove') {
    return 0;
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
    filesProvider?.refreshWorktrees();
  }
  vscode.window.setStatusBarMessage(`ForgeFlow: Removed ${removed}/${picks.length} worktrees.`, 4000);
  return removed;
}

async function findWorktreesInRoots(roots: string[]): Promise<WorktreeDiscovery[]> {
  const results: WorktreeDiscovery[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    const entries = await readDirectory(root);
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.Directory) {
        continue;
      }
      const candidatePath = path.join(root, name);
      await maybeAddDiscoveredWorktree(candidatePath, seen, results);
    }
  }
  return results;
}

async function findWorktreesInPaths(worktreePaths: string[]): Promise<WorktreeDiscovery[]> {
  const results: WorktreeDiscovery[] = [];
  const seen = new Set<string>();
  for (const candidatePath of worktreePaths) {
    await maybeAddDiscoveredWorktree(candidatePath, seen, results);
  }
  return results;
}

async function maybeAddDiscoveredWorktree(
  candidatePath: string,
  seen: Set<string>,
  results: WorktreeDiscovery[]
): Promise<void> {
  const candidateKey = normalizePathKey(candidatePath);
  if (seen.has(candidateKey)) {
    return;
  }
  seen.add(candidateKey);
  const discovered = await discoverLinkedWorktree(candidatePath);
  if (!discovered) {
    return;
  }
  results.push(discovered);
}

async function discoverLinkedWorktree(candidatePath: string): Promise<WorktreeDiscovery | undefined> {
  const metadata = await readProjectGitWorktreeMetadata(candidatePath);
  if (!metadata.isWorktree || !metadata.commonDir) {
    return undefined;
  }
  return { repoGitDir: metadata.commonDir, worktreePath: path.resolve(candidatePath) };
}

async function evaluateWorktrees(items: WorktreeDiscovery[]): Promise<WorktreeCandidate[]> {
  const byRepo = new Map<string, WorktreeDiscovery[]>();
  for (const item of items) {
    const key = normalizePathKey(item.repoGitDir);
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
  const result = await removeWorktreeSafely(candidate.worktreePath, candidate.repoRoot);
  if (result.removed) {
    return true;
  }
  if (result.failure === 'openInWorkspace') {
    vscode.window.showWarningMessage(
      `ForgeFlow: Skipping "${path.basename(candidate.worktreePath)}" because it is open in the current workspace.`
    );
    return false;
  }
  if (result.failure === 'repoRootNotFound') {
    vscode.window.showWarningMessage(
      `ForgeFlow: Skipping "${path.basename(candidate.worktreePath)}" because repository root could not be resolved.`
    );
    return false;
  }
  const message = result.message ?? 'Unknown error';
  vscode.window.showWarningMessage(`ForgeFlow: Failed to remove worktree "${path.basename(candidate.worktreePath)}": ${message}`);
  return false;
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
  return await tryExecGitTrimmed(cwd, args);
}
