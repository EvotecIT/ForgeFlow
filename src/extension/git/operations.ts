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
import { buildBranchDeletionPlan, type BranchDeletionPlan, type DeletionPlanMode } from './safety';

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
  const projects = listGitProjects(projectsStore);
  if (!projects) {
    return;
  }
  const summaries: Record<string, GitProjectSummary> = {};
  await forEachWithProgress(projects, 'ForgeFlow: Refreshing git summaries', (project) => project.name, async (project) => {
    const summary = await summarizeProjectWithOverrides(project, gitService, gitStore);
    if (summary) {
      summaries[project.id] = summary;
    }
  });
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

export async function refreshGitProjectSummaryAndViews(
  project: Project,
  gitService: GitService,
  gitStore: GitStore,
  gitProvider: GitViewProvider,
  projectsProvider: ProjectsViewProvider
): Promise<void> {
  const summary = await summarizeProjectWithOverrides(project, gitService, gitStore);
  if (summary) {
    await gitStore.setSummary(project.id, summary);
  }
  await gitProvider.refresh();
  await projectsProvider.refresh();
}

export async function configureGitProjectSettings(
  projectsStore: ProjectsStore,
  gitStore: GitStore,
  provider: GitViewProvider,
  target?: unknown
): Promise<void> {
  const projects = listGitProjects(projectsStore);
  if (!projects) {
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
  await withResolvedTargetCleanPlan(projectsStore, gitService, gitStore, gitProvider, target, async ({ project, plan }) => {
    const { gone, merged, skipped } = plan;
    if (gone.length === 0 && merged.length === 0) {
      if (skipped.length > 0) {
        vscode.window.showInformationMessage(
          `ForgeFlow: No deletable branches in ${project.name}. ${skipped.length} protected branch${skipped.length === 1 ? '' : 'es'} were skipped.`
        );
        return;
      }
      vscode.window.showInformationMessage(`ForgeFlow: No branches to clean in ${project.name}.`);
      return;
    }
    const protectedSuffix = skipped.length > 0 ? ` (skipping ${skipped.length} protected)` : '';
    const confirm = await vscode.window.showWarningMessage(
      `Clean ${project.name}: prune remotes, delete ${gone.length} gone branches, delete ${merged.length} merged branches${protectedSuffix}?`,
      { modal: true },
      'Clean'
    );
    if (confirm !== 'Clean') {
      return;
    }
    await gitService.pruneRemotes(project.path);
    let failures = 0;
    for (const branch of gone) {
      try {
        await gitService.deleteBranch(project.path, branch, true);
      } catch {
        failures += 1;
      }
    }
    for (const branch of merged) {
      try {
        await gitService.deleteBranch(project.path, branch, false);
      } catch {
        failures += 1;
      }
    }
    if (gone.length > 0 || merged.length > 0) {
      logCleanPlan(logger, project.name, gone, merged);
    }
    if (failures > 0) {
      vscode.window.showWarningMessage(
        `ForgeFlow: Failed to delete ${failures} branch${failures === 1 ? '' : 'es'} in ${project.name}.`
      );
    }
    await refreshGitProjectSummaryAndViews(project, gitService, gitStore, gitProvider, projectsProvider);
  });
}

export async function previewCleanProject(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore,
  gitProvider: GitViewProvider,
  logger: ForgeFlowLogger,
  target?: unknown
): Promise<void> {
  await withResolvedTargetCleanPlan(projectsStore, gitService, gitStore, gitProvider, target, async ({ project, plan }) => {
    const { gone, merged, skipped } = plan;
    const protectedSuffix = skipped.length > 0 ? `, ${skipped.length} protected` : '';
    const message = `Plan for ${project.name}: ${gone.length} gone, ${merged.length} merged${protectedSuffix}.`;
    const action = await vscode.window.showInformationMessage(message, 'Show Details');
    if (action === 'Show Details') {
      logCleanPlan(logger, project.name, gone, merged);
      logger.show();
    }
  });
}

export async function bulkPruneRemotes(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore
): Promise<void> {
  const projects = listGitProjects(projectsStore);
  if (!projects) {
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
  await forEachWithProgress(projects, 'ForgeFlow: Pruning remotes', (project) => project.name, async (project) => {
    await gitService.pruneRemotes(project.path);
  });
  await refreshGitSummaries(projectsStore, gitService, gitStore);
}

export async function bulkDeleteGoneBranches(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore
): Promise<void> {
  await bulkDeleteBranchesByMode(projectsStore, gitService, gitStore, 'gone');
}

export async function bulkDeleteMergedBranches(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore
): Promise<void> {
  await bulkDeleteBranchesByMode(projectsStore, gitService, gitStore, 'merged');
}

async function bulkDeleteBranchesByMode(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore,
  mode: 'gone' | 'merged'
): Promise<void> {
  const targets = await collectBranchDeletions(projectsStore, gitService, mode, gitStore);
  if (!targets) {
    return;
  }
  const { deletions, totalBranches } = targets;
  if (totalBranches === 0) {
    vscode.window.showInformationMessage(`ForgeFlow: No ${mode} branches found.`);
    return;
  }
  const confirm = await vscode.window.showWarningMessage(
    `Delete ${totalBranches} ${mode} branches across ${deletions.length} projects?`,
    { modal: true },
    'Delete'
  );
  if (confirm !== 'Delete') {
    return;
  }
  const failures = await runBulkDeletion(deletions, gitService, mode === 'gone');
  if (failures > 0) {
    vscode.window.showWarningMessage(`ForgeFlow: Failed to delete ${failures} ${mode} branch${failures === 1 ? '' : 'es'}.`);
  }
  await refreshGitSummaries(projectsStore, gitService, gitStore);
}

export async function previewCleanAllProjects(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore,
  logger: ForgeFlowLogger
): Promise<void> {
  await withCollectedCleanPlans(projectsStore, gitService, gitStore, async (plan) => {
    if (shouldAbortCleanAll(plan)) {
      return;
    }
    const { plans, totalGone, totalMerged, totalSkipped } = plan;
    const action = await vscode.window.showInformationMessage(
      `Plan: ${totalGone} gone, ${totalMerged} merged, ${totalSkipped} protected across ${plans.length} projects.`,
      'Show Details'
    );
    if (action === 'Show Details') {
      logBulkCleanPlan(logger, plans);
      logger.show();
    }
  });
}

export async function cleanAllProjects(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore,
  logger: ForgeFlowLogger
): Promise<void> {
  await withCollectedCleanPlans(projectsStore, gitService, gitStore, async (plan) => {
    if (shouldAbortCleanAll(plan)) {
      return;
    }
    const { plans, totalGone, totalMerged, totalSkipped } = plan;
    const confirm = await vscode.window.showWarningMessage(
      `Clean ${plans.length} projects: prune remotes, delete ${totalGone} gone, delete ${totalMerged} merged branches (skipping ${totalSkipped} protected)?`,
      { modal: true },
      'Clean'
    );
    if (confirm !== 'Clean') {
      return;
    }
    let failures = 0;
    await forEachWithProgress(plans, 'ForgeFlow: Cleaning git projects', (item) => item.project.name, async (item) => {
      await gitService.pruneRemotes(item.project.path);
      for (const branch of item.gone) {
        try {
          await gitService.deleteBranch(item.project.path, branch, true);
        } catch {
          failures += 1;
        }
      }
      for (const branch of item.merged) {
        try {
          await gitService.deleteBranch(item.project.path, branch, false);
        } catch {
          failures += 1;
        }
      }
    });
    if (failures > 0) {
      vscode.window.showWarningMessage(`ForgeFlow: Failed to delete ${failures} branch${failures === 1 ? '' : 'es'} during clean-all.`);
    }
    logBulkCleanPlan(logger, plans);
    await refreshGitSummaries(projectsStore, gitService, gitStore);
  });
}

export async function selectGitProject(projectsStore: ProjectsStore, provider: GitViewProvider): Promise<void> {
  const projects = listGitProjects(projectsStore);
  if (!projects) {
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
  const projects = listGitProjects(projectsStore, false);
  if (!projects) {
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

function listGitProjects(projectsStore: ProjectsStore, notifyIfEmpty = true): Project[] | undefined {
  const projects = projectsStore.list().filter((project) => project.type === 'git');
  if (projects.length === 0) {
    if (notifyIfEmpty) {
      vscode.window.showInformationMessage('ForgeFlow: No git projects available.');
    }
    return undefined;
  }
  return projects;
}

async function forEachWithProgress<T>(
  items: T[],
  title: string,
  label: (item: T) => string,
  work: (item: T) => Promise<void>
): Promise<void> {
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title, cancellable: true },
    async (progress, token) => {
      const total = items.length;
      let index = 0;
      for (const item of items) {
        if (token.isCancellationRequested) {
          break;
        }
        index += 1;
        progress.report({ message: `${label(item)} (${index}/${total})`, increment: (100 / total) });
        await work(item);
      }
    }
  );
}

function shouldSkipCleanAll(totalGone: number, totalMerged: number, totalSkipped: number): boolean {
  if (totalGone > 0 || totalMerged > 0) {
    return false;
  }
  if (totalSkipped > 0) {
    vscode.window.showInformationMessage('ForgeFlow: Only protected branches were found; nothing to clean.');
    return true;
  }
  vscode.window.showInformationMessage('ForgeFlow: No branches to clean.');
  return true;
}

function shouldAbortCleanAll(plan: {
  plans: Array<{ project: Project; gone: string[]; merged: string[] }>;
  totalGone: number;
  totalMerged: number;
  totalSkipped: number;
}): boolean {
  if (plan.plans.length === 0) {
    return shouldSkipCleanAll(0, 0, plan.totalSkipped);
  }
  return shouldSkipCleanAll(plan.totalGone, plan.totalMerged, plan.totalSkipped);
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
): Promise<{ gone: string[]; merged: string[]; skipped: Array<{ branch: string; reason: string }> } | undefined> {
  const overrides = gitStore.getProjectSettings(project.id);
  const status = await gitService.getRepoStatus(project.path, project.name, overrides);
  if (!status) {
    return undefined;
  }
  return await planBranchDeletionForStatus(project, status, gitService, 'clean');
}

async function resolveTargetCleanPlan(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore,
  gitProvider: GitViewProvider,
  target?: unknown
): Promise<{ project: Project; plan: BranchDeletionPlan } | undefined> {
  const project = extractGitProject(projectsStore, gitProvider, target);
  if (!project) {
    return undefined;
  }
  const plan = await buildCleanPlan(project, gitService, gitStore);
  if (!plan) {
    vscode.window.showWarningMessage('ForgeFlow: Git status unavailable. See Output > ForgeFlow for details.');
    return undefined;
  }
  return { project, plan };
}

async function withResolvedTargetCleanPlan(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore,
  gitProvider: GitViewProvider,
  target: unknown,
  run: (resolved: { project: Project; plan: BranchDeletionPlan }) => Promise<void>
): Promise<void> {
  const resolved = await resolveTargetCleanPlan(projectsStore, gitService, gitStore, gitProvider, target);
  if (!resolved) {
    return;
  }
  await run(resolved);
}

async function collectBranchDeletions(
  projectsStore: ProjectsStore,
  gitService: GitService,
  mode: 'gone' | 'merged',
  gitStore?: GitStore
): Promise<{ deletions: Array<{ project: Project; branches: string[] }>; totalBranches: number } | undefined> {
  const projects = listGitProjects(projectsStore);
  if (!projects) {
    return undefined;
  }
  const deletions: Array<{ project: Project; branches: string[] }> = [];
  let totalBranches = 0;
  await forEachWithProgress(projects, 'ForgeFlow: Scanning branches', (project) => project.name, async (project) => {
    const overrides = gitStore?.getProjectSettings(project.id);
    const status = await gitService.getRepoStatus(project.path, project.name, overrides);
    if (!status) {
      return;
    }
    const plan = await planBranchDeletionForStatus(project, status, gitService, mode);
    const branches = mode === 'gone' ? plan.gone : plan.merged;
    if (branches.length > 0) {
      deletions.push({ project, branches });
      totalBranches += branches.length;
    }
  });
  return { deletions, totalBranches };
}

async function runBulkDeletion(
  deletions: Array<{ project: Project; branches: string[] }>,
  gitService: GitService,
  force: boolean
): Promise<number> {
  let failures = 0;
  await forEachWithProgress(deletions, 'ForgeFlow: Deleting branches', (item) => item.project.name, async (item) => {
    for (const branch of item.branches) {
      try {
        await gitService.deleteBranch(item.project.path, branch, force);
      } catch {
        failures += 1;
      }
    }
  });
  return failures;
}

async function collectCleanPlans(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore
): Promise<{
  plans: Array<{ project: Project; gone: string[]; merged: string[] }>;
  totalGone: number;
  totalMerged: number;
  totalSkipped: number;
} | undefined> {
  const projects = listGitProjects(projectsStore, false);
  if (!projects) {
    return undefined;
  }
  const plans: Array<{ project: Project; gone: string[]; merged: string[] }> = [];
  let totalGone = 0;
  let totalMerged = 0;
  let totalSkipped = 0;
  await forEachWithProgress(projects, 'ForgeFlow: Scanning branches', (project) => project.name, async (project) => {
    const overrides = gitStore.getProjectSettings(project.id);
    const status = await gitService.getRepoStatus(project.path, project.name, overrides);
    if (!status) {
      return;
    }
    const plan = await planBranchDeletionForStatus(project, status, gitService, 'clean');
    const { gone, merged, skipped } = plan;
    totalSkipped += skipped.length;
    if (gone.length === 0 && merged.length === 0) {
      return;
    }
    totalGone += gone.length;
    totalMerged += merged.length;
    plans.push({ project, gone, merged });
  });
  return { plans, totalGone, totalMerged, totalSkipped };
}

async function withCollectedCleanPlans(
  projectsStore: ProjectsStore,
  gitService: GitService,
  gitStore: GitStore,
  run: (plan: {
    plans: Array<{ project: Project; gone: string[]; merged: string[] }>;
    totalGone: number;
    totalMerged: number;
    totalSkipped: number;
  }) => Promise<void>
): Promise<void> {
  const plan = await collectCleanPlans(projectsStore, gitService, gitStore);
  if (!plan) {
    return;
  }
  await run(plan);
}

async function planBranchDeletionForStatus(
  project: Project,
  status: NonNullable<Awaited<ReturnType<GitService['getRepoStatus']>>>,
  gitService: GitService,
  mode: DeletionPlanMode
): Promise<BranchDeletionPlan> {
  const checkedOutInWorktrees = await gitService.getCheckedOutWorktreeBranches(project.path);
  const goneCandidates = status.branches
    .filter((branch) => branch.isGone)
    .map((branch) => branch.name);
  const mergedCandidates = status.branches
    .filter((branch) => branch.isMerged)
    .map((branch) => branch.name);
  return buildBranchDeletionPlan({
    goneCandidates,
    mergedCandidates,
    currentBranch: status.currentBranch,
    defaultBranch: status.defaultBranch,
    checkedOutInWorktrees,
    mode
  });
}
