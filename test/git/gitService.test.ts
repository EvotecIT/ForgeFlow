import { strict as assert } from 'assert';
import * as path from 'path';
import { parseWorktreeBranchMap } from '../../src/git/gitService';

describe('git service worktree parsing', () => {
  it('returns empty map for empty output', () => {
    const parsed = parseWorktreeBranchMap('', '/repo');
    assert.equal(parsed.size, 0);
  });

  it('parses absolute and relative worktree paths with branch refs', () => {
    const repoPath = path.resolve('/repo');
    const absoluteWorktree = path.resolve('/repo-main');
    const relativeWorktree = '../repo-feature';
    const expectedRelative = path.resolve(repoPath, relativeWorktree);
    const output = [
      `worktree ${absoluteWorktree}`,
      'HEAD 1111111111111111111111111111111111111111',
      'branch refs/heads/main',
      '',
      `worktree ${relativeWorktree}`,
      'HEAD 2222222222222222222222222222222222222222',
      'branch refs/heads/feature/demo'
    ].join('\n');

    const parsed = parseWorktreeBranchMap(output, repoPath);
    assert.deepEqual(parsed.get('main'), [absoluteWorktree]);
    assert.deepEqual(parsed.get('feature/demo'), [expectedRelative]);
  });

  it('ignores detached entries and preserves branches across multiple worktrees', () => {
    const repoPath = path.resolve('/repo');
    const worktreeA = path.resolve('/repo-a');
    const worktreeB = path.resolve('/repo-b');
    const detached = path.resolve('/repo-detached');
    const output = [
      `worktree ${worktreeA}`,
      'HEAD aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'branch refs/heads/feature/shared',
      '',
      `worktree ${detached}`,
      'HEAD bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'detached',
      '',
      `worktree ${worktreeB}`,
      'HEAD cccccccccccccccccccccccccccccccccccccccc',
      'branch refs/heads/feature/shared'
    ].join('\n');

    const parsed = parseWorktreeBranchMap(output, repoPath);
    assert.deepEqual(parsed.get('feature/shared'), [worktreeA, worktreeB]);
    assert.equal(parsed.has('detached'), false);
  });

  it('ignores branch lines before a worktree header', () => {
    const repoPath = path.resolve('/repo');
    const output = [
      'branch refs/heads/should-ignore',
      'HEAD dddddddddddddddddddddddddddddddddddddddd',
      '',
      'worktree ../repo-child',
      'branch refs/heads/valid'
    ].join('\n');

    const parsed = parseWorktreeBranchMap(output, repoPath);
    assert.equal(parsed.has('should-ignore'), false);
    assert.deepEqual(parsed.get('valid'), [path.resolve(repoPath, '../repo-child')]);
  });
});
