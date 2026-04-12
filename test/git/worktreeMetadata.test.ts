import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  deriveGitDirInfo,
  normalizeGitCommonDir,
  parseGitDirDirective,
  readProjectGitWorktreeMetadata
} from '../../src/git/worktreeMetadata';

describe('worktree metadata', () => {
  it('parses gitdir directives from .git text', () => {
    const value = parseGitDirDirective('gitdir: ../repo/.git/worktrees/feature');
    assert.equal(value, '../repo/.git/worktrees/feature');
  });

  it('derives common dir and worktree flag from gitdir path', () => {
    const info = deriveGitDirInfo('/tmp/repo/.git/worktrees/feature');
    assert.equal(info.isWorktree, true);
    assert.equal(info.commonDir, normalizeGitCommonDir('/tmp/repo/.git'));
  });

  it('reports non-worktree gitdir paths', () => {
    const info = deriveGitDirInfo('/tmp/repo/.git');
    assert.equal(info.isWorktree, false);
    assert.equal(info.commonDir, normalizeGitCommonDir('/tmp/repo/.git'));
  });

  it('reads linked worktree metadata from .git file', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-worktree-meta-'));
    try {
      const worktreePath = path.join(root, 'feature-worktree');
      await fs.promises.mkdir(worktreePath, { recursive: true });
      const dotGitPath = path.join(worktreePath, '.git');
      await fs.promises.writeFile(dotGitPath, 'gitdir: ../repo/.git/worktrees/feature');

      const metadata = await readProjectGitWorktreeMetadata(worktreePath);
      assert.equal(metadata.dotGitKind, 'file');
      assert.equal(metadata.hasGitDir, true);
      assert.equal(metadata.isWorktree, true);
      assert.equal(metadata.commonDir, normalizeGitCommonDir(path.join(root, 'repo', '.git')));
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });

  it('reads standard repo metadata from .git directory', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-worktree-meta-'));
    try {
      const repoPath = path.join(root, 'repo');
      const dotGitPath = path.join(repoPath, '.git');
      await fs.promises.mkdir(dotGitPath, { recursive: true });

      const metadata = await readProjectGitWorktreeMetadata(repoPath);
      assert.equal(metadata.dotGitKind, 'directory');
      assert.equal(metadata.hasGitDir, true);
      assert.equal(metadata.isWorktree, false);
      assert.equal(metadata.commonDir, normalizeGitCommonDir(dotGitPath));
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });
});
