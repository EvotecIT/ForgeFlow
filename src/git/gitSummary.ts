import type { GitRepoStatus } from './gitService';

export interface GitProjectSummary {
  gone: number;
  merged: number;
  stale: number;
  noUpstream: number;
  aheadBehind: number;
  dirty: boolean;
  lastUpdated: number;
  currentBranch: string;
}

export function buildProjectSummary(status: GitRepoStatus): GitProjectSummary {
  const gone = status.branches.filter((branch) => branch.isGone && !branch.isCurrent).length;
  const merged = status.branches.filter((branch) => branch.isMerged && !branch.isCurrent).length;
  const stale = status.branches.filter((branch) => branch.isStale && !branch.isCurrent).length;
  const noUpstream = status.branches.filter((branch) => !branch.hasUpstream && !branch.isCurrent).length;
  const aheadBehind = status.branches.filter((branch) => (branch.ahead > 0 || branch.behind > 0) && !branch.isCurrent).length;

  return {
    gone,
    merged,
    stale,
    noUpstream,
    aheadBehind,
    dirty: status.isDirty,
    lastUpdated: Date.now(),
    currentBranch: status.currentBranch
  };
}
