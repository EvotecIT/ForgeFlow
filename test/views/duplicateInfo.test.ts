import { strict as assert } from 'assert';
import type { Project } from '../../src/models/project';
import type { ProjectsStore } from '../../src/store/projectsStore';
import { buildDuplicateInfoFromStore } from '../../src/views/projects/providerInternals';
import { buildDuplicateInfo, getWorktreeSiblingProjects } from '../../src/views/projects/helpers';

function createProject(params: {
  id: string;
  name: string;
  path: string;
  type: Project['type'];
  repositoryUrl?: string;
}): Project {
  return {
    id: params.id,
    name: params.name,
    path: params.path,
    type: params.type,
    tags: [],
    pinnedItems: [],
    entryPointOverrides: [],
    identity: params.repositoryUrl ? { repositoryUrl: params.repositoryUrl } : undefined
  };
}

describe('buildDuplicateInfo', () => {
  it('groups linked git worktrees by common git dir before repository identity', () => {
    const repositoryUrl = 'https://github.com/example/repo.git';
    const main = createProject({
      id: 'main',
      name: 'repo',
      path: '/repos/repo',
      type: 'git',
      repositoryUrl
    });
    const worktree = createProject({
      id: 'wt',
      name: 'repo-feature',
      path: '/repos/_worktrees/repo-feature',
      type: 'git',
      repositoryUrl
    });
    const clone = createProject({
      id: 'clone',
      name: 'repo-clone',
      path: '/repos/repo-clone',
      type: 'git',
      repositoryUrl
    });

    const info = buildDuplicateInfo([main, worktree, clone], {
      gitCommonDirs: new Map([
        [main.id, '/repos/repo/.git'],
        [worktree.id, '/repos/repo/.git'],
        [clone.id, '/repos/repo-clone/.git']
      ])
    });

    assert.equal(info.size, 2);
    assert.equal(info.get(main.id)?.total, 2);
    assert.equal(info.get(worktree.id)?.total, 2);
    assert.equal(info.get(main.id)?.peerPath, worktree.path);
    assert.equal(info.get(worktree.id)?.peerPath, main.path);
    assert.equal(info.get(clone.id), undefined);
  });

  it('falls back to repository identity when git common-dir data is unavailable', () => {
    const repositoryUrl = 'https://github.com/example/repo.git';
    const projects = [
      createProject({ id: 'a', name: 'repo', path: '/repos/repo', type: 'git', repositoryUrl }),
      createProject({ id: 'b', name: 'repo-feature', path: '/repos/_worktrees/repo-feature', type: 'git', repositoryUrl }),
      createProject({ id: 'c', name: 'repo-clone', path: '/repos/repo-clone', type: 'git', repositoryUrl })
    ];

    const info = buildDuplicateInfo(projects);

    assert.equal(info.size, 3);
    assert.equal(info.get('a')?.total, 3);
    assert.equal(info.get('b')?.total, 3);
    assert.equal(info.get('c')?.total, 3);
    assert.ok(info.get('a')?.peerPath);
    assert.ok(info.get('b')?.peerPath);
    assert.ok(info.get('c')?.peerPath);
  });

  it('only exposes worktree siblings for git-common duplicate groups', () => {
    const repositoryUrl = 'https://github.com/example/repo.git';
    const main = createProject({ id: 'a', name: 'repo', path: '/repos/repo', type: 'git', repositoryUrl });
    const cloneInWorktreeFolder = createProject({
      id: 'b',
      name: 'repo-clone',
      path: '/repos/_worktrees/repo-clone',
      type: 'git',
      repositoryUrl
    });
    const duplicateInfo = buildDuplicateInfo([main, cloneInWorktreeFolder]);

    const siblings = getWorktreeSiblingProjects(
      [main, cloneInWorktreeFolder],
      main,
      duplicateInfo,
      new Map([
        [main.id, false],
        [cloneInWorktreeFolder.id, false]
      ])
    );

    assert.deepEqual(siblings, []);
  });

  it('prefers the live project list when building duplicate info from store state', () => {
    const repositoryUrl = 'https://github.com/example/repo.git';
    const main = createProject({ id: 'main', name: 'repo', path: '/repos/repo', type: 'git', repositoryUrl });
    const worktree = createProject({
      id: 'wt',
      name: 'repo-feature',
      path: '/repos/_worktrees/repo-feature',
      type: 'git',
      repositoryUrl
    });
    const staleClone = createProject({
      id: 'stale',
      name: 'repo-clone',
      path: '/repos/repo-clone',
      type: 'git',
      repositoryUrl
    });

    const store = {
      list: () => [staleClone]
    } as Pick<ProjectsStore, 'list'> as ProjectsStore;

    const info = buildDuplicateInfoFromStore(store, [main, worktree], {
      gitCommonDirs: new Map([
        [main.id, '/repos/repo/.git'],
        [worktree.id, '/repos/repo/.git']
      ])
    });

    assert.equal(info.size, 2);
    assert.equal(info.get(main.id)?.total, 2);
    assert.equal(info.get(worktree.id)?.total, 2);
    assert.equal(info.get(staleClone.id), undefined);
  });
});
