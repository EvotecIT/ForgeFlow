export type DeletionPlanMode = 'clean' | 'gone' | 'merged';

export interface BranchSkipReason {
  branch: string;
  reason: string;
}

export interface BranchDeletionPlan {
  gone: string[];
  merged: string[];
  skipped: BranchSkipReason[];
}

export interface BranchDeletionInput {
  goneCandidates: string[];
  mergedCandidates: string[];
  currentBranch: string;
  defaultBranch: string;
  checkedOutInWorktrees: Map<string, string[]>;
  mode: DeletionPlanMode;
}

export function isProtectedBranch(
  branch: string,
  currentBranch: string,
  defaultBranch: string,
  checkedOutInWorktrees: Map<string, string[]>
): boolean {
  if (branch === currentBranch || branch === defaultBranch) {
    return true;
  }
  const paths = checkedOutInWorktrees.get(branch);
  return Boolean(paths && paths.length > 0);
}

export function buildBranchDeletionPlan(input: BranchDeletionInput): BranchDeletionPlan {
  const protectedReasons = createProtectedReasonsMap(
    input.currentBranch,
    input.defaultBranch,
    input.checkedOutInWorktrees
  );
  const goneSelection = partitionDeletableBranches(input.goneCandidates, protectedReasons);
  const mergedSelection = partitionDeletableBranches(
    input.mergedCandidates.filter((branch) => !goneSelection.deletable.includes(branch)),
    protectedReasons
  );

  if (input.mode === 'gone') {
    return { gone: goneSelection.deletable, merged: [], skipped: goneSelection.skipped };
  }
  if (input.mode === 'merged') {
    return { gone: [], merged: mergedSelection.deletable, skipped: mergedSelection.skipped };
  }
  return {
    gone: goneSelection.deletable,
    merged: mergedSelection.deletable,
    skipped: [...goneSelection.skipped, ...mergedSelection.skipped]
  };
}

function createProtectedReasonsMap(
  currentBranch: string,
  defaultBranch: string,
  checkedOutInWorktrees: Map<string, string[]>
): Map<string, string> {
  const protectedReasons = new Map<string, string>();
  protectedReasons.set(currentBranch, 'current branch');
  protectedReasons.set(defaultBranch, 'default branch');
  for (const [branch, paths] of checkedOutInWorktrees) {
    if (protectedReasons.has(branch)) {
      continue;
    }
    const sample = paths.slice(0, 2).join(', ');
    const suffix = paths.length > 2 ? ', ...' : '';
    protectedReasons.set(branch, `checked out in worktree${paths.length === 1 ? '' : 's'} (${sample}${suffix})`);
  }
  return protectedReasons;
}

function partitionDeletableBranches(
  candidates: string[],
  protectedReasons: Map<string, string>
): { deletable: string[]; skipped: BranchSkipReason[] } {
  const seen = new Set<string>();
  const deletable: string[] = [];
  const skipped: BranchSkipReason[] = [];
  for (const branch of candidates) {
    if (!branch || seen.has(branch)) {
      continue;
    }
    seen.add(branch);
    const reason = protectedReasons.get(branch);
    if (reason) {
      skipped.push({ branch, reason });
      continue;
    }
    deletable.push(branch);
  }
  return { deletable, skipped };
}
