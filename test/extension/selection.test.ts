import { strict as assert } from 'assert';
import type * as vscode from 'vscode';
import { collectSelectedPaths, collectSelectedProjects } from '../../src/extension/selection';
import type { Project } from '../../src/models/project';
import type { ProjectsStore } from '../../src/store/projectsStore';

function makeView(selection: unknown[], visible = true): vscode.TreeView<unknown> {
  return { selection, visible } as unknown as vscode.TreeView<unknown>;
}

function makeProjectsStore(projects: Project[]): { list: () => Project[] } {
  return {
    list: () => projects
  };
}

describe('collectSelectedPaths', () => {
  it('prefers the target when another view has selection', () => {
    const nodeA = { path: '/tmp/a.txt' };
    const nodeB = { path: '/tmp/b.txt' };
    const filesView = makeView([nodeA], false);
    const filesPanelView = makeView([nodeB], true);

    const result = collectSelectedPaths(nodeB, filesView, filesPanelView);
    assert.deepEqual(result, ['/tmp/b.txt']);
  });

  it('uses the target view selection when target is in selection', () => {
    const nodeA = { path: '/tmp/a.txt' };
    const nodeB = { path: '/tmp/b.txt' };
    const nodeC = { path: '/tmp/c.txt' };
    const filesView = makeView([nodeA], false);
    const filesPanelView = makeView([nodeB, nodeC], true);

    const result = collectSelectedPaths(nodeB, filesView, filesPanelView);
    assert.deepEqual(result, ['/tmp/b.txt', '/tmp/c.txt']);
  });

  it('matches selections by normalized path', () => {
    const nodeA = { path: '/tmp/project/file.txt' };
    const filesView = makeView([nodeA], true);
    const filesPanelView = makeView([], false);

    const result = collectSelectedPaths('/tmp/project/./file.txt', filesView, filesPanelView);
    assert.deepEqual(result, ['/tmp/project/file.txt']);
  });

  it('deduplicates selections by normalized path', () => {
    const nodeA = { path: '/tmp/project/file.txt' };
    const nodeB = { path: '/tmp/project/./file.txt' };
    const filesView = makeView([nodeA, nodeB], true);
    const filesPanelView = makeView([], false);

    const result = collectSelectedPaths(undefined, filesView, filesPanelView);
    assert.deepEqual(result, ['/tmp/project/file.txt']);
  });

  it('prefers explicit forgeflow.files view selection for keyboard commands', () => {
    const nodeA = { path: '/tmp/a.txt' };
    const nodeB = { path: '/tmp/b.txt' };
    const filesView = makeView([nodeA], true);
    const filesPanelView = makeView([nodeB], true);

    const result = collectSelectedPaths({ viewId: 'forgeflow.files' }, filesView, filesPanelView);
    assert.deepEqual(result, ['/tmp/a.txt']);
  });

  it('prefers explicit forgeflow.files.panel view selection for keyboard commands', () => {
    const nodeA = { path: '/tmp/a.txt' };
    const nodeB = { path: '/tmp/b.txt' };
    const filesView = makeView([nodeA], true);
    const filesPanelView = makeView([nodeB], true);

    const result = collectSelectedPaths({ viewId: 'forgeflow.files.panel' }, filesView, filesPanelView);
    assert.deepEqual(result, ['/tmp/b.txt']);
  });

  if (process.platform === 'win32') {
    it('normalizes path casing and separators on Windows', () => {
      const nodeA = { path: 'C:\\Project\\File.txt' };
      const filesView = makeView([nodeA], true);
      const filesPanelView = makeView([], false);

      const result = collectSelectedPaths('c:/project/file.txt', filesView, filesPanelView);
      assert.deepEqual(result, ['C:\\Project\\File.txt']);
    });

    it('normalizes WSL-style /mnt paths on Windows', () => {
      const nodeA = { path: 'C:\\Project\\File.txt' };
      const filesView = makeView([nodeA], true);
      const filesPanelView = makeView([], false);

      const result = collectSelectedPaths('/mnt/c/project/file.txt', filesView, filesPanelView);
      assert.deepEqual(result, ['C:\\Project\\File.txt']);
    });
  }
});

describe('collectSelectedProjects', () => {
  const projectA: Project = {
    id: 'a',
    name: 'Project A',
    path: '/tmp/project-a',
    type: 'git',
    tags: [],
    pinnedItems: [],
    entryPointOverrides: []
  };
  const projectB: Project = {
    id: 'b',
    name: 'Project B',
    path: '/tmp/project-b',
    type: 'git',
    tags: [],
    pinnedItems: [],
    entryPointOverrides: []
  };

  it('prefers explicit projects view selection for keyboard commands', () => {
    const projectsView = makeView([{ project: projectA }], true);
    const projectsPanelView = makeView([{ project: projectB }], true);
    const store = makeProjectsStore([projectA, projectB]);

    const result = collectSelectedProjects(
      { viewId: 'forgeflow.projects' },
      store as ProjectsStore,
      projectsView,
      projectsPanelView
    );
    assert.deepEqual(result.map((project) => project.id), ['a']);
  });

  it('resolves selected project from panel selection', () => {
    const projectsView = makeView([], false);
    const projectsPanelView = makeView([{ project: projectB }], true);
    const store = makeProjectsStore([projectA, projectB]);

    const result = collectSelectedProjects(
      { viewId: 'forgeflow.projects.panel' },
      store as ProjectsStore,
      projectsView,
      projectsPanelView
    );
    assert.deepEqual(result.map((project) => project.id), ['b']);
  });

  it('falls back to path-based project resolution', () => {
    const projectsView = makeView([], true);
    const projectsPanelView = makeView([], false);
    const store = makeProjectsStore([projectA, projectB]);

    const result = collectSelectedProjects(
      '/tmp/project-a/src/file.ps1',
      store as ProjectsStore,
      projectsView,
      projectsPanelView
    );
    assert.deepEqual(result.map((project) => project.id), ['a']);
  });
});
