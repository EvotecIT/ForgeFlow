import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import type { Project } from '../../src/models/project';
import { registerDashboardCommands } from '../../src/extension/dashboard/commands';
import { registerGitCommands } from '../../src/extension/git/commands';

const gitProject: Project = {
  id: 'repo-1',
  name: 'Repo One',
  path: '/tmp/repo-one',
  type: 'git',
  tags: [],
  pinnedItems: [],
  entryPointOverrides: []
};

function createContext(): vscode.ExtensionContext {
  const subscriptions: vscode.Disposable[] = [];
  return { subscriptions } as vscode.ExtensionContext;
}

function disposeContext(context: vscode.ExtensionContext): void {
  for (const subscription of context.subscriptions) {
    subscription.dispose();
  }
}

describe('initial projects readiness for project pickers', () => {
  it('awaits project discovery before opening the Git project picker', async () => {
    const context = createContext();
    const originalQuickPick = vscode.window.showQuickPick;
    let projects: Project[] = [];
    let selectedProjectId: string | undefined;
    let quickPickLabels: string[] = [];
    let ensureCalls = 0;
    const windowAny = vscode.window as unknown as {
      showQuickPick: (items: Array<{ label: string; value: string }>) => Thenable<{ label: string; value: string } | undefined>;
    };
    windowAny.showQuickPick = async (items) => {
      quickPickLabels = items.map((item) => item.label);
      return items[0];
    };

    try {
      registerGitCommands({
        context,
        projectsStore: { list: () => projects },
        gitService: {},
        gitStore: { getProjectSettings: () => undefined },
        gitProvider: {
          getFilter: () => '',
          getSelectedProjectId: () => undefined,
          selectProject: async (projectId: string) => {
            selectedProjectId = projectId;
          }
        },
        projectsProvider: { refresh: async () => undefined },
        filterPresetStore: {},
        logger: { info: () => undefined, show: () => undefined },
        ensureProjectsReady: async () => {
          ensureCalls += 1;
          projects = [gitProject];
        }
      } as unknown as Parameters<typeof registerGitCommands>[0]);

      await vscode.commands.executeCommand('forgeflow.git.selectProject');

      assert.equal(ensureCalls, 1);
      assert.deepEqual(quickPickLabels, ['Repo One']);
      assert.equal(selectedProjectId, 'repo-1');
    } finally {
      windowAny.showQuickPick = originalQuickPick;
      disposeContext(context);
    }
  });

  it('awaits project discovery before configuring dashboard identity', async () => {
    const context = createContext();
    const originalQuickPick = vscode.window.showQuickPick;
    const originalInputBox = vscode.window.showInputBox;
    let projects: Project[] = [];
    let quickPickLabels: string[] = [];
    let ensureCalls = 0;
    const windowAny = vscode.window as unknown as {
      showQuickPick: (items: Array<{ label: string; project?: Project }>) => Thenable<{ label: string; project?: Project } | undefined>;
      showInputBox: () => Thenable<string | undefined>;
    };
    windowAny.showQuickPick = async (items) => {
      quickPickLabels = items.map((item) => item.label);
      return undefined;
    };
    windowAny.showInputBox = async () => undefined;

    try {
      registerDashboardCommands({
        context,
        projectsStore: { list: () => projects },
        dashboardProvider: {
          refresh: async () => undefined,
          focusFilter: async () => undefined,
          applyFilter: async () => undefined,
          setActionsColumnHidden: async () => undefined
        },
        dashboardFilterStore: { getFilter: () => '' },
        filterPresetStore: {},
        tokenStore: {},
        ensureProjectsReady: async () => {
          ensureCalls += 1;
          projects = [gitProject];
        }
      } as unknown as Parameters<typeof registerDashboardCommands>[0]);

      await vscode.commands.executeCommand('forgeflow.dashboard.configureIdentity');

      assert.equal(ensureCalls, 1);
      assert.deepEqual(quickPickLabels, ['Repo One']);
    } finally {
      windowAny.showQuickPick = originalQuickPick;
      windowAny.showInputBox = originalInputBox;
      disposeContext(context);
    }
  });
});
