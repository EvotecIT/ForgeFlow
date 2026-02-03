import * as vscode from 'vscode';
import type { FavoritesStore } from '../../store/favoritesStore';
import type { ProjectsStore } from '../../store/projectsStore';
import type { RunHistoryStore } from '../../store/runHistoryStore';
import type { RunService } from '../../run/runService';
import type { FilesViewProvider } from '../../views/filesView';
import type { ProjectsViewProvider } from '../../views/projectsView';
import { getForgeFlowSettings } from '../../util/config';
import { statPath } from '../../util/fs';
import { extractEntry, extractHistoryEntry, extractPath, extractPreset, extractProject, isProjectHistory, isProjectPreset } from '../selection';
import { findProjectByPath, pickProject, resolveProjectFromTarget } from '../projectUtils';
import { runProjectEntryPoint, runPath, runTaskEntryPoint } from './execution';
import { confirmRunHistoryClick, runFromHistory, runHistoryEntry, runLastHistoryEntry, runProjectHistory } from './history';
import {
  deletePresetItem,
  deleteProjectPreset,
  runPresetItem,
  runProjectPreset,
  saveProjectHistoryAsPreset,
  saveProjectHistoryAsPresets,
  saveRunPresetFromEntry,
  saveRunPresetFromHistory
} from './presets';
import { chooseProfileId, createCustomProfile, managePowerShellProfiles, pickExternalSessionTarget } from './profiles';

interface RunCommandContext {
  context: vscode.ExtensionContext;
  filesProvider: FilesViewProvider;
  projectsProvider: ProjectsViewProvider;
  projectsStore: ProjectsStore;
  favoritesStore: FavoritesStore;
  runHistoryStore: RunHistoryStore;
  runService: RunService;
}

export function registerRunCommands({
  context,
  filesProvider,
  projectsProvider,
  projectsStore,
  favoritesStore,
  runHistoryStore,
  runService
}: RunCommandContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('forgeflow.projects.run', async (target?: unknown) => {
      const project = resolveProjectFromTarget(target, projectsStore);
      if (!project) {
        return;
      }
      await runProjectEntryPoint(project, projectsProvider, runService, projectsStore, favoritesStore, runHistoryStore);
    }),
    vscode.commands.registerCommand('forgeflow.run', async (target?: unknown) => {
      const filePath = extractPath(target);
      await runPath(filePath, runService, projectsStore, favoritesStore, runHistoryStore, undefined);
    }),
    vscode.commands.registerCommand('forgeflow.run.chooseProfile', async (target?: unknown) => {
      const profileId = await chooseProfileId();
      if (!profileId) {
        return;
      }
      const filePath = extractPath(target);
      await runPath(filePath, runService, projectsStore, favoritesStore, runHistoryStore, undefined, profileId);
    }),
    vscode.commands.registerCommand('forgeflow.run.setDefaultProfile', async () => {
      const profileId = await chooseProfileId(true);
      if (profileId === undefined) {
        return;
      }
      const config = vscode.workspace.getConfiguration('forgeflow');
      await config.update('powershell.defaultProfileId', profileId ?? undefined, vscode.ConfigurationTarget.Global);
      const label = profileId ? 'Default profile updated.' : 'Default profile cleared.';
      vscode.window.setStatusBarMessage(`ForgeFlow: ${label}`, 3000);
    }),
    vscode.commands.registerCommand('forgeflow.powershell.addProfile', async () => {
      await createCustomProfile();
    }),
    vscode.commands.registerCommand('forgeflow.powershell.manageProfiles', async () => {
      await managePowerShellProfiles();
    }),
    vscode.commands.registerCommand('forgeflow.run.setProjectProfile', async (target?: unknown) => {
      const project = extractProject(target);
      if (!project) {
        return;
      }
      const profileId = await chooseProfileId(true);
      if (profileId === undefined) {
        return;
      }
      await projectsStore.updatePreferredProfile(project.id, profileId ?? undefined);
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.run.clearProjectProfile', async (target?: unknown) => {
      const project = extractProject(target);
      if (!project) {
        return;
      }
      await projectsStore.updatePreferredProfile(project.id, undefined);
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.run.setFavoriteProfile', async (target?: unknown) => {
      const filePath = extractPath(target);
      if (!filePath) {
        return;
      }
      const profileId = await chooseProfileId(true);
      if (profileId === undefined) {
        return;
      }
      await favoritesStore.updateProfileOverride(filePath, profileId ?? undefined);
      filesProvider.refresh();
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.run.clearFavoriteProfile', async (target?: unknown) => {
      const filePath = extractPath(target);
      if (!filePath) {
        return;
      }
      await favoritesStore.updateProfileOverride(filePath, undefined);
      filesProvider.refresh();
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.run.integrated', async (target?: unknown) => {
      const filePath = extractPath(target);
      await runPath(filePath, runService, projectsStore, favoritesStore, runHistoryStore, 'integrated');
    }),
    vscode.commands.registerCommand('forgeflow.run.integrated.keepOpenAlways', async (target?: unknown) => {
      const filePath = extractPath(target);
      await runPath(filePath, runService, projectsStore, favoritesStore, runHistoryStore, 'integrated', undefined, 'always');
    }),
    vscode.commands.registerCommand('forgeflow.run.integrated.keepOpenOnError', async (target?: unknown) => {
      const filePath = extractPath(target);
      await runPath(filePath, runService, projectsStore, favoritesStore, runHistoryStore, 'integrated', undefined, 'onError');
    }),
    vscode.commands.registerCommand('forgeflow.run.external', async (target?: unknown) => {
      const filePath = extractPath(target);
      await runPath(filePath, runService, projectsStore, favoritesStore, runHistoryStore, 'external');
    }),
    vscode.commands.registerCommand('forgeflow.run.external.chooseProfile', async (target?: unknown) => {
      const profileId = await chooseProfileId();
      if (!profileId) {
        return;
      }
      const filePath = extractPath(target);
      await runPath(filePath, runService, projectsStore, favoritesStore, runHistoryStore, 'external', profileId);
    }),
    vscode.commands.registerCommand('forgeflow.run.externalAdmin', async (target?: unknown) => {
      const filePath = extractPath(target);
      await runPath(filePath, runService, projectsStore, favoritesStore, runHistoryStore, 'externalAdmin');
    }),
    vscode.commands.registerCommand('forgeflow.run.externalAdmin.chooseProfile', async (target?: unknown) => {
      const profileId = await chooseProfileId();
      if (!profileId) {
        return;
      }
      const filePath = extractPath(target);
      await runPath(filePath, runService, projectsStore, favoritesStore, runHistoryStore, 'externalAdmin', profileId);
    }),
    vscode.commands.registerCommand('forgeflow.run.last', async () => {
      await runLastHistoryEntry(runHistoryStore, runService, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.run.history', async () => {
      await runFromHistory(runHistoryStore, runService, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.run.clearHistory', async () => {
      const confirm = await vscode.window.showWarningMessage(
        'ForgeFlow: Clear all run history?',
        { modal: true },
        'Clear'
      );
      if (confirm !== 'Clear') {
        return;
      }
      await runHistoryStore.clear();
      vscode.window.setStatusBarMessage('ForgeFlow: Run history cleared.', 2000);
    }),
    vscode.commands.registerCommand('forgeflow.run.savePreset', async () => {
      await saveRunPresetFromHistory(runHistoryStore, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.run.resetExternalSession', async () => {
      const target = await pickExternalSessionTarget();
      if (!target) {
        return;
      }
      const count = runService.resetExternalSession(target.profileId);
      if (count === 0) {
        vscode.window.showWarningMessage('ForgeFlow: No external sessions to reset.');
        return;
      }
      const label = target.profileId ? `profile ${target.label ?? target.profileId}` : 'all profiles';
      vscode.window.setStatusBarMessage(`ForgeFlow: Reset external session (${label}).`, 3000);
    }),
    vscode.commands.registerCommand('forgeflow.projects.runPreset', async (target?: unknown) => {
      const project = resolveProjectFromTarget(target, projectsStore);
      if (!project) {
        return;
      }
      await runProjectPreset(project, runService, runHistoryStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.runPresetItem', async (target?: unknown, projectTarget?: unknown) => {
      const preset = extractPreset(target);
      const project = extractProject(projectTarget) ?? (isProjectPreset(target) ? target.project : undefined);
      if (!preset || !project) {
        return;
      }
      await runPresetItem(preset, project, runService, runHistoryStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.deletePresetItem', async (target?: unknown, projectTarget?: unknown) => {
      const preset = extractPreset(target);
      const project = extractProject(projectTarget) ?? (isProjectPreset(target) ? target.project : undefined);
      if (!preset || !project) {
        return;
      }
      await deletePresetItem(project, preset, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.runHistoryItem', async (target?: unknown, projectTarget?: unknown) => {
      const entry = extractHistoryEntry(target);
      const project = extractProject(projectTarget) ?? (isProjectHistory(target) ? target.project : undefined);
      if (!entry) {
        return;
      }
      const entryWithProject = project && !entry.projectId ? { ...entry, projectId: project.id } : entry;
      if (getForgeFlowSettings().runHistoryClickAction === 'confirm') {
        const confirmed = await confirmRunHistoryClick(entryWithProject, project);
        if (!confirmed) {
          return;
        }
      }
      await runHistoryEntry(entryWithProject, runHistoryStore, runService, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.deleteHistoryItem', async (target?: unknown) => {
      const entry = extractHistoryEntry(target);
      if (!entry) {
        return;
      }
      await runHistoryStore.remove(entry.id);
      vscode.window.setStatusBarMessage(`ForgeFlow: Removed "${entry.label}" from run history.`, 3000);
    }),
    vscode.commands.registerCommand('forgeflow.projects.clearHistoryForProject', async (target?: unknown) => {
      const project = resolveProjectFromTarget(target, projectsStore);
      if (!project) {
        return;
      }
      await runHistoryStore.clearForProject(project.id);
      vscode.window.setStatusBarMessage(`ForgeFlow: Cleared recent runs for ${project.name}.`, 3000);
    }),
    vscode.commands.registerCommand('forgeflow.projects.runHistoryForProject', async (target?: unknown) => {
      const project = resolveProjectFromTarget(target, projectsStore);
      if (!project) {
        return;
      }
      await runProjectHistory(project, runHistoryStore, runService, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.runHistoryFromRoot', async () => {
      const project = await pickProject(projectsStore.list(), 'Select a project to run recent history');
      if (!project) {
        return;
      }
      await runProjectHistory(project, runHistoryStore, runService, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.saveHistoryForProjectAsPreset', async (target?: unknown) => {
      const project = resolveProjectFromTarget(target, projectsStore);
      if (!project) {
        return;
      }
      await saveProjectHistoryAsPreset(project, runHistoryStore, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.saveHistoryForProjectAsPresets', async (target?: unknown) => {
      const project = resolveProjectFromTarget(target, projectsStore);
      if (!project) {
        return;
      }
      await saveProjectHistoryAsPresets(project, runHistoryStore, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.saveHistoryItemAsPreset', async (target?: unknown, projectTarget?: unknown) => {
      const entry = extractHistoryEntry(target);
      const project = extractProject(projectTarget) ?? (isProjectHistory(target) ? target.project : undefined);
      if (!entry) {
        return;
      }
      const entryWithProject = project && !entry.projectId ? { ...entry, projectId: project.id } : entry;
      await saveRunPresetFromEntry(entryWithProject, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.projects.deletePreset', async (target?: unknown) => {
      const project = resolveProjectFromTarget(target, projectsStore);
      if (!project) {
        return;
      }
      await deleteProjectPreset(project, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.run.setProjectTarget', async (target?: unknown) => {
      const project = resolveProjectFromTarget(target, projectsStore);
      if (!project) {
        return;
      }
      await configureProjectRunTarget(project, projectsStore, projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.run.clearProjectTarget', async (target?: unknown) => {
      const project = resolveProjectFromTarget(target, projectsStore);
      if (!project) {
        return;
      }
      await projectsStore.updatePreferredRunTarget(project.id, undefined);
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.run.setProjectWorkingDirectory', async (target?: unknown) => {
      const project = resolveProjectFromTarget(target, projectsStore);
      if (!project) {
        return;
      }
      await configureProjectWorkingDirectory(project, projectsStore, projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.run.setProjectKeepOpen', async (target?: unknown) => {
      const project = resolveProjectFromTarget(target, projectsStore);
      if (!project) {
        return;
      }
      await configureProjectRunKeepOpen(project, projectsStore, projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.run.clearProjectKeepOpen', async (target?: unknown) => {
      const project = resolveProjectFromTarget(target, projectsStore);
      if (!project) {
        return;
      }
      await projectsStore.updatePreferredRunKeepOpen(project.id, undefined);
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.run.clearProjectWorkingDirectory', async (target?: unknown) => {
      const project = resolveProjectFromTarget(target, projectsStore);
      if (!project) {
        return;
      }
      await projectsStore.updatePreferredRunWorkingDirectory(project.id, undefined);
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.projects.runTask', async (entry?: unknown, target?: unknown) => {
      const taskEntry = extractEntry(entry);
      let project = resolveProjectFromTarget(target, projectsStore);
      if (!project && taskEntry?.path) {
        project = findProjectByPath(projectsStore.list(), taskEntry.path);
      }
      if (!taskEntry || !project) {
        return;
      }
      await runTaskEntryPoint(taskEntry, project, runHistoryStore);
    })
  );
}

async function configureProjectRunTarget(
  project: { id: string; name: string; preferredRunTarget?: 'integrated' | 'external' | 'externalAdmin' },
  projectsStore: ProjectsStore,
  projectsProvider: ProjectsViewProvider
): Promise<void> {
  const options: Array<{ label: string; value: 'integrated' | 'external' | 'externalAdmin'; description?: string }> = [
    { label: 'Integrated', value: 'integrated' },
    { label: 'External', value: 'external' },
    { label: 'External (Admin)', value: 'externalAdmin', description: 'Windows only' }
  ];
  const pick = await vscode.window.showQuickPick(
    options.map((option) => ({ ...option, picked: option.value === project.preferredRunTarget })),
    { placeHolder: `Select run target for ${project.name}` }
  );
  if (!pick) {
    return;
  }
  await projectsStore.updatePreferredRunTarget(project.id, pick.value);
  await projectsProvider.refresh();
}

async function configureProjectWorkingDirectory(
  project: { id: string; name: string; path: string; preferredRunWorkingDirectory?: string },
  projectsStore: ProjectsStore,
  projectsProvider: ProjectsViewProvider
): Promise<void> {
  const pick = await vscode.window.showInputBox({
    prompt: `Preferred working directory for ${project.name}`,
    value: project.preferredRunWorkingDirectory ?? project.path,
    placeHolder: 'Leave empty to clear'
  });
  if (pick === undefined) {
    return;
  }
  const trimmed = pick.trim();
  if (trimmed) {
    const stat = await statPath(trimmed);
    if (!stat || stat.type !== vscode.FileType.Directory) {
      vscode.window.showWarningMessage('ForgeFlow: Working directory does not exist.');
      return;
    }
  }
  await projectsStore.updatePreferredRunWorkingDirectory(project.id, trimmed || undefined);
  await projectsProvider.refresh();
}

async function configureProjectRunKeepOpen(
  project: { id: string; name: string; preferredRunKeepOpen?: 'never' | 'onError' | 'always' },
  projectsStore: ProjectsStore,
  projectsProvider: ProjectsViewProvider
): Promise<void> {
  const options: Array<{ label: string; value: 'never' | 'onError' | 'always'; description?: string }> = [
    { label: 'Never', value: 'never', description: 'Close immediately after run' },
    { label: 'On Error', value: 'onError', description: 'Pause only if exit code or error' },
    { label: 'Always', value: 'always', description: 'Always pause after run' }
  ];
  const pick = await vscode.window.showQuickPick(
    options.map((option) => ({ ...option, picked: option.value === project.preferredRunKeepOpen })),
    { placeHolder: `Select keep-open behavior for ${project.name}` }
  );
  if (!pick) {
    return;
  }
  await projectsStore.updatePreferredRunKeepOpen(project.id, pick.value);
  await projectsProvider.refresh();
}
