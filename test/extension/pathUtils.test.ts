import { strict as assert } from 'assert';
import * as path from 'path';
import { isPathCoveredByWorkspaceFolders, normalizeFsPath, normalizePathKey, resolveGitPathOutput } from '../../src/extension/pathUtils';

describe('pathUtils', () => {
  it('resolves relative git output paths against cwd', () => {
    const cwd = path.join(path.sep, 'tmp', 'repo');
    const resolved = resolveGitPathOutput(cwd, '../worktree');
    assert.equal(resolved, path.resolve(cwd, '../worktree'));
  });

  it('normalizes path keys for stable comparisons', () => {
    const keyA = normalizePathKey(path.join(path.sep, 'tmp', 'repo', '..', 'repo', 'a.txt'));
    const keyB = normalizePathKey(path.join(path.sep, 'tmp', 'repo', 'a.txt'));
    assert.equal(keyA, keyB);
  });

  it('treats nested workspace paths as covered for safety checks', () => {
    const workspaceRoot = path.join(path.sep, 'tmp', 'workspace');
    const folders = [{ uri: { fsPath: workspaceRoot } }];
    assert.equal(isPathCoveredByWorkspaceFolders(path.join(workspaceRoot, 'repo-worktree'), folders), true);
    assert.equal(isPathCoveredByWorkspaceFolders(path.join(path.sep, 'tmp', 'other'), folders), false);
  });

  if (process.platform === 'win32') {
    it('normalizes WSL-style absolute git output paths on Windows', () => {
      const resolved = resolveGitPathOutput('C:\\repo', '/mnt/c/Projects/Foo');
      assert.equal(resolved, 'C:\\Projects\\Foo');
    });

    it('normalizes /c style absolute git output paths on Windows', () => {
      const resolved = resolveGitPathOutput('C:\\repo', '/c/Projects/Foo');
      assert.equal(resolved, 'C:\\Projects\\Foo');
    });
  } else {
    it('keeps unix absolute git output paths on non-Windows', () => {
      const candidate = '/tmp/worktree';
      assert.equal(resolveGitPathOutput('/tmp/repo', candidate), normalizeFsPath(candidate));
    });
  }
});
