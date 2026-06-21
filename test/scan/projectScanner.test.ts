import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Project } from '../../src/models/project';
import { ProjectScanner } from '../../src/scan/projectScanner';

describe('ProjectScanner', () => {
  it('treats a git-backed scan root with several direct child repositories as a project container', async () => {
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-scan-'));
    try {
      await fs.promises.mkdir(path.join(tempRoot, '.git'), { recursive: true });
      const firstRepo = path.join(tempRoot, 'OfficeIMO');
      const secondRepo = path.join(tempRoot, 'PSPublishModule');
      const thirdRepo = path.join(tempRoot, 'TestimoX');
      await fs.promises.mkdir(path.join(firstRepo, '.git'), { recursive: true });
      await fs.promises.mkdir(path.join(secondRepo, '.git'), { recursive: true });
      await fs.promises.mkdir(path.join(thirdRepo, '.git'), { recursive: true });

      const scanner = new ProjectScanner();
      const projects = await scanner.scan([tempRoot], 2, [] as Project[]);
      const discoveredPaths = projects.map((project) => project.path);

      assert.equal(discoveredPaths.includes(tempRoot), false);
      assert.equal(discoveredPaths.includes(firstRepo), true);
      assert.equal(discoveredPaths.includes(secondRepo), true);
      assert.equal(discoveredPaths.includes(thirdRepo), true);
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('does not split a normal git repository into nested source projects', async () => {
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-scan-'));
    try {
      await fs.promises.mkdir(path.join(tempRoot, '.git'), { recursive: true });
      const nestedProject = path.join(tempRoot, 'src', 'ForgeFlow.Core');
      await fs.promises.mkdir(nestedProject, { recursive: true });
      await fs.promises.writeFile(path.join(nestedProject, 'ForgeFlow.Core.csproj'), '<Project />');

      const scanner = new ProjectScanner();
      const projects = await scanner.scan([tempRoot], 4, [] as Project[]);

      assert.equal(projects.length, 1);
      assert.equal(projects[0]?.path, tempRoot);
      assert.equal(projects[0]?.type, 'git');
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('does not treat direct child project folders as a repository container', async () => {
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-scan-'));
    try {
      await fs.promises.mkdir(path.join(tempRoot, '.git'), { recursive: true });
      for (const name of ['Core', 'Service', 'Tests']) {
        const child = path.join(tempRoot, name);
        await fs.promises.mkdir(child, { recursive: true });
        await fs.promises.writeFile(path.join(child, `${name}.csproj`), '<Project />');
      }

      const scanner = new ProjectScanner();
      const projects = await scanner.scan([tempRoot], 2, [] as Project[]);

      assert.equal(projects.length, 1);
      assert.equal(projects[0]?.path, tempRoot);
      assert.equal(projects[0]?.type, 'git');
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('does not split a git repository for only one or two direct child git repositories', async () => {
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-scan-'));
    try {
      await fs.promises.mkdir(path.join(tempRoot, '.git'), { recursive: true });
      const firstRepo = path.join(tempRoot, 'package-a');
      const secondRepo = path.join(tempRoot, 'package-b');
      await fs.promises.mkdir(path.join(firstRepo, '.git'), { recursive: true });
      await fs.promises.mkdir(path.join(secondRepo, '.git'), { recursive: true });

      const scanner = new ProjectScanner();
      const projects = await scanner.scan([tempRoot], 2, [] as Project[]);

      assert.equal(projects.length, 1);
      assert.equal(projects[0]?.path, tempRoot);
      assert.equal(projects[0]?.type, 'git');
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });

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

  it('skips built-in cleanup folders even when no scan ignores are configured', async () => {
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-scan-'));
    try {
      const mainRepoPath = path.join(tempRoot, 'main-repo');
      await fs.promises.mkdir(path.join(mainRepoPath, '.git'), { recursive: true });

      const cleanupProbePath = path.join(tempRoot, '_cleanup', 'quarantine', '_tmp', 'officeimo-probe');
      await fs.promises.mkdir(cleanupProbePath, { recursive: true });
      await fs.promises.writeFile(path.join(cleanupProbePath, 'officeimo-probe.csproj'), '<Project />');

      const scanner = new ProjectScanner();
      const projects = await scanner.scan([tempRoot], 5, [] as Project[], []);
      const discoveredPaths = projects.map((project) => project.path);

      assert.equal(discoveredPaths.includes(mainRepoPath), true);
      assert.equal(discoveredPaths.includes(cleanupProbePath), false);
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

  it('treats slnx files as solution markers instead of splitting child csproj folders', async () => {
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forgeflow-scan-'));
    try {
      const projectPath = path.join(tempRoot, 'DomainDetectiveNext 1');
      await fs.promises.mkdir(path.join(projectPath, 'DomainDetectiveNext.Core'), { recursive: true });
      await fs.promises.mkdir(path.join(projectPath, 'DomainDetectiveNext.Service'), { recursive: true });
      await fs.promises.mkdir(path.join(projectPath, 'DomainDetectiveNext.Tests'), { recursive: true });
      await fs.promises.writeFile(path.join(projectPath, 'DomainDetectiveNext.slnx'), '<Solution />');
      await fs.promises.writeFile(path.join(projectPath, 'DomainDetectiveNext.Core', 'DomainDetectiveNext.Core.csproj'), '<Project />');
      await fs.promises.writeFile(path.join(projectPath, 'DomainDetectiveNext.Service', 'DomainDetectiveNext.Service.csproj'), '<Project />');
      await fs.promises.writeFile(path.join(projectPath, 'DomainDetectiveNext.Tests', 'DomainDetectiveNext.Tests.csproj'), '<Project />');

      const scanner = new ProjectScanner();
      const projects = await scanner.scan([tempRoot], 3, [] as Project[]);

      assert.equal(projects.length, 1);
      assert.equal(projects[0]?.path, projectPath);
      assert.equal(projects[0]?.type, 'sln');
      assert.equal(projects[0]?.name, 'DomainDetectiveNext 1');
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
