import * as vscode from 'vscode';
import type { ProjectsStore } from '../../store/projectsStore';
import type { FilterPresetStore } from '../../store/filterPresetStore';
import type { DashboardTokenStore } from '../../dashboard/tokenStore';
import type { DashboardViewProvider } from '../../views/dashboardView';
import type { DashboardFilterStore } from '../../dashboard/filterStore';
import { detectProjectIdentity } from '../../scan/identityDetector';
import { getForgeFlowSettings } from '../../util/config';
import { deleteFilterPreset, pickFilterPreset, saveFilterPreset } from '../filters';

interface DashboardCommandContext {
  context: vscode.ExtensionContext;
  projectsStore: ProjectsStore;
  dashboardProvider: DashboardViewProvider;
  dashboardFilterStore: DashboardFilterStore;
  filterPresetStore: FilterPresetStore;
  tokenStore: DashboardTokenStore;
}

export function registerDashboardCommands({
  context,
  projectsStore,
  dashboardProvider,
  dashboardFilterStore,
  filterPresetStore,
  tokenStore
}: DashboardCommandContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('forgeflow.dashboard.open', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.forgeflow-panel');
      await vscode.commands.executeCommand('workbench.action.openView', 'forgeflow.dashboard');
    }),
    vscode.commands.registerCommand('forgeflow.dashboard.refresh', async () => {
      await dashboardProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.dashboard.focusFilter', async () => {
      await dashboardProvider.focusFilter();
    }),
    vscode.commands.registerCommand('forgeflow.dashboard.saveFilterPreset', async () => {
      await saveFilterPreset('dashboard', dashboardFilterStore.getFilter(), filterPresetStore);
    }),
    vscode.commands.registerCommand('forgeflow.dashboard.applyFilterPreset', async () => {
      const preset = await pickFilterPreset('dashboard', filterPresetStore);
      if (!preset) {
        return;
      }
      await dashboardProvider.applyFilter(preset.value);
    }),
    vscode.commands.registerCommand('forgeflow.dashboard.deleteFilterPreset', async () => {
      await deleteFilterPreset('dashboard', filterPresetStore);
    }),
    vscode.commands.registerCommand('forgeflow.dashboard.configureTokens', async () => {
      await configureDashboardTokens(tokenStore);
      await dashboardProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.dashboard.configureIdentity', async () => {
      await configureProjectIdentity(projectsStore, dashboardProvider);
    }),
    vscode.commands.registerCommand('forgeflow.dashboard.toggleActionsColumn', async () => {
      const settings = getForgeFlowSettings();
      await dashboardProvider.setActionsColumnHidden(!settings.dashboardHideActionsColumn);
    })
  );
}

async function configureProjectIdentity(
  store: ProjectsStore,
  dashboardProvider: DashboardViewProvider
): Promise<void> {
  const projects = store.list();
  if (projects.length === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No projects found to configure.');
    return;
  }
  const pick = await vscode.window.showQuickPick(
    projects.map((project) => ({ label: project.name, description: project.path, project })),
    { placeHolder: 'Select project to configure dashboard identity' }
  );
  if (!pick) {
    return;
  }

  const settings = getForgeFlowSettings();
  const detected = await detectProjectIdentity(pick.project.path, {
    maxDepth: settings.identityScanDepth,
    preferredFolders: settings.identityPreferredFolders
  });
  const detectedIdentity = detected.identity;

  const githubRepo = await vscode.window.showInputBox({
    prompt: 'GitHub repo (owner/name). Leave blank to skip.',
    value: pick.project.identity?.githubRepo ?? detectedIdentity?.githubRepo ?? ''
  });

  if (githubRepo === undefined) {
    return;
  }

  const powershellModule = await vscode.window.showInputBox({
    prompt: 'PowerShell Gallery module name. Leave blank to skip.',
    value: pick.project.identity?.powershellModule ?? detectedIdentity?.powershellModule ?? ''
  });

  if (powershellModule === undefined) {
    return;
  }

  const nugetPackage = await vscode.window.showInputBox({
    prompt: 'NuGet package name. Leave blank to skip.',
    value: pick.project.identity?.nugetPackage ?? detectedIdentity?.nugetPackage ?? ''
  });

  if (nugetPackage === undefined) {
    return;
  }

  await store.updateIdentity(pick.project.id, {
    githubRepo: githubRepo || undefined,
    powershellModule: powershellModule || undefined,
    nugetPackage: nugetPackage || undefined
  });

  await dashboardProvider.refresh();
}

async function configureDashboardTokens(tokenStore: DashboardTokenStore): Promise<void> {
  const options = [
    {
      label: 'GitHub Personal Access Token',
      description: 'Optional fallback when VS Code GitHub auth is unavailable.',
      key: 'github'
    },
    {
      label: 'GitLab Personal Access Token',
      description: 'Used for private GitLab repos and higher API limits.',
      key: 'gitlab'
    },
    {
      label: 'Azure DevOps Personal Access Token',
      description: 'Used for Azure DevOps repo metadata and PR counts.',
      key: 'azure'
    }
  ] as const;

  const pick = await vscode.window.showQuickPick(options, {
    placeHolder: 'Select token to configure'
  });
  if (!pick) {
    return;
  }

  const prompt = `Enter ${pick.label} (leave empty to clear).`;
  const value = await vscode.window.showInputBox({
    prompt,
    password: true,
    ignoreFocusOut: true
  });

  if (value === undefined) {
    return;
  }

  const token = value.trim();
  if (pick.key === 'github') {
    await tokenStore.setGitHubToken(token.length > 0 ? token : undefined);
  } else if (pick.key === 'gitlab') {
    await tokenStore.setGitLabToken(token.length > 0 ? token : undefined);
  } else {
    await tokenStore.setAzureDevOpsToken(token.length > 0 ? token : undefined);
  }

  const status = token.length > 0 ? 'saved' : 'cleared';
  vscode.window.showInformationMessage(`ForgeFlow: ${pick.label} ${status}.`);
}
