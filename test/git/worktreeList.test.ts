import { strict as assert } from 'assert';
import * as path from 'path';
import { parseWorktreeListPorcelain } from '../../src/git/worktreeList';

describe('worktree list parser', () => {
  it('parses absolute and relative worktree entries', () => {
    const repoPath = path.resolve('/repo');
    const output = [
      `worktree ${path.resolve('/repo-main')}`,
      'branch refs/heads/main',
      '',
      'worktree ../repo-feature',
      'branch refs/heads/feature/demo'
    ].join('\n');

    const parsed = parseWorktreeListPorcelain(output, repoPath);
    assert.equal(parsed.length, 2);
    assert.deepEqual(parsed[0], { path: path.resolve('/repo-main'), branch: 'main', detached: false });
    assert.deepEqual(parsed[1], { path: path.resolve(repoPath, '../repo-feature'), branch: 'feature/demo', detached: false });
  });

  it('marks detached entries and ignores metadata before first worktree', () => {
    const repoPath = path.resolve('/repo');
    const output = [
      'branch refs/heads/ignore-me',
      '',
      'worktree ../repo-detached',
      'detached'
    ].join('\n');

    const parsed = parseWorktreeListPorcelain(output, repoPath);
    assert.equal(parsed.length, 1);
    assert.deepEqual(parsed[0], { path: path.resolve(repoPath, '../repo-detached'), detached: true });
  });
});
