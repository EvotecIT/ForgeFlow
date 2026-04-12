import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import type { Project } from '../../src/models/project';
import type { ProjectsStore } from '../../src/store/projectsStore';
import type { DashboardViewProvider } from '../../src/views/dashboardView';
import type { ProjectsViewProvider } from '../../src/views/projectsView';
import { ProjectsWebviewProvider } from '../../src/views/projectsWebview';

describe('ProjectsWebviewProvider', () => {
  it('loads project details on demand before running preset actions', async () => {
    const project: Project = {
      id: 'proj-1',
      name: 'Project One',
      path: '/tmp/project-one',
      type: 'powershell',
      tags: [],
      pinnedItems: [],
      entryPointOverrides: []
    };

    const preset = {
      id: 'preset-1',
      label: 'Build',
      kind: 'powershell' as const,
      filePath: '/tmp/project-one/build.ps1'
    };

    const calls: unknown[][] = [];
    const originalExecuteCommand = vscode.commands.executeCommand;
    vscode.commands.executeCommand = async <T = unknown>(command: string, ...rest: unknown[]): Promise<T> => {
      calls.push([command, ...rest]);
      return undefined as T;
    };

    try {
      const projectsProvider = {
        getWebviewSnapshot: () => ({}),
        getWebviewProjectDetails: async (projectId: string) => ({
          projectId,
          pinnedItems: [],
          entryPoints: [],
          buildScripts: [],
          recentRuns: [],
          runPresets: [preset],
          browseRoot: []
        })
      } as unknown as ProjectsViewProvider;

      const projectsStore = {
        list: () => [project]
      } as unknown as ProjectsStore;

      const provider = new ProjectsWebviewProvider(
        projectsProvider,
        projectsStore,
        {} as DashboardViewProvider
      );

      const internalProvider = provider as unknown as {
        handleProjectAction: (message: { projectId: string; action: string; extra: string }) => Promise<void>;
      };

      await internalProvider.handleProjectAction({
        projectId: project.id,
        action: 'run-preset',
        extra: preset.id
      });

      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.[0], 'forgeflow.projects.runPresetItem');
      assert.equal(calls[0]?.[1], preset);
      assert.equal(calls[0]?.[2], project);
    } finally {
      vscode.commands.executeCommand = originalExecuteCommand;
    }
  });
});
