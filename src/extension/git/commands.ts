import * as vscode from 'vscode';
import type { ProjectsStore } from '../../store/projectsStore';
import type { GitService } from '../../git/gitService';
import type { GitStore } from '../../git/gitStore';
import type { FilterPresetStore } from '../../store/filterPresetStore';
import type { GitViewProvider } from '../../views/gitView';
import type { ProjectsViewProvider } from '../../views/projectsView';
import type { ForgeFlowLogger } from '../../util/log';
import { getForgeFlowSettings } from '../../util/config';
import { openLiveFilterInput, pickFilterPreset, saveFilterPreset, deleteFilterPreset } from '../filters';
import { resolveProjectFromTarget } from '../projectUtils';
import { openProject } from '../projects/actions';
import {
  bulkDeleteGoneBranches,
  bulkDeleteMergedBranches,
  bulkPruneRemotes,
  cleanAllProjects,
  cleanSelectedProject,
  configureGitBranchFilter,
  configureGitBranchSortDirection,
  configureGitBranchSortMode,
  configureGitProjectSettings,
  extractGitBranch,
  extractGitProject,
  getSelectedGitProject,
  previewCleanAllProjects,
  previewCleanProject,
  refreshGitSummaries,
  selectGitProject,
  summarizeProjectWithOverrides
} from './operations';

interface GitCommandContext {
  context: vscode.ExtensionContext;
  projectsStore: ProjectsStore;
  gitService: GitService;
  gitStore: GitStore;
  gitProvider: GitViewProvider;
  projectsProvider: ProjectsViewProvider;
  filterPresetStore: FilterPresetStore;
  logger: ForgeFlowLogger;
}

export function registerGitCommands({
  context,
  projectsStore,
  gitService,
  gitStore,
  gitProvider,
  projectsProvider,
  filterPresetStore,
  logger
}: GitCommandContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('forgeflow.projects.gitClean', async (target?: unknown) => {
      const project = resolveProjectFromTarget(target, projectsStore);
      if (!project) {
        return;
      }
      if (project.type !== 'git') {
        vscode.window.showWarningMessage('ForgeFlow: Git clean is only available for git projects.');
        return;
      }
      await cleanSelectedProject(projectsStore, gitService, gitStore, gitProvider, projectsProvider, logger, project);
    }),
    vscode.commands.registerCommand('forgeflow.git.refresh', async () => {
      await gitProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.git.filter', async () => {
      await openLiveFilterInput({
        title: 'Filter branches',
        value: gitProvider.getFilter(),
        minChars: getForgeFlowSettings().filtersGitMinChars,
        onChange: (value) => gitProvider.setFilter(value)
      });
    }),
    vscode.commands.registerCommand('forgeflow.git.focusFilter', async () => {
      await openLiveFilterInput({
        title: 'Filter branches',
        value: gitProvider.getFilter(),
        minChars: getForgeFlowSettings().filtersGitMinChars,
        onChange: (value) => gitProvider.setFilter(value)
      });
    }),
    vscode.commands.registerCommand('forgeflow.git.saveFilterPreset', async () => {
      await saveFilterPreset('git', gitProvider.getFilter(), filterPresetStore);
    }),
    vscode.commands.registerCommand('forgeflow.git.applyFilterPreset', async () => {
      const preset = await pickFilterPreset('git', filterPresetStore);
      if (!preset) {
        return;
      }
      gitProvider.setFilter(preset.value);
    }),
    vscode.commands.registerCommand('forgeflow.git.deleteFilterPreset', async () => {
      await deleteFilterPreset('git', filterPresetStore);
    }),
    vscode.commands.registerCommand('forgeflow.git.clearFilter', async () => {
      gitProvider.setFilter('');
    }),
    vscode.commands.registerCommand('forgeflow.git.selectProject', async () => {
      await selectGitProject(projectsStore, gitProvider);
    }),
    vscode.commands.registerCommand('forgeflow.git.setBranchSortMode', async () => {
      await configureGitBranchSortMode();
      await gitProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.git.setBranchSortDirection', async () => {
      await configureGitBranchSortDirection();
      await gitProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.git.setBranchFilter', async () => {
      await configureGitBranchFilter();
      await gitProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.git.refreshSummaries', async () => {
      await refreshGitSummaries(projectsStore, gitService, gitStore);
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.git.configureProject', async (target?: unknown) => {
      await configureGitProjectSettings(projectsStore, gitStore, gitProvider, target);
      await gitProvider.refresh();
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.git.clearProjectSettings', async (target?: unknown) => {
      const project = extractGitProject(projectsStore, gitProvider, target);
      if (!project) {
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Clear git overrides for ${project.name}?`,
        { modal: true },
        'Clear'
      );
      if (confirm !== 'Clear') {
        return;
      }
      await gitStore.clearProjectSettings(project.id);
      await gitProvider.refresh();
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.git.bulkPruneRemotes', async () => {
      await bulkPruneRemotes(projectsStore, gitService, gitStore);
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.git.bulkDeleteMerged', async () => {
      await bulkDeleteMergedBranches(projectsStore, gitService, gitStore);
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.git.previewCleanAll', async () => {
      await previewCleanAllProjects(projectsStore, gitService, gitStore, logger);
    }),
    vscode.commands.registerCommand('forgeflow.git.cleanAll', async () => {
      await cleanAllProjects(projectsStore, gitService, gitStore, logger);
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.git.bulkDeleteGone', async () => {
      await bulkDeleteGoneBranches(projectsStore, gitService, gitStore);
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.git.previewCleanProject', async (target?: unknown) => {
      await previewCleanProject(projectsStore, gitService, gitStore, gitProvider, logger, target);
    }),
    vscode.commands.registerCommand('forgeflow.git.cleanProject', async (target?: unknown) => {
      await cleanSelectedProject(projectsStore, gitService, gitStore, gitProvider, projectsProvider, logger, target);
    }),
    vscode.commands.registerCommand('forgeflow.git.openProject', async (target?: unknown) => {
      const project = extractGitProject(projectsStore, gitProvider, target);
      if (project) {
        await openProject(project, projectsStore);
      }
    }),
    vscode.commands.registerCommand('forgeflow.git.checkoutBranch', async (target?: unknown) => {
      const branch = extractGitBranch(target);
      const project = getSelectedGitProject(projectsStore, gitProvider);
      if (!branch || !project) {
        return;
      }
      await gitService.checkoutBranch(project.path, branch);
      await gitProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.git.copyBranchName', async (target?: unknown) => {
      const branch = extractGitBranch(target);
      if (!branch) {
        return;
      }
      await vscode.env.clipboard.writeText(branch);
      vscode.window.setStatusBarMessage(`ForgeFlow: Copied ${branch}`, 2000);
    }),
    vscode.commands.registerCommand('forgeflow.git.deleteBranch', async (target?: unknown) => {
      const branch = extractGitBranch(target);
      const project = getSelectedGitProject(projectsStore, gitProvider);
      if (!branch || !project) {
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Delete branch "${branch}"?`,
        { modal: true },
        'Delete'
      );
      if (confirm !== 'Delete') {
        return;
      }
      await gitService.deleteBranch(project.path, branch, false);
      await gitProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.git.forceDeleteBranch', async (target?: unknown) => {
      const branch = extractGitBranch(target);
      const project = getSelectedGitProject(projectsStore, gitProvider);
      if (!branch || !project) {
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Force delete branch "${branch}"? This cannot be undone.`,
        { modal: true },
        'Force Delete'
      );
      if (confirm !== 'Force Delete') {
        return;
      }
      await gitService.deleteBranch(project.path, branch, true);
      await gitProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.git.pruneRemotes', async () => {
      const project = getSelectedGitProject(projectsStore, gitProvider);
      if (!project) {
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Prune remote tracking branches for "${project.name}"? This removes stale remote refs only.`,
        { modal: true },
        'Prune'
      );
      if (confirm !== 'Prune') {
        return;
      }
      await gitService.pruneRemotes(project.path);
      const summary = await summarizeProjectWithOverrides(project, gitService, gitStore);
      if (summary) {
        await gitStore.setSummary(project.id, summary);
      }
      await gitProvider.refresh();
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.git.deleteGoneBranches', async () => {
      const project = getSelectedGitProject(projectsStore, gitProvider);
      if (!project) {
        return;
      }
      const status = await gitService.getRepoStatus(project.path, project.name, gitStore.getProjectSettings(project.id));
      if (!status) {
        vscode.window.showWarningMessage(`ForgeFlow: Git status unavailable for ${project.name}. See Output > ForgeFlow for details.`);
        return;
      }
      const gone = status.branches.filter((branch) => branch.isGone && !branch.isCurrent).map((branch) => branch.name);
      if (gone.length === 0) {
        vscode.window.showInformationMessage('ForgeFlow: No gone branches found.');
        return;
      }
      const sample = gone.slice(0, 5).join(', ');
      const confirm = await vscode.window.showWarningMessage(
        `Delete ${gone.length} gone branches in ${project.name}?${sample ? ` (${sample}${gone.length > 5 ? ', …' : ''})` : ''}`,
        { modal: true },
        'Delete'
      );
      if (confirm !== 'Delete') {
        return;
      }
      for (const branch of gone) {
        await gitService.deleteBranch(project.path, branch, true);
      }
      const summary = await summarizeProjectWithOverrides(project, gitService, gitStore);
      if (summary) {
        await gitStore.setSummary(project.id, summary);
      }
      await gitProvider.refresh();
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.git.deleteMergedBranches', async () => {
      const project = getSelectedGitProject(projectsStore, gitProvider);
      if (!project) {
        return;
      }
      const status = await gitService.getRepoStatus(project.path, project.name, gitStore.getProjectSettings(project.id));
      if (!status) {
        vscode.window.showWarningMessage(`ForgeFlow: Git status unavailable for ${project.name}. See Output > ForgeFlow for details.`);
        return;
      }
      const merged = status.branches.filter((branch) => branch.isMerged && !branch.isCurrent).map((branch) => branch.name);
      if (merged.length === 0) {
        vscode.window.showInformationMessage('ForgeFlow: No merged branches found.');
        return;
      }
      const sample = merged.slice(0, 5).join(', ');
      const confirm = await vscode.window.showWarningMessage(
        `Delete ${merged.length} merged branches in ${project.name}?${sample ? ` (${sample}${merged.length > 5 ? ', …' : ''})` : ''}`,
        { modal: true },
        'Delete'
      );
      if (confirm !== 'Delete') {
        return;
      }
      for (const branch of merged) {
        await gitService.deleteBranch(project.path, branch, false);
      }
      const summary = await summarizeProjectWithOverrides(project, gitService, gitStore);
      if (summary) {
        await gitStore.setSummary(project.id, summary);
      }
      await gitProvider.refresh();
      await projectsProvider.refresh();
    })
  );
}
