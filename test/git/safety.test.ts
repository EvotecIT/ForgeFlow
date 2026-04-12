import { strict as assert } from 'assert';
import { buildBranchDeletionPlan, isProtectedBranch } from '../../src/extension/git/safety';

describe('git safety planning', () => {
  it('protects current, default, and worktree-checked-out branches', () => {
    const checkedOut = new Map<string, string[]>();
    checkedOut.set('wt-branch', ['/repo/worktree-a']);

    const plan = buildBranchDeletionPlan({
      goneCandidates: ['current', 'main', 'wt-branch', 'feature'],
      mergedCandidates: [],
      currentBranch: 'current',
      defaultBranch: 'main',
      checkedOutInWorktrees: checkedOut,
      mode: 'clean'
    });

    assert.deepEqual(plan.gone, ['feature']);
    assert.deepEqual(plan.merged, []);
    assert.deepEqual(
      plan.skipped.map((item) => item.branch).sort(),
      ['current', 'main', 'wt-branch']
    );
  });

  it('deduplicates and keeps gone branches out of merged deletions', () => {
    const plan = buildBranchDeletionPlan({
      goneCandidates: ['dup', 'dup'],
      mergedCandidates: ['dup', 'merged-only', 'merged-only'],
      currentBranch: 'current',
      defaultBranch: 'main',
      checkedOutInWorktrees: new Map<string, string[]>(),
      mode: 'clean'
    });

    assert.deepEqual(plan.gone, ['dup']);
    assert.deepEqual(plan.merged, ['merged-only']);
    assert.deepEqual(plan.skipped, []);
  });

  it('returns only gone branches in gone mode', () => {
    const plan = buildBranchDeletionPlan({
      goneCandidates: ['gone-a'],
      mergedCandidates: ['merged-a'],
      currentBranch: 'current',
      defaultBranch: 'main',
      checkedOutInWorktrees: new Map<string, string[]>(),
      mode: 'gone'
    });

    assert.deepEqual(plan.gone, ['gone-a']);
    assert.deepEqual(plan.merged, []);
  });

  it('returns only merged branches in merged mode and respects protection', () => {
    const plan = buildBranchDeletionPlan({
      goneCandidates: ['gone-a'],
      mergedCandidates: ['current', 'merged-a'],
      currentBranch: 'current',
      defaultBranch: 'main',
      checkedOutInWorktrees: new Map<string, string[]>(),
      mode: 'merged'
    });

    assert.deepEqual(plan.gone, []);
    assert.deepEqual(plan.merged, ['merged-a']);
    assert.deepEqual(plan.skipped.map((item) => item.branch), ['current']);
  });

  it('reports branch protection checks directly', () => {
    const checkedOut = new Map<string, string[]>();
    checkedOut.set('wt-branch', ['/repo/worktree-a']);

    assert.equal(isProtectedBranch('current', 'current', 'main', checkedOut), true);
    assert.equal(isProtectedBranch('main', 'current', 'main', checkedOut), true);
    assert.equal(isProtectedBranch('wt-branch', 'current', 'main', checkedOut), true);
    assert.equal(isProtectedBranch('feature', 'current', 'main', checkedOut), false);
  });
});
