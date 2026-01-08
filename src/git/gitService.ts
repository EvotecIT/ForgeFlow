import { execFile } from 'child_process';
import { promisify } from 'util';
import { getForgeFlowSettings } from '../util/config';

const execFileAsync = promisify(execFile);

export interface GitBranchInfo {
  name: string;
  upstream?: string;
  track?: string;
  lastCommit?: string;
  isCurrent: boolean;
  hasUpstream: boolean;
  isGone: boolean;
  isMerged: boolean;
  isStale: boolean;
  ahead: number;
  behind: number;
  ageDays?: number;
  statusLabel: string;
}

export interface GitRepoStatus {
  path: string;
  name: string;
  currentBranch: string;
  isDetached: boolean;
  isDirty: boolean;
  defaultBranch: string;
  branches: GitBranchInfo[];
}

export type GitBranchGroup =
  | 'current'
  | 'gone'
  | 'merged'
  | 'noUpstream'
  | 'aheadBehind'
  | 'stale'
  | 'clean';

export interface GitRepoOverrides {
  staleDays?: number;
  defaultBranch?: string;
}

export class GitService {
  public async getRepoStatus(
    repoPath: string,
    repoName: string,
    overrides?: GitRepoOverrides
  ): Promise<GitRepoStatus | undefined> {
    try {
      const currentBranchRaw = await execGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
      const currentBranch = currentBranchRaw.trim();
      const isDetached = currentBranch === 'HEAD';
      const isDirty = (await execGit(repoPath, ['status', '--porcelain'])).trim().length > 0;
      const branches = await this.readBranches(repoPath, currentBranch);
      const defaultBranch = await this.resolveDefaultBranch(repoPath, branches, currentBranch, overrides?.defaultBranch);
      const mergedBranches = await this.readMergedBranches(repoPath, defaultBranch);
      const configuredStale = overrides?.staleDays ?? getForgeFlowSettings().gitStaleDays;
      const staleDays = Math.max(0, configuredStale);

      const enriched = branches.map((branch) => {
        const merged = mergedBranches.has(branch.name);
        const isMerged = merged && branch.name !== currentBranch;
        const ageDays = branch.lastCommit ? diffDays(branch.lastCommit) : undefined;
        const isStale = staleDays > 0 && ageDays !== undefined ? ageDays >= staleDays : false;
        const statusLabel = buildStatusLabel({
          isCurrent: branch.isCurrent,
          isGone: branch.isGone,
          hasUpstream: branch.hasUpstream,
          ahead: branch.ahead,
          behind: branch.behind,
          isMerged,
          isStale,
          ageDays
        });
        return {
          ...branch,
          isMerged,
          isStale,
          ageDays,
          statusLabel
        };
      });

      return {
        path: repoPath,
        name: repoName,
        currentBranch,
        isDetached,
        isDirty,
        defaultBranch,
        branches: enriched
      };
    } catch {
      return undefined;
    }
  }

  public async checkoutBranch(repoPath: string, branch: string): Promise<void> {
    await execGit(repoPath, ['checkout', branch]);
  }

  public async deleteBranch(repoPath: string, branch: string, force: boolean): Promise<void> {
    await execGit(repoPath, ['branch', force ? '-D' : '-d', branch]);
  }

  public async pruneRemotes(repoPath: string): Promise<void> {
    const remotesRaw = await execGit(repoPath, ['remote']);
    const remotes = remotesRaw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (remotes.length === 0) {
      return;
    }
    for (const remote of remotes) {
      await execGit(repoPath, ['remote', 'prune', remote]);
    }
  }

  public async deleteMergedBranches(repoPath: string, defaultBranch: string): Promise<string[]> {
    const merged = await this.readMergedBranches(repoPath, defaultBranch);
    const deleted: string[] = [];
    for (const branch of merged) {
      if (branch === defaultBranch) {
        continue;
      }
      await execGit(repoPath, ['branch', '-d', branch]);
      deleted.push(branch);
    }
    return deleted;
  }

  private async readBranches(repoPath: string, currentBranch: string): Promise<GitBranchInfo[]> {
    const output = await execGit(repoPath, [
      'for-each-ref',
      'refs/heads',
      '--format=%(refname:short)|%(upstream:short)|%(upstream:track)|%(committerdate:iso8601)'
    ]);
    const lines = output.split(/\r?\n/).filter(Boolean);
    return lines.map((line) => parseBranchLine(line, currentBranch));
  }

  private async resolveDefaultBranch(
    repoPath: string,
    branches: GitBranchInfo[],
    currentBranch: string,
    overrideDefault?: string
  ): Promise<string> {
    const configDefault = overrideDefault ?? (getForgeFlowSettings().gitDefaultBranch || 'main');
    try {
      const symbolic = await execGit(repoPath, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
      const trimmed = symbolic.trim();
      const parts = trimmed.split('/');
      const name = parts[parts.length - 1];
      if (name) {
        return name;
      }
    } catch {
      // ignore
    }

    const localNames = new Set(branches.map((branch) => branch.name));
    if (localNames.has(configDefault)) {
      return configDefault;
    }
    if (localNames.has('main')) {
      return 'main';
    }
    if (localNames.has('master')) {
      return 'master';
    }
    return currentBranch;
  }

  private async readMergedBranches(repoPath: string, defaultBranch: string): Promise<Set<string>> {
    try {
      const output = await execGit(repoPath, ['branch', '--merged', defaultBranch]);
      const names = output
        .split(/\r?\n/)
        .map((line) => line.replace('*', '').trim())
        .filter(Boolean);
      return new Set(names);
    } catch {
      return new Set<string>();
    }
  }
}

interface TrackInfo {
  ahead: number;
  behind: number;
  isGone: boolean;
}

function parseBranchLine(line: string, currentBranch: string): GitBranchInfo {
  const [name, upstream, track, commit] = line.split('|');
  const trackInfo = parseTrack(track);
  const hasUpstream = Boolean(upstream);
  return {
    name: name ?? '',
    upstream: upstream || undefined,
    track: track || undefined,
    lastCommit: commit || undefined,
    isCurrent: name === currentBranch,
    hasUpstream,
    isGone: trackInfo.isGone,
    isMerged: false,
    isStale: false,
    ahead: trackInfo.ahead,
    behind: trackInfo.behind,
    statusLabel: ''
  };
}

function parseTrack(value?: string): TrackInfo {
  if (!value) {
    return { ahead: 0, behind: 0, isGone: false };
  }
  if (value.includes('gone')) {
    return { ahead: 0, behind: 0, isGone: true };
  }
  const aheadMatch = /ahead\s+(\d+)/i.exec(value);
  const behindMatch = /behind\s+(\d+)/i.exec(value);
  return {
    ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
    behind: behindMatch ? Number(behindMatch[1]) : 0,
    isGone: false
  };
}

function buildStatusLabel(input: {
  isCurrent: boolean;
  isGone: boolean;
  hasUpstream: boolean;
  ahead: number;
  behind: number;
  isMerged: boolean;
  isStale: boolean;
  ageDays?: number;
}): string {
  const labels: string[] = [];
  if (input.isCurrent) {
    labels.push('current');
  }
  if (input.isGone) {
    labels.push('gone');
  } else if (!input.hasUpstream) {
    labels.push('no upstream');
  }
  if (input.ahead > 0 && input.behind > 0) {
    labels.push(`diverged ${input.ahead}/${input.behind}`);
  } else if (input.ahead > 0) {
    labels.push(`ahead ${input.ahead}`);
  } else if (input.behind > 0) {
    labels.push(`behind ${input.behind}`);
  }
  if (input.isMerged) {
    labels.push('merged');
  }
  if (input.isStale && input.ageDays !== undefined) {
    labels.push(`stale ${input.ageDays}d`);
  }
  if (labels.length === 0) {
    return 'clean';
  }
  return labels.join(' · ');
}

function diffDays(isoDate: string): number | undefined {
  const timestamp = Date.parse(isoDate);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }
  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) {
    return 0;
  }
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

async function execGit(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', ['-C', cwd, ...args]);
  return result.stdout;
}
