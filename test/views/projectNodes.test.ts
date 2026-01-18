import { strict as assert } from 'assert';
import { ProjectRecentRunNode, ProjectRunPresetNode } from '../../src/views/projectsView';
import type { Project } from '../../src/models/project';
import type { RunHistoryEntry, RunPreset } from '../../src/models/run';

const project: Project = {
  id: 'proj-1',
  name: 'Project One',
  path: '/tmp/project-one',
  type: 'powershell',
  tags: [],
  pinnedItems: [],
  entryPointOverrides: []
};

describe('Projects view nodes', () => {
  it('builds a run preset node with command and context', () => {
    const preset: RunPreset = {
      id: 'preset-1',
      label: 'Build',
      kind: 'powershell',
      filePath: '/tmp/project-one/build.ps1'
    };
    const node = new ProjectRunPresetNode(project, preset);
    const item = node.getTreeItem();
    assert.equal(item.contextValue, 'forgeflowProjectRunPreset');
    assert.equal(item.command?.command, 'forgeflow.projects.runPresetItem');
    assert.ok(String(item.description).includes('powershell'));
  });

  it('builds a recent run node with command and context', () => {
    const entry: RunHistoryEntry = {
      id: 'run-1',
      kind: 'command',
      label: 'dotnet test',
      timestamp: Date.now(),
      command: 'dotnet test',
      projectId: project.id
    };
    const node = new ProjectRecentRunNode(project, entry);
    const item = node.getTreeItem();
    assert.equal(item.contextValue, 'forgeflowProjectRunHistory');
    assert.equal(item.command?.command, 'forgeflow.projects.runHistoryItem');
    assert.equal(item.label, entry.label);
  });
});
