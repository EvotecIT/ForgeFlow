import * as vscode from 'vscode';
import type { Project } from '../../models/project';
import type { GitProjectSummary } from '../../git/gitSummary';
import type { GitService } from '../../git/gitService';
import type { GitStore, GitProjectSettings } from '../../git/gitStore';
import type { ProjectsStore } from '../../store/projectsStore';
import type { GitViewProvider } from '../../views/gitView';
import type { ProjectsViewProvider } from '../../views/projectsView';
import type { ForgeFlowLogger } from '../../util/log';
import { buildProjectSummary } from '../../git/gitSummary';
import { getForgeFlowSettings, type SortDirection } from '../../util/config';
import { extractProject } from '../selection';
import { isGitBranchNode, isGitProjectNode } from '../../views/gitView';

export async function configureGitBranchSortMode(): Promise<void> {
  const settings = getForgeFlowSettings();
  const options: Array<{ label: string; value: 'name' | 'lastCommit' | 'age' | 'status' }> = [
    { label: 'Name', value: 'name' },
    { label: 'Last Commit Time', value: 'lastCommit' },
    { label: 'Age (days)', value: 'age' },
    { label: 'Status', value: 'status' }
  ];
  const pick = await vscode.window.showQuickPick(
    options.map((option) => ({ ...option, picked: option.value === settings.gitBranchSortMode })),
    { placeHolder: 'Select git branch sort mode' }
  );
  if (!pick) {
    return;
  }
  const config = vscode.workspace.getConfiguration('forgeflow');
  await config.update('git.branchSortMode', pick.value, vscode.ConfigurationTarget.Global);
}

export async function configureGitBranchSortDirection(): Promise<void> {
  const settings = getForgeFlowSettings();
  const options: Array<{ label: string; value: SortDirection }> = [
    { label: 'Ascending', value: 'asc' },
    { label: 'Descending', value: 'desc' }
  ];
  const pick = await vscode.window.showQuickPick(
    options.map((option) => ({ ...option, picked: option.value === settings.gitBranchSortDirection })),
    { placeHolder: 'Select git branch sort direction' }
  );
  if (!pick) {
    return;
  }
  const config = vscode.workspace.getConfiguration('forgeflow');
  await config.update('git.branchSortDirection', pick.value, vscode.ConfigurationTarget.Global);
}

export async function configureGitBranchFilter(): Promise<void> {
  const settings = getForgeFlowSettings();
  const options: Array<{ label: string; value: string; description?: string }> = [
    { label: 'All Branches', value: 'all' },
    { label: 'Actionable Only', value: 'actionable', description: 'Hide clean branches' },
    { label: 'Gone Only', value: 'gone' },
    { label: 'Merged Only', value: 'merged' },
    { label: 'Stale Only', value: 'stale' },
    { label: 'No Upstream Only', value: 'noUpstream' },
    { label: 'Ahead/Behind Only', value: 'aheadBehind' }
  ];
  const pick = await vscode.window.showQuickPick(
    options.map((option) => ({ ...option, picked: option.value === settings.gitBranchFilter })),
    { placeHolder: 'Select git branch filter' }
  );
  if (!pick) {
    return;
  }
  const config = vscode.workspace.getConfiguration('forgeflow');
  await config.update('git.branchFilter', pick.value, vscode.ConfigurationTarget.Global);
}

export async function refreshGitSummaries(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore
): Promise<void> {
  const projects = projectsStore.list().filter((project) => project.type === 'git');
  if (projects.length === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No git projects available.');
    return;
  }
  const summaries: Record<string, GitProjectSummary> = {};
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'ForgeFlow: Refreshing git summaries',
      cancellable: true
    },
    async (progress, token) => {
      const total = projects.length;
      let index = 0;
      for (const project of projects) {
        if (token.isCancellationRequested) {
          break;
        }
        index += 1;
        progress.report({ message: `${project.name} (${index}/${total})`, increment: (100 / total) });
        const summary = await summarizeProjectWithOverrides(project, gitService, gitStore);
        if (summary) {
          summaries[project.id] = summary;
        }
      }
    }
  );
  await gitStore.setSummaries(summaries);
}

export async function summarizeProjectWithOverrides(
  project: Project,
  gitService: GitService,
  gitStore: GitStore
): Promise<GitProjectSummary | undefined> {
  const overrides = gitStore.getProjectSettings(project.id);
  const status = await gitService.getRepoStatus(project.path, project.name, overrides);
  if (!status) {
    return undefined;
  }
  return buildProjectSummary(status);
}

export async function configureGitProjectSettings(
  projectsStore: ProjectsStore,
  gitStore: GitStore,
  provider: GitViewProvider,
  target?: unknown
): Promise<void> {
  const projects = projectsStore.list().filter((project) => project.type === 'git');
  if (projects.length === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No git projects available.');
    return;
  }
  const selected = extractGitProject(projectsStore, provider, target);
  const pickedId = selected
    ? selected.id
    : (await vscode.window.showQuickPick(
      projects.map((project) => ({ label: project.name, description: project.path, value: project.id })),
      { placeHolder: 'Select git project to configure' }
    ))?.value;
  if (!pickedId) {
    return;
  }
  const current = gitStore.getProjectSettings(pickedId);
  const staleInput = await vscode.window.showInputBox({
    prompt: 'Stale days override (blank to keep global)',
    value: current?.staleDays !== undefined ? String(current.staleDays) : ''
  });
  if (staleInput === undefined) {
    return;
  }
  const staleDays = staleInput.trim().length > 0 ? Number(staleInput) : undefined;
  if (staleDays !== undefined && (!Number.isFinite(staleDays) || staleDays < 0)) {
    vscode.window.showWarningMessage('ForgeFlow: Stale days must be a non-negative number.');
    return;
  }
  const defaultBranchInput = await vscode.window.showInputBox({
    prompt: 'Default branch override (blank to keep global)',
    value: current?.defaultBranch ?? ''
  });
  if (defaultBranchInput === undefined) {
    return;
  }
  const defaultBranch = defaultBranchInput.trim() || undefined;
  const settings: GitProjectSettings = {
    staleDays,
    defaultBranch
  };
  await gitStore.setProjectSettings(pickedId, settings);
}

export async function cleanSelectedProject(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore,
  gitProvider: GitViewProvider,
  projectsProvider: ProjectsViewProvider,
  logger: ForgeFlowLogger,
  target?: unknown
): Promise<void> {
  const project = extractGitProject(projectsStore, gitProvider, target);
  if (!project) {
    return;
  }
  const plan = await buildCleanPlan(project, gitService, gitStore);
  if (!plan) {
    vscode.window.showWarningMessage('ForgeFlow: Git status unavailable. See Output > ForgeFlow for details.');
    return;
  }
  const { gone, merged } = plan;
  const confirm = await vscode.window.showWarningMessage(
    `Clean ${project.name}: prune remotes, delete ${gone.length} gone branches, delete ${merged.length} merged branches?`,
    { modal: true },
    'Clean'
  );
  if (confirm !== 'Clean') {
    return;
  }
  await gitService.pruneRemotes(project.path);
  for (const branch of gone) {
    await gitService.deleteBranch(project.path, branch, true);
  }
  for (const branch of merged) {
    await gitService.deleteBranch(project.path, branch, false);
  }
  if (gone.length > 0 || merged.length > 0) {
    logCleanPlan(logger, project.name, gone, merged);
  }
  const summary = await summarizeProjectWithOverrides(project, gitService, gitStore);
  if (summary) {
    await gitStore.setSummary(project.id, summary);
  }
  await gitProvider.refresh();
  await projectsProvider.refresh();
}

export async function previewCleanProject(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore,
  gitProvider: GitViewProvider,
  logger: ForgeFlowLogger,
  target?: unknown
): Promise<void> {
  const project = extractGitProject(projectsStore, gitProvider, target);
  if (!project) {
    return;
  }
  const plan = await buildCleanPlan(project, gitService, gitStore);
  if (!plan) {
    vscode.window.showWarningMessage('ForgeFlow: Git status unavailable. See Output > ForgeFlow for details.');
    return;
  }
  const { gone, merged } = plan;
  const message = `Plan for ${project.name}: ${gone.length} gone, ${merged.length} merged.`;
  const action = await vscode.window.showInformationMessage(message, 'Show Details');
  if (action === 'Show Details') {
    logCleanPlan(logger, project.name, gone, merged);
    logger.show();
  }
}

export async function bulkPruneRemotes(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore
): Promise<void> {
  const projects = projectsStore.list().filter((project) => project.type === 'git');
  if (projects.length === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No git projects available.');
    return;
  }
  const confirm = await vscode.window.showWarningMessage(
    `Prune remotes for ${projects.length} git projects?`,
    { modal: true },
    'Prune'
  );
  if (confirm !== 'Prune') {
    return;
  }
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'ForgeFlow: Pruning remotes', cancellable: true },
    async (progress, token) => {
      const total = projects.length;
      let index = 0;
      for (const project of projects) {
        if (token.isCancellationRequested) {
          break;
        }
        index += 1;
        progress.report({ message: `${project.name} (${index}/${total})`, increment: (100 / total) });
        await gitService.pruneRemotes(project.path);
      }
    }
  );
  await refreshGitSummaries(projectsStore, gitService, gitStore);
}

export async function bulkDeleteGoneBranches(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore
): Promise<void> {
  const targets = await collectBranchDeletions(projectsStore, gitService, 'gone', gitStore);
  if (!targets) {
    return;
  }
  const { deletions, totalBranches } = targets;
  if (totalBranches === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No gone branches found.');
    return;
  }
  const confirm = await vscode.window.showWarningMessage(
    `Delete ${totalBranches} gone branches across ${deletions.length} projects?`,
    { modal: true },
    'Delete'
  );
  if (confirm !== 'Delete') {
    return;
  }
  await runBulkDeletion(deletions, gitService, true);
  await refreshGitSummaries(projectsStore, gitService, gitStore);
}

export async function bulkDeleteMergedBranches(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore
): Promise<void> {
  const targets = await collectBranchDeletions(projectsStore, gitService, 'merged', gitStore);
  if (!targets) {
    return;
  }
  const { deletions, totalBranches } = targets;
  if (totalBranches === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No merged branches found.');
    return;
  }
  const confirm = await vscode.window.showWarningMessage(
    `Delete ${totalBranches} merged branches across ${deletions.length} projects?`,
    { modal: true },
    'Delete'
  );
  if (confirm !== 'Delete') {
    return;
  }
  await runBulkDeletion(deletions, gitService, false);
  await refreshGitSummaries(projectsStore, gitService, gitStore);
}

export async function previewCleanAllProjects(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore,
  logger: ForgeFlowLogger
): Promise<void> {
  const plan = await collectCleanPlans(projectsStore, gitService, gitStore);
  if (!plan) {
    return;
  }
  const { plans, totalGone, totalMerged } = plan;
  if (plans.length === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No git projects available.');
    return;
  }
  if (totalGone === 0 && totalMerged === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No branches to clean.');
    return;
  }
  const action = await vscode.window.showInformationMessage(
    `Plan: ${totalGone} gone, ${totalMerged} merged across ${plans.length} projects.`,
    'Show Details'
  );
  if (action === 'Show Details') {
    logBulkCleanPlan(logger, plans);
    logger.show();
  }
}

export async function cleanAllProjects(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore,
  logger: ForgeFlowLogger
): Promise<void> {
  const plan = await collectCleanPlans(projectsStore, gitService, gitStore);
  if (!plan) {
    return;
  }
  const { plans, totalGone, totalMerged } = plan;
  if (plans.length === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No git projects available.');
    return;
  }
  if (totalGone === 0 && totalMerged === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No branches to clean.');
    return;
  }
  const confirm = await vscode.window.showWarningMessage(
    `Clean ${plans.length} projects: prune remotes, delete ${totalGone} gone, delete ${totalMerged} merged branches?`,
    { modal: true },
    'Clean'
  );
  if (confirm !== 'Clean') {
    return;
  }
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'ForgeFlow: Cleaning git projects', cancellable: true },
    async (progress, token) => {
      const total = plans.length;
      let index = 0;
      for (const item of plans) {
        if (token.isCancellationRequested) {
          break;
        }
        index += 1;
        progress.report({ message: `${item.project.name} (${index}/${total})`, increment: (100 / total) });
        await gitService.pruneRemotes(item.project.path);
        for (const branch of item.gone) {
          await gitService.deleteBranch(item.project.path, branch, true);
        }
        for (const branch of item.merged) {
          await gitService.deleteBranch(item.project.path, branch, false);
        }
      }
    }
  );
  logBulkCleanPlan(logger, plans);
  await refreshGitSummaries(projectsStore, gitService, gitStore);
}

export async function selectGitProject(projectsStore: ProjectsStore, provider: GitViewProvider): Promise<void> {
  const projects = projectsStore.list().filter((project) => project.type === 'git');
  if (projects.length === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No git projects available.');
    return;
  }
  const selectedId = provider.getSelectedProjectId();
  const pick = await vscode.window.showQuickPick(
    projects.map((project) => ({
      label: project.name,
      description: project.path,
      value: project.id,
      picked: project.id === selectedId
    })),
    { placeHolder: 'Select git project' }
  );
  if (!pick) {
    return;
  }
  await provider.selectProject(pick.value);
}

export function getSelectedGitProject(projectsStore: ProjectsStore, provider: GitViewProvider): Project | undefined {
  const projects = projectsStore.list().filter((project) => project.type === 'git');
  if (projects.length === 0) {
    return undefined;
  }
  const selectedId = provider.getSelectedProjectId();
  return projects.find((project) => project.id === selectedId) ?? projects[0];
}

export function extractGitProject(
  projectsStore: ProjectsStore,
  provider: GitViewProvider,
  target?: unknown
): Project | undefined {
  if (target && isGitProjectNode(target)) {
    return target.project;
  }
  const direct = extractProject(target);
  if (direct) {
    return direct;
  }
  return getSelectedGitProject(projectsStore, provider);
}

export function extractGitBranch(target: unknown): string | undefined {
  if (typeof target === 'string') {
    return target;
  }
  if (isGitBranchNode(target)) {
    return target.branch.name;
  }
  return undefined;
}

function logCleanPlan(logger: ForgeFlowLogger, projectName: string, gone: string[], merged: string[]): void {
  logger.info(`Clean plan for ${projectName}`);
  logger.info(`Gone branches (${gone.length}): ${gone.join(', ') || 'none'}`);
  logger.info(`Merged branches (${merged.length}): ${merged.join(', ') || 'none'}`);
}

function logBulkCleanPlan(logger: ForgeFlowLogger, plans: Array<{ project: Project; gone: string[]; merged: string[] }>): void {
  logger.info('Clean plan: all projects');
  if (plans.length === 0) {
    logger.info('No branches to clean.');
    return;
  }
  for (const plan of plans) {
    logger.info(`Project: ${plan.project.name}`);
    logger.info(`Gone (${plan.gone.length}): ${plan.gone.join(', ') || 'none'}`);
    logger.info(`Merged (${plan.merged.length}): ${plan.merged.join(', ') || 'none'}`);
  }
}

async function buildCleanPlan(
  project: Project,
  gitService: GitService,
  gitStore: GitStore
): Promise<{ gone: string[]; merged: string[] } | undefined> {
  const overrides = gitStore.getProjectSettings(project.id);
  const status = await gitService.getRepoStatus(project.path, project.name, overrides);
  if (!status) {
    return undefined;
  }
  const gone = status.branches.filter((branch) => branch.isGone && !branch.isCurrent).map((branch) => branch.name);
  const merged = status.branches.filter((branch) => branch.isMerged && !branch.isCurrent).map((branch) => branch.name);
  return { gone, merged };
}

async function collectBranchDeletions(
  projectsStore: ProjectsStore,
  gitService: GitService,
  mode: 'gone' | 'merged',
  gitStore?: GitStore
): Promise<{ deletions: Array<{ project: Project; branches: string[] }>; totalBranches: number } | undefined> {
  const projects = projectsStore.list().filter((project) => project.type === 'git');
  if (projects.length === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No git projects available.');
    return undefined;
  }
  const deletions: Array<{ project: Project; branches: string[] }> = [];
  let totalBranches = 0;
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'ForgeFlow: Scanning branches', cancellable: true },
    async (progress, token) => {
      const total = projects.length;
      let index = 0;
      for (const project of projects) {
        if (token.isCancellationRequested) {
          break;
        }
        index += 1;
        progress.report({ message: `${project.name} (${index}/${total})`, increment: (100 / total) });
        const overrides = gitStore?.getProjectSettings(project.id);
        const status = await gitService.getRepoStatus(project.path, project.name, overrides);
        if (!status) {
          continue;
        }
        const branches = status.branches
          .filter((branch) => !branch.isCurrent && branch.name !== status.defaultBranch)
          .filter((branch) => mode === 'gone' ? branch.isGone : branch.isMerged)
          .map((branch) => branch.name);
        if (branches.length > 0) {
          deletions.push({ project, branches });
          totalBranches += branches.length;
        }
      }
    }
  );
  return { deletions, totalBranches };
}

async function runBulkDeletion(
  deletions: Array<{ project: Project; branches: string[] }>,
  gitService: GitService,
  force: boolean
): Promise<void> {
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'ForgeFlow: Deleting branches', cancellable: true },
    async (progress, token) => {
      const totalProjects = deletions.length;
      let index = 0;
      for (const item of deletions) {
        if (token.isCancellationRequested) {
          break;
        }
        index += 1;
        progress.report({ message: `${item.project.name} (${index}/${totalProjects})`, increment: (100 / totalProjects) });
        for (const branch of item.branches) {
          await gitService.deleteBranch(item.project.path, branch, force);
        }
      }
    }
  );
}

async function collectCleanPlans(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore
): Promise<{ plans: Array<{ project: Project; gone: string[]; merged: string[] }>; totalGone: number; totalMerged: number } | undefined> {
  const projects = projectsStore.list().filter((project) => project.type === 'git');
  if (projects.length === 0) {
    return undefined;
  }
  const plans: Array<{ project: Project; gone: string[]; merged: string[] }> = [];
  let totalGone = 0;
  let totalMerged = 0;
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'ForgeFlow: Scanning branches', cancellable: true },
    async (progress, token) => {
      const total = projects.length;
      let index = 0;
      for (const project of projects) {
        if (token.isCancellationRequested) {
          break;
        }
        index += 1;
        progress.report({ message: `${project.name} (${index}/${total})`, increment: (100 / total) });
        const overrides = gitStore.getProjectSettings(project.id);
        const status = await gitService.getRepoStatus(project.path, project.name, overrides);
        if (!status) {
          continue;
        }
        const gone = status.branches
          .filter((branch) => branch.isGone && !branch.isCurrent)
          .map((branch) => branch.name);
        const merged = status.branches
          .filter((branch) => branch.isMerged && !branch.isCurrent)
          .map((branch) => branch.name);
        if (gone.length === 0 && merged.length === 0) {
          continue;
        }
        totalGone += gone.length;
        totalMerged += merged.length;
        plans.push({ project, gone, merged });
      }
    }
  );
  return { plans, totalGone, totalMerged };
}
