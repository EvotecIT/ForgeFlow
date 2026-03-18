import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Project } from '../../src/models/project';
import { ProjectScanner } from '../../src/scan/projectScanner';

describe('ProjectScanner', () => {
  it('deduplicates identical project paths discovered from overlapping scan roots', async () => {
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-scan-'));
    try {
      const repoPath = path.join(tempRoot, 'repo');
      await fs.promises.mkdir(path.join(repoPath, '.git'), { recursive: true });

      const scanner = new ProjectScanner();
      const projects = await scanner.scan([tempRoot, repoPath], 3, [] as Project[]);

      assert.equal(projects.length, 1);
      assert.equal(projects[0]?.path, repoPath);
      assert.equal(projects[0]?.type, 'git');
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('skips configured ignored folders during broad root scans', async () => {
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-scan-'));
    try {
      const mainRepoPath = path.join(tempRoot, 'main-repo');
      await fs.promises.mkdir(path.join(mainRepoPath, '.git'), { recursive: true });

      const containerRepoPath = path.join(tempRoot, '_worktree_archives', 'main-repo-feature');
      await fs.promises.mkdir(path.join(containerRepoPath, '.git'), { recursive: true });

      const scanner = new ProjectScanner();
      const projects = await scanner.scan([tempRoot], 4, [] as Project[], ['_worktree_archives']);
      const discoveredPaths = projects.map((project) => project.path);

      assert.equal(discoveredPaths.includes(mainRepoPath), true);
      assert.equal(discoveredPaths.includes(containerRepoPath), false);
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('allows overriding ignored scan folders', async () => {
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-scan-'));
    try {
      const containerRepoPath = path.join(tempRoot, '_worktrees', 'main-repo-feature');
      await fs.promises.mkdir(path.join(containerRepoPath, '.git'), { recursive: true });

      const scanner = new ProjectScanner();
      const projects = await scanner.scan([tempRoot], 4, [] as Project[], []);
      const discoveredPaths = projects.map((project) => project.path);

      assert.equal(discoveredPaths.includes(containerRepoPath), true);
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('skips node_modules regardless of folder casing', async () => {
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-scan-'));
    try {
      const nestedRepoPath = path.join(tempRoot, 'Node_Modules', 'repo');
      await fs.promises.mkdir(path.join(nestedRepoPath, '.git'), { recursive: true });

      const scanner = new ProjectScanner();
      const projects = await scanner.scan([tempRoot], 4, [] as Project[]);
      const discoveredPaths = projects.map((project) => project.path);

      assert.equal(discoveredPaths.includes(nestedRepoPath), false);
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('scans linked worktrees under hidden .worktrees folders', async () => {
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-scan-'));
    try {
      const repoPath = path.join(tempRoot, 'repo');
      await fs.promises.mkdir(path.join(repoPath, '.git'), { recursive: true });

      const hiddenWorktreePath = path.join(repoPath, '.worktrees', 'repo-feature');
      await fs.promises.mkdir(path.join(hiddenWorktreePath, '.git'), { recursive: true });

      const scanner = new ProjectScanner();
      const projects = await scanner.scan([tempRoot], 5, [] as Project[]);
      const discoveredPaths = projects.map((project) => project.path);

      assert.equal(discoveredPaths.includes(repoPath), true);
      assert.equal(discoveredPaths.includes(hiddenWorktreePath), true);
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('detects project markers case-insensitively', async () => {
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-scan-'));
    try {
      const projectPath = path.join(tempRoot, 'App');
      await fs.promises.mkdir(projectPath, { recursive: true });
      await fs.promises.writeFile(path.join(projectPath, 'APP.CSPROJ'), '<Project />');

      const scanner = new ProjectScanner();
      const projects = await scanner.scan([tempRoot], 3, [] as Project[]);

      assert.equal(projects.length, 1);
      assert.equal(projects[0]?.path, projectPath);
      assert.equal(projects[0]?.type, 'csproj');
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
