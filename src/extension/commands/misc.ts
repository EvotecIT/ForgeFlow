import * as vscode from 'vscode';
import type { FavoritesStore } from '../../store/favoritesStore';
import type { ProjectsStore } from '../../store/projectsStore';
import type { TagsStore } from '../../store/tagsStore';
import type { RunHistoryStore } from '../../store/runHistoryStore';
import type { GitStore } from '../../git/gitStore';
import type { LayoutStore } from '../../store/layoutStore';
import type { StateStore } from '../../store/stateStore';
import type { DashboardTokenStore } from '../../dashboard/tokenStore';
import { openForgeFlowSelectedViews, runOnboarding } from '../../onboarding/onboarding';
import { getForgeFlowSettings } from '../../util/config';

interface MiscCommandContext {
  context: vscode.ExtensionContext;
  stateStore: StateStore;
  layoutStore: LayoutStore;
  projectsStore: ProjectsStore;
  favoritesStore: FavoritesStore;
  tagsStore: TagsStore;
  runHistoryStore: RunHistoryStore;
  gitStore: GitStore;
  tokenStore: DashboardTokenStore;
}

export function registerMiscCommands({
  context,
  stateStore,
  layoutStore,
  projectsStore,
  favoritesStore,
  tagsStore,
  runHistoryStore,
  gitStore,
  tokenStore
}: MiscCommandContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('forgeflow.layout.toggle', async () => {
      await toggleLayout(layoutStore);
    }),
    vscode.commands.registerCommand('forgeflow.onboarding.start', async () => {
      await runOnboarding(stateStore, context);
    }),
    vscode.commands.registerCommand('forgeflow.views.openSelected', async () => {
      await openForgeFlowSelectedViews(stateStore);
    }),
    vscode.commands.registerCommand('forgeflow.views.resetLocations', async () => {
      await vscode.commands.executeCommand('workbench.action.resetViewLocations');
      await openForgeFlowSelectedViews(stateStore);
      vscode.window.setStatusBarMessage('ForgeFlow: View locations reset.', 3000);
    }),
    vscode.commands.registerCommand('forgeflow.views.openPanelContainer', async () => {
      const options = [
        { label: 'Dashboard — ForgeFlow', containerId: 'forgeflow-panel' },
        { label: 'Files — ForgeFlow', containerId: 'forgeflow-files-panel' },
        { label: 'Projects — ForgeFlow', containerId: 'forgeflow-projects-panel' },
        { label: 'Projects Web — ForgeFlow', containerId: 'forgeflow-projects-web-panel' },
        { label: 'Git — ForgeFlow', containerId: 'forgeflow-git-panel' },
        { label: 'PowerForge — Manager', containerId: 'forgeflow-powerforge-panel' }
      ];
      const picked = await vscode.window.showQuickPick(options, {
        placeHolder: 'Open a ForgeFlow panel view'
      });
      if (!picked) {
        return;
      }
      await vscode.commands.executeCommand(`workbench.view.extension.${picked.containerId}`);
    }),
    vscode.commands.registerCommand('forgeflow.diagnostics.export', async () => {
      await exportDiagnostics(projectsStore, favoritesStore, tagsStore, runHistoryStore, gitStore, tokenStore);
    }),
    vscode.commands.registerCommand('forgeflow.modules.list', async () => {
      vscode.window.showInformationMessage('ForgeFlow: PowerForge engine is not installed yet.');
    }),
    vscode.commands.registerCommand('forgeflow.modules.updateAll', async () => {
      vscode.window.showInformationMessage('ForgeFlow: PowerForge engine is not installed yet.');
    }),
    vscode.commands.registerCommand('forgeflow.modules.cleanup', async () => {
      vscode.window.showInformationMessage('ForgeFlow: PowerForge engine is not installed yet.');
    })
  );
}

async function toggleLayout(layoutStore: LayoutStore): Promise<void> {
  const current = layoutStore.getMode();
  const next = current === 'compact' ? 'expanded' : 'compact';
  await layoutStore.setMode(next);
  await vscode.commands.executeCommand('setContext', 'forgeflow.layout', next);
  vscode.window.setStatusBarMessage(`ForgeFlow layout: ${next}`, 2000);
}

async function exportDiagnostics(
  projectsStore: ProjectsStore,
  favoritesStore: FavoritesStore,
  tagsStore: TagsStore,
  runHistoryStore: RunHistoryStore,
  gitStore: GitStore,
  tokenStore: DashboardTokenStore
): Promise<void> {
  const uri = await vscode.window.showSaveDialog({
    title: 'Export ForgeFlow diagnostics',
    filters: { JSON: ['json'] },
    saveLabel: 'Export'
  });
  if (!uri) {
    return;
  }

  const settings = getForgeFlowSettings();
  const extension = vscode.extensions.getExtension('evotec.forgeflow');
  const workspaceFolders = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
  const tags = tagsStore.getAll();
  const tagProjects = Object.keys(tags).length;
  const tagCount = Object.values(tags).reduce((count, entry) => count + entry.tags.length, 0);
  const [githubToken, gitlabToken, azureToken] = await Promise.all([
    tokenStore.getGitHubToken(),
    tokenStore.getGitLabToken(),
    tokenStore.getAzureDevOpsToken()
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    extension: {
      id: extension?.id,
      version: extension?.packageJSON?.version
    },
    platform: {
      os: process.platform,
      arch: process.arch,
      node: process.version
    },
    workspace: {
      folders: workspaceFolders,
      count: workspaceFolders.length
    },
    counts: {
      projects: projectsStore.list().length,
      favorites: favoritesStore.list().length,
      runHistory: runHistoryStore.list().length,
      tags: tagCount,
      taggedProjects: tagProjects,
      gitSummaries: Object.keys(gitStore.getSummaries()).length
    },
    scanStats: projectsStore.getScanStats(),
    scanLock: (() => {
      const lock = projectsStore.getScanLock();
      if (!lock) {
        return undefined;
      }
      return {
        owner: lock.owner,
        expiresAt: lock.expiresAt,
        active: lock.expiresAt > Date.now()
      };
    })(),
    tokensConfigured: {
      github: Boolean(githubToken),
      gitlab: Boolean(gitlabToken),
      azureDevOps: Boolean(azureToken)
    },
    settings
  };

  const data = new TextEncoder().encode(JSON.stringify(payload, null, 2));
  await vscode.workspace.fs.writeFile(uri, data);
  vscode.window.setStatusBarMessage(`ForgeFlow: Diagnostics exported to ${uri.fsPath}`, 4000);
}
