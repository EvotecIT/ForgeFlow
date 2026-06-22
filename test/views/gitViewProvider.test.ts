import { strict as assert } from 'assert';
import type { Project } from '../../src/models/project';
import type { GitRepoStatus } from '../../src/git/gitService';
import { GitViewProvider } from '../../src/views/gitView';

const repoA: Project = {
  id: 'repo-a',
  name: 'Repo A',
  path: '/tmp/repo-a',
  type: 'git',
  tags: [],
  pinnedItems: [],
  entryPointOverrides: []
};

const repoB: Project = {
  id: 'repo-b',
  name: 'Repo B',
  path: '/tmp/repo-b',
  type: 'git',
  tags: [],
  pinnedItems: [],
  entryPointOverrides: []
};

describe('GitViewProvider', () => {
  it('refreshes branch status when the selected project falls back after project-list changes', async () => {
    let projects = [repoA];
    let selectedProjectId: string | undefined;
    const provider = new GitViewProvider(
      { list: () => projects } as never,
      {
        getRepoStatus: async (repoPath: string, repoName: string) => makeStatus(repoPath, repoName)
      } as never,
      {
        getSelectedProjectId: () => selectedProjectId,
        setSelectedProjectId: async (projectId?: string) => {
          selectedProjectId = projectId;
        },
        getProjectSettings: () => undefined,
        setSummary: async () => undefined
      } as never,
      {
        getFilter: () => '',
        setFilter: () => undefined
      } as never,
      {
        error: () => undefined,
        warn: () => undefined
      } as never
    );

    await provider.refresh();

    projects = [repoB];
    await provider.refresh();
    const labels = await collectTreeLabels(provider);

    assert.equal(selectedProjectId, repoB.id);
    assert.equal(labels.includes('Gone Branches'), true);
    assert.equal(labels.includes('repo-b-gone'), true);
    assert.equal(labels.includes('repo-a-gone'), false);
  });
});

function makeStatus(repoPath: string, repoName: string): GitRepoStatus {
  const repoId = repoPath.endsWith('repo-a') ? 'repo-a' : 'repo-b';
  return {
    path: repoPath,
    name: repoName,
    currentBranch: 'main',
    isDetached: false,
    isDirty: false,
    defaultBranch: 'main',
    branches: [
      {
        name: 'main',
        isCurrent: true,
        hasUpstream: true,
        isGone: false,
        isMerged: false,
        isStale: false,
        ahead: 0,
        behind: 0,
        statusLabel: 'current'
      },
      {
        name: `${repoId}-gone`,
        upstream: `origin/${repoId}-gone`,
        track: '[gone]',
        isCurrent: false,
        hasUpstream: true,
        isGone: true,
        isMerged: false,
        isStale: false,
        ahead: 0,
        behind: 0,
        statusLabel: 'gone'
      }
    ]
  };
}

async function collectTreeLabels(provider: GitViewProvider): Promise<string[]> {
  const labels: string[] = [];
  const roots = await provider.getChildren();
  for (const node of roots) {
    const item = provider.getTreeItem(node);
    labels.push(String(item.label));
    const children = await node.getChildren();
    for (const child of children) {
      labels.push(String(provider.getTreeItem(child).label));
    }
  }
  return labels;
}
