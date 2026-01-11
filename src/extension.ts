import * as path from 'path';
import * as vscode from 'vscode';
import { DashboardService } from './dashboard/dashboardService';
import { DashboardCache } from './dashboard/cache';
import { DashboardTokenStore } from './dashboard/tokenStore';
import { DashboardFilterStore } from './dashboard/filterStore';
import { GitService } from './git/gitService';
import { buildProjectSummary, type GitProjectSummary } from './git/gitSummary';
import { GitStore, type GitProjectSettings } from './git/gitStore';
import { GitWatchService } from './git/gitWatchService';
import { ProjectScanner } from './scan/projectScanner';
import { RunService } from './run/runService';
import { TerminalManager } from './run/terminalManager';
import { FavoritesStore } from './store/favoritesStore';
import { ProjectsStore } from './store/projectsStore';
import { GitCommitCacheStore } from './store/gitCommitCacheStore';
import { StateStore } from './store/stateStore';
import { FilesViewProvider } from './views/filesView';
import type { PathNode } from './views/filesView';
import { ProjectsViewProvider } from './views/projectsView';
import type {
  ProjectNodeWithEntry,
  ProjectNodeWithPath,
  ProjectNodeWithProject
} from './views/projectsView';
import { DashboardViewProvider } from './views/dashboardView';
import { GitViewProvider, isGitBranchNode, isGitProjectNode } from './views/gitView';
import { ForgeFlowLogger } from './util/log';
import type { Project, ProjectEntryPoint } from './models/project';
import type { RunTarget } from './models/run';
import { builtInProfiles } from './run/powershellProfiles';
import { detectProjectIdentity } from './scan/identityDetector';
import type { ProjectSortMode, SortDirection } from './util/config';
import { getForgeFlowSettings } from './util/config';
import { statPath } from './util/fs';
import { openFileInBrowser, openFileInDefaultApp, openInVisualStudio, type BrowserTarget } from './util/open';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = new ForgeFlowLogger();
  const stateStore = new StateStore(context);
  const favoritesStore = new FavoritesStore(stateStore);
  const projectsStore = new ProjectsStore(stateStore);
  const gitCommitCacheStore = new GitCommitCacheStore(stateStore);
  const terminalManager = new TerminalManager();
  const runService = new RunService(logger, favoritesStore, projectsStore, terminalManager);
  const scanner = new ProjectScanner();
  const tokenStore = new DashboardTokenStore(context);
  const dashboardCache = new DashboardCache(stateStore);
  const dashboardFilterStore = new DashboardFilterStore(stateStore);
  const gitStore = new GitStore(stateStore);
  const gitService = new GitService();
  const gitWatchService = new GitWatchService(projectsStore, gitCommitCacheStore, logger);

  const filesProvider = new FilesViewProvider(favoritesStore);
  const projectsProvider = new ProjectsViewProvider(projectsStore, scanner, gitStore, gitCommitCacheStore);
  const dashboardService = new DashboardService(projectsStore, logger, tokenStore);
  const dashboardProvider = new DashboardViewProvider(dashboardService, logger, dashboardCache, dashboardFilterStore, tokenStore);
  const gitProvider = new GitViewProvider(projectsStore, gitService, gitStore);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('forgeflow.files', filesProvider),
    vscode.window.registerTreeDataProvider('forgeflow.projects', projectsProvider),
    vscode.window.registerTreeDataProvider('forgeflow.git', gitProvider),
    vscode.window.registerWebviewViewProvider('forgeflow.dashboard', dashboardProvider),
    terminalManager,
    gitWatchService
  );

  projectsProvider.onDidUpdateProjects((projects) => {
    gitWatchService.setProjects(projects, projectsStore.getFavoriteIds());
  });
  gitWatchService.onDidUpdate((update) => {
    projectsProvider.applyGitCommitUpdate(update.projectId, update.lastGitCommit);
  });
  gitWatchService.setProjects(projectsStore.list(), projectsStore.getFavoriteIds());
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('forgeflow.projects.gitWatch')
        || event.affectsConfiguration('forgeflow.projects.gitWatchMaxRepos')
        || event.affectsConfiguration('forgeflow.projects.gitWatchDebounceMs')) {
        gitWatchService.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('forgeflow.files.open', async (target?: unknown) => {
      const filePath = extractPath(target);
      if (filePath) {
        await openPath(filePath);
      }
    }),
    vscode.commands.registerCommand('forgeflow.files.openToSide', async (target?: unknown) => {
      const filePath = resolveTargetPath(target);
      if (!filePath) {
        return;
      }
      await openPathToSide(filePath);
    }),
    vscode.commands.registerCommand('forgeflow.files.openWith', async (target?: unknown) => {
      const filePath = resolveTargetPath(target);
      if (!filePath) {
        return;
      }
      await openWith(filePath);
    }),
    vscode.commands.registerCommand('forgeflow.files.openInTerminal', async (target?: unknown) => {
      const filePath = resolveTargetPath(target);
      if (!filePath) {
        return;
      }
      await openInTerminal(filePath);
    }),
    vscode.commands.registerCommand('forgeflow.files.revealInOs', async (target?: unknown) => {
      const filePath = extractPath(target);
      if (filePath) {
        await revealPath(filePath);
      }
    }),
    vscode.commands.registerCommand('forgeflow.files.copyPath', async (target?: unknown) => {
      const filePath = resolveTargetPath(target);
      if (!filePath) {
        return;
      }
      await copyPathToClipboard(filePath);
    }),
    vscode.commands.registerCommand('forgeflow.files.copyRelativePath', async (target?: unknown) => {
      const filePath = resolveTargetPath(target);
      if (!filePath) {
        return;
      }
      await copyRelativePathToClipboard(filePath);
    }),
    vscode.commands.registerCommand('forgeflow.files.rename', async (target?: unknown) => {
      const filePath = resolveTargetPath(target);
      if (!filePath) {
        return;
      }
      await renamePath(filePath);
      filesProvider.refresh();
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.files.delete', async (target?: unknown) => {
      const filePath = resolveTargetPath(target);
      if (!filePath) {
        return;
      }
      await deletePath(filePath);
      filesProvider.refresh();
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.files.newFile', async (target?: unknown) => {
      const baseDir = await resolveBaseDirectory(target);
      if (!baseDir) {
        return;
      }
      await createNewFile(baseDir);
      filesProvider.refresh();
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.files.newFolder', async (target?: unknown) => {
      const baseDir = await resolveBaseDirectory(target);
      if (!baseDir) {
        return;
      }
      await createNewFolder(baseDir);
      filesProvider.refresh();
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.files.run', async (target?: unknown) => {
      const filePath = extractPath(target);
      await runPath(filePath, runService, projectsStore, undefined);
    }),
    vscode.commands.registerCommand('forgeflow.files.pinFavorite', async (target?: unknown) => {
      const filePath = extractPath(target);
      if (filePath) {
        await pinFavorite(filePath, favoritesStore);
        filesProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('forgeflow.files.unpinFavorite', async (target?: unknown) => {
      const filePath = extractPath(target);
      if (filePath) {
        await favoritesStore.remove(filePath);
        filesProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('forgeflow.files.moveFavoriteUp', async (target?: unknown) => {
      const filePath = extractPath(target);
      if (filePath) {
        await favoritesStore.move(filePath, 'up');
        filesProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('forgeflow.files.moveFavoriteDown', async (target?: unknown) => {
      const filePath = extractPath(target);
      if (filePath) {
        await favoritesStore.move(filePath, 'down');
        filesProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('forgeflow.projects.open', async (target?: unknown) => {
      const project = extractProject(target);
      if (project) {
        await openProject(project, projectsStore);
      }
    }),
    vscode.commands.registerCommand('forgeflow.projects.refresh', async () => {
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.projects.configureScanRoots', async () => {
      await configureScanRoots(projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.projects.setSortMode', async () => {
      await configureSortMode(projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.projects.setSortDirection', async () => {
      await configureSortDirection(projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.projects.filter', async () => {
      await configureProjectFilter(projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.projects.clearFilter', async () => {
      projectsProvider.setFilter('');
    }),
    vscode.commands.registerCommand('forgeflow.projects.pinFavorite', async (target?: unknown) => {
      const project = extractProject(target);
      if (project) {
        await projectsStore.addFavorite(project.id);
        await projectsProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('forgeflow.projects.unpinFavorite', async (target?: unknown) => {
      const project = extractProject(target);
      if (project) {
        await projectsStore.removeFavorite(project.id);
        await projectsProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('forgeflow.projects.moveFavoriteUp', async (target?: unknown) => {
      const project = extractProject(target);
      if (project) {
        await projectsStore.moveFavorite(project.id, 'up');
        await projectsProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('forgeflow.projects.moveFavoriteDown', async (target?: unknown) => {
      const project = extractProject(target);
      if (project) {
        await projectsStore.moveFavorite(project.id, 'down');
        await projectsProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('forgeflow.projects.openEntryPoint', async (target?: unknown) => {
      const entry = extractEntry(target);
      if (entry) {
        await openPath(entry.path);
      }
    }),
    vscode.commands.registerCommand('forgeflow.projects.pinItem', async (target?: unknown) => {
      const entry = extractEntry(target);
      if (!entry) {
        return;
      }
      const project = findProjectByPath(projectsStore.list(), entry.path);
      if (!project) {
        return;
      }
      const pinned = project.pinnedItems.includes(entry.path)
        ? project.pinnedItems
        : [...project.pinnedItems, entry.path];
      await projectsStore.updatePinnedItems(project.id, pinned);
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.projects.unpinItem', async (target?: unknown) => {
      const itemPath = extractPath(target);
      if (!itemPath) {
        return;
      }
      const project = findProjectByPath(projectsStore.list(), itemPath);
      if (!project) {
        return;
      }
      const pinned = project.pinnedItems.filter((item) => item !== itemPath);
      await projectsStore.updatePinnedItems(project.id, pinned);
      await projectsProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.projects.movePinnedItemUp', async (target?: unknown) => {
      const itemPath = extractPath(target);
      if (!itemPath) {
        return;
      }
      await movePinnedItem(itemPath, 'up', projectsStore, projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.projects.movePinnedItemDown', async (target?: unknown) => {
      const itemPath = extractPath(target);
      if (!itemPath) {
        return;
      }
      await movePinnedItem(itemPath, 'down', projectsStore, projectsProvider);
    }),
    vscode.commands.registerCommand('forgeflow.run', async (target?: unknown) => {
      const filePath = extractPath(target);
      await runPath(filePath, runService, projectsStore, undefined);
    }),
    vscode.commands.registerCommand('forgeflow.run.chooseProfile', async (target?: unknown) => {
      const profileId = await chooseProfileId();
      if (!profileId) {
        return;
      }
      const filePath = extractPath(target);
      await runPath(filePath, runService, projectsStore, undefined, profileId);
    }),
    vscode.commands.registerCommand('forgeflow.run.integrated', async (target?: unknown) => {
      const filePath = extractPath(target);
      await runPath(filePath, runService, projectsStore, 'integrated');
    }),
    vscode.commands.registerCommand('forgeflow.run.external', async (target?: unknown) => {
      const filePath = extractPath(target);
      await runPath(filePath, runService, projectsStore, 'external');
    }),
    vscode.commands.registerCommand('forgeflow.run.externalAdmin', async (target?: unknown) => {
      const filePath = extractPath(target);
      await runPath(filePath, runService, projectsStore, 'externalAdmin');
    }),
    vscode.commands.registerCommand('forgeflow.openInDefaultApp', async (target?: unknown) => {
      const filePath = resolveTargetPath(target);
      if (!filePath) {
        vscode.window.showWarningMessage('ForgeFlow: No file selected to open.');
        return;
      }
      await openFileInDefaultApp(filePath);
    }),
    vscode.commands.registerCommand('forgeflow.openInBrowser', async (target?: unknown) => {
      const filePath = resolveTargetPath(target);
      if (!filePath) {
        vscode.window.showWarningMessage('ForgeFlow: No file selected to open.');
        return;
      }
      const browser = getForgeFlowSettings().browserPreferred;
      await openFileInBrowser(filePath, browser);
    }),
    vscode.commands.registerCommand('forgeflow.openInBrowser.shortcut', async () => {
      const filePath = vscode.window.activeTextEditor?.document.uri.fsPath;
      if (!filePath) {
        return;
      }
      const settings = getForgeFlowSettings();
      if (!isBrowserFile(filePath, settings.browserFileExtensions)) {
        return;
      }
      await openFileInBrowser(filePath, settings.browserPreferred);
    }),
    vscode.commands.registerCommand('forgeflow.openInBrowser.choose', async (target?: unknown) => {
      const filePath = resolveTargetPath(target);
      if (!filePath) {
        vscode.window.showWarningMessage('ForgeFlow: No file selected to open.');
        return;
      }
      const browser = await pickBrowserTarget();
      if (!browser) {
        return;
      }
      await openFileInBrowser(filePath, browser);
    }),
    vscode.commands.registerCommand('forgeflow.openInVisualStudio', async (target?: unknown) => {
      const filePath = resolveTargetPath(target);
      if (!filePath) {
        vscode.window.showWarningMessage('ForgeFlow: No file selected to open.');
        return;
      }
      if (path.extname(filePath).toLowerCase() !== '.sln') {
        vscode.window.showWarningMessage('ForgeFlow: Visual Studio open is only supported for .sln files.');
        return;
      }
      await openInVisualStudio(filePath);
    }),
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
    vscode.commands.registerCommand('forgeflow.dashboard.configureTokens', async () => {
      await configureDashboardTokens(tokenStore);
      await dashboardProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.dashboard.configureIdentity', async () => {
      await configureProjectIdentity(projectsStore, dashboardProvider);
    }),
    vscode.commands.registerCommand('forgeflow.git.refresh', async () => {
      await gitProvider.refresh();
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

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      filesProvider.refresh();
      await projectsProvider.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('forgeflow.projects')) {
        await projectsProvider.refresh();
      }
    }),
    vscode.workspace.onDidOpenTextDocument(async (document) => {
      await touchProjectActivity(document, projectsStore, projectsProvider);
    }),
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      await touchProjectActivity(document, projectsStore, projectsProvider);
    })
  );

  await projectsProvider.refresh();
  logger.info('ForgeFlow activated.');
}

export function deactivate(): void {
  // handled by disposables
}

async function openPath(targetPath: string): Promise<void> {
  const stat = await statPath(targetPath);
  if (stat?.type === vscode.FileType.Directory) {
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetPath), false);
    return;
  }
  await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(targetPath));
}

async function openPathToSide(targetPath: string): Promise<void> {
  const stat = await statPath(targetPath);
  if (stat?.type === vscode.FileType.Directory) {
    vscode.window.showWarningMessage('ForgeFlow: Open to Side is only available for files.');
    return;
  }
  await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(targetPath), {
    viewColumn: vscode.ViewColumn.Beside,
    preview: false
  });
}

async function openWith(targetPath: string): Promise<void> {
  const uri = vscode.Uri.file(targetPath);
  await vscode.commands.executeCommand('workbench.action.openWith', uri);
}

async function openInTerminal(targetPath: string): Promise<void> {
  const stat = await statPath(targetPath);
  const cwd = stat?.type === vscode.FileType.Directory ? targetPath : path.dirname(targetPath);
  const terminal = vscode.window.createTerminal({ name: 'ForgeFlow', cwd });
  terminal.show(true);
}

async function revealPath(targetPath: string): Promise<void> {
  await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(targetPath));
}

async function renamePath(targetPath: string): Promise<void> {
  await vscode.commands.executeCommand('renameFile', vscode.Uri.file(targetPath));
}

async function copyPathToClipboard(targetPath: string): Promise<void> {
  await vscode.env.clipboard.writeText(targetPath);
  vscode.window.setStatusBarMessage('ForgeFlow: Path copied.', 2000);
}

async function copyRelativePathToClipboard(targetPath: string): Promise<void> {
  const uri = vscode.Uri.file(targetPath);
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) {
    await copyPathToClipboard(targetPath);
    vscode.window.showWarningMessage('ForgeFlow: File is outside the workspace, copied absolute path.');
    return;
  }
  const relative = path.relative(folder.uri.fsPath, targetPath);
  await vscode.env.clipboard.writeText(relative);
  vscode.window.setStatusBarMessage('ForgeFlow: Relative path copied.', 2000);
}

async function deletePath(targetPath: string): Promise<void> {
  const stat = await statPath(targetPath);
  const label = stat?.type === vscode.FileType.Directory ? 'folder' : 'file';
  const confirmation = await vscode.window.showWarningMessage(
    `ForgeFlow: Delete ${label} "${path.basename(targetPath)}"?`,
    { modal: true },
    'Delete'
  );
  if (confirmation !== 'Delete') {
    return;
  }
  await vscode.workspace.fs.delete(vscode.Uri.file(targetPath), { recursive: true, useTrash: true });
}

async function createNewFile(baseDirectory: string): Promise<void> {
  const name = await vscode.window.showInputBox({ prompt: 'New file name', value: '' });
  if (!name) {
    return;
  }
  const target = path.join(baseDirectory, name);
  await vscode.workspace.fs.writeFile(vscode.Uri.file(target), new Uint8Array());
  await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(target));
}

async function createNewFolder(baseDirectory: string): Promise<void> {
  const name = await vscode.window.showInputBox({ prompt: 'New folder name', value: '' });
  if (!name) {
    return;
  }
  const target = path.join(baseDirectory, name);
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(target));
}

async function pinFavorite(targetPath: string, store: FavoritesStore): Promise<void> {
  const stat = await statPath(targetPath);
  const kind = stat?.type === vscode.FileType.Directory ? 'folder' : 'file';
  await store.add({ path: targetPath, kind });
}

async function openProject(project: Project, store: ProjectsStore): Promise<void> {
  await store.updateLastOpened(project.id, Date.now());
  await store.updateLastActivity(project.id, Date.now());
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(project.path), false);
}

async function runPath(
  inputPath: string | undefined,
  runService: RunService,
  projectsStore: ProjectsStore,
  target: RunTarget | undefined,
  profileId?: string
): Promise<void> {
  const filePathRaw = inputPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
  const filePath = filePathRaw ? normalizeFsPath(filePathRaw) : undefined;
  if (!filePath) {
    vscode.window.showWarningMessage('ForgeFlow: No file selected to run.');
    return;
  }

  if (path.extname(filePath).toLowerCase() !== '.ps1') {
    vscode.window.showWarningMessage('ForgeFlow: Only .ps1 scripts can be run.');
    return;
  }

  const project = findProjectByPath(projectsStore.list(), filePath);
  const projectPath = project ? normalizeFsPath(project.path) : undefined;
  const workingDirectory = await resolveWorkingDirectory(filePath, projectPath);
  await runService.run({
    filePath,
    workingDirectory,
    projectId: project?.id,
    profileId,
    target
  });
}

function findProjectByPath(projects: Project[], filePath: string): Project | undefined {
  const resolved = path.resolve(filePath);
  return projects.find((project) => isWithin(normalizeFsPath(project.path), resolved));
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function chooseProfileId(): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration('forgeflow');
  const profiles = config.get<{ id: string; label: string }[]>('powershell.profiles', []);
  const allProfiles = [...builtInProfiles, ...profiles];
  const items = allProfiles.map((profile) => ({ label: profile.label, id: profile.id }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select PowerShell profile' });
  return picked?.id;
}

async function movePinnedItem(
  itemPath: string,
  direction: 'up' | 'down',
  store: ProjectsStore,
  provider: ProjectsViewProvider
): Promise<void> {
  const project = findProjectByPath(store.list(), itemPath);
  if (!project) {
    return;
  }
  const pinned = [...project.pinnedItems];
  const index = pinned.indexOf(itemPath);
  if (index === -1) {
    return;
  }
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= pinned.length) {
    return;
  }
  pinned.splice(index, 1);
  pinned.splice(targetIndex, 0, itemPath);
  await store.updatePinnedItems(project.id, pinned);
  await provider.refresh();
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

async function configureScanRoots(provider: ProjectsViewProvider): Promise<void> {
  const selection = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: true,
    openLabel: 'Select Project Roots'
  });

  if (!selection) {
    return;
  }

  const roots = selection.map((uri) => uri.fsPath);
  const config = vscode.workspace.getConfiguration('forgeflow');
  await config.update('projects.scanRoots', roots, vscode.ConfigurationTarget.Global);
  await provider.refresh();
  vscode.window.showInformationMessage(`ForgeFlow: ${roots.length} project root(s) configured.`);
}

async function configureSortMode(provider: ProjectsViewProvider): Promise<void> {
  const settings = getForgeFlowSettings();
  const baseOptions = [
    { label: 'Recent Opened', value: 'recentOpened' },
    { label: 'Recent Modified', value: 'recentModified' },
    { label: 'Alphabetical', value: 'alphabetical' },
    { label: 'Last Active', value: 'lastActive' },
    { label: 'Git Commit Time', value: 'gitCommit' }
  ] as const;
  const options: Array<{ label: string; value: ProjectSortMode; picked?: boolean }> = baseOptions.map((option) => ({
    ...option,
    picked: option.value === settings.projectSortMode
  }));
  const pick = await vscode.window.showQuickPick(options, { placeHolder: 'Select project sort mode' });
  if (!pick) {
    return;
  }
  const config = vscode.workspace.getConfiguration('forgeflow');
  await config.update('projects.sortMode', pick.value, vscode.ConfigurationTarget.Global);
  await provider.refresh();
}

async function configureSortDirection(provider: ProjectsViewProvider): Promise<void> {
  const settings = getForgeFlowSettings();
  const baseOptions = [
    { label: 'Descending', value: 'desc' },
    { label: 'Ascending', value: 'asc' }
  ] as const;
  const options: Array<{ label: string; value: SortDirection; picked?: boolean }> = baseOptions.map((option) => ({
    ...option,
    picked: option.value === settings.projectSortDirection
  }));
  const pick = await vscode.window.showQuickPick(options, { placeHolder: 'Select sort direction' });
  if (!pick) {
    return;
  }
  const config = vscode.workspace.getConfiguration('forgeflow');
  await config.update('projects.sortDirection', pick.value, vscode.ConfigurationTarget.Global);
  await provider.refresh();
}

async function configureProjectFilter(provider: ProjectsViewProvider): Promise<void> {
  const current = provider.getFilter();
  const value = await vscode.window.showInputBox({
    prompt: 'Filter projects (name/path/repo). Leave empty to clear.',
    value: current
  });
  if (value === undefined) {
    return;
  }
  provider.setFilter(value);
}

async function configureGitBranchSortMode(): Promise<void> {
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

async function configureGitBranchSortDirection(): Promise<void> {
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

async function configureGitBranchFilter(): Promise<void> {
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

async function refreshGitSummaries(
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

async function summarizeProjectWithOverrides(
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

async function configureGitProjectSettings(
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

async function cleanSelectedProject(
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
    vscode.window.showWarningMessage('ForgeFlow: Git status unavailable.');
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

async function previewCleanProject(
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
    vscode.window.showWarningMessage('ForgeFlow: Git status unavailable.');
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

function logCleanPlan(logger: ForgeFlowLogger, projectName: string, gone: string[], merged: string[]): void {
  logger.info(`Clean plan for ${projectName}`);
  logger.info(`Gone branches (${gone.length}): ${gone.join(', ') || 'none'}`);
  logger.info(`Merged branches (${merged.length}): ${merged.join(', ') || 'none'}`);
}

async function bulkPruneRemotes(
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

async function bulkDeleteGoneBranches(
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

async function bulkDeleteMergedBranches(
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

type DeletionMode = 'gone' | 'merged';

async function collectBranchDeletions(
  projectsStore: ProjectsStore,
  gitService: GitService,
  mode: DeletionMode,
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

async function selectGitProject(projectsStore: ProjectsStore, provider: GitViewProvider): Promise<void> {
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

function getSelectedGitProject(projectsStore: ProjectsStore, provider: GitViewProvider): Project | undefined {
  const projects = projectsStore.list().filter((project) => project.type === 'git');
  if (projects.length === 0) {
    return undefined;
  }
  const selectedId = provider.getSelectedProjectId();
  return projects.find((project) => project.id === selectedId) ?? projects[0];
}

function extractGitProject(
  projectsStore: ProjectsStore,
  provider: GitViewProvider,
  target?: unknown
): Project | undefined {
  if (target && isGitProjectNode(target)) {
    return target.project;
  }
  return getSelectedGitProject(projectsStore, provider);
}

function extractGitBranch(target: unknown): string | undefined {
  if (typeof target === 'string') {
    return target;
  }
  if (isGitBranchNode(target)) {
    return target.branch.name;
  }
  return undefined;
}

async function pickBrowserTarget(): Promise<BrowserTarget | undefined> {
  const options: Array<{ label: string; value: BrowserTarget; description?: string }> = [
    { label: 'Default Browser', value: 'default' },
    { label: 'Microsoft Edge', value: 'edge', description: 'Windows/macOS/Linux (if installed)' },
    { label: 'Google Chrome', value: 'chrome' },
    { label: 'Chromium', value: 'chromium' },
    { label: 'Firefox', value: 'firefox' },
    { label: 'Firefox Developer Edition', value: 'firefox-dev', description: 'macOS name differs' }
  ];
  const pick = await vscode.window.showQuickPick(options, { placeHolder: 'Open in browser' });
  return pick?.value;
}

function extractPath(target: unknown): string | undefined {
  if (typeof target === 'string') {
    return target;
  }
  if (isPathNode(target)) {
    return target.path;
  }
  if (target instanceof vscode.Uri) {
    return target.fsPath;
  }
  if (isProjectEntry(target)) {
    return target.entry.path;
  }
  return undefined;
}

function resolveTargetPath(target: unknown): string | undefined {
  return extractPath(target) ?? vscode.window.activeTextEditor?.document.uri.fsPath;
}

async function resolveBaseDirectory(target: unknown): Promise<string | undefined> {
  const targetPath = resolveTargetPath(target);
  if (targetPath) {
    const stat = await statPath(targetPath);
    if (stat?.type === vscode.FileType.Directory) {
      return targetPath;
    }
    return path.dirname(targetPath);
  }
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 1) {
    return folders[0]?.uri.fsPath;
  }
  if (folders.length > 1) {
    const pick = await vscode.window.showQuickPick(
      folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
      { placeHolder: 'Select target folder' }
    );
    return pick?.folder.uri.fsPath;
  }
  vscode.window.showWarningMessage('ForgeFlow: No workspace folder available.');
  return undefined;
}

function isBrowserFile(filePath: string, extensions: string[]): boolean {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  if (!ext) {
    return false;
  }
  return extensions.some((value) => value.replace('.', '').toLowerCase() === ext);
}

function extractProject(target: unknown): Project | undefined {
  if (isProjectNode(target)) {
    return target.project;
  }
  if (isProject(target)) {
    return target;
  }
  return undefined;
}

function extractEntry(target: unknown): ProjectEntryPoint | undefined {
  if (isProjectEntry(target)) {
    return target.entry;
  }
  if (isEntryPoint(target)) {
    return target;
  }
  return undefined;
}

function hasKey(value: unknown, key: string): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && key in value;
}

function isPathNode(value: unknown): value is PathNode | ProjectNodeWithPath {
  return hasKey(value, 'path') && typeof value['path'] === 'string';
}

function isProjectNode(value: unknown): value is ProjectNodeWithProject {
  if (!hasKey(value, 'project')) {
    return false;
  }
  return isProject(value['project']);
}

function isProjectEntry(value: unknown): value is ProjectNodeWithEntry {
  if (!hasKey(value, 'entry')) {
    return false;
  }
  return isEntryPoint(value['entry']);
}

function isProject(value: unknown): value is Project {
  return hasKey(value, 'id')
    && hasKey(value, 'path')
    && typeof value['id'] === 'string'
    && typeof value['path'] === 'string';
}

function isEntryPoint(value: unknown): value is ProjectEntryPoint {
  return hasKey(value, 'path')
    && hasKey(value, 'label')
    && typeof value['path'] === 'string'
    && typeof value['label'] === 'string';
}

async function touchProjectActivity(
  document: vscode.TextDocument,
  store: ProjectsStore,
  provider: ProjectsViewProvider
): Promise<void> {
  if (document.uri.scheme !== 'file') {
    return;
  }
  const project = findProjectByPath(store.list(), document.uri.fsPath);
  if (!project) {
    return;
  }
  await store.updateLastActivity(project.id, Date.now());
  const settings = getForgeFlowSettings();
  if (settings.projectSortMode === 'lastActive') {
    await provider.refresh();
  }
}

function normalizeFsPath(value: string): string {
  if (process.platform === 'win32') {
    const match = /^\/([a-zA-Z]:)(\/.*)/.exec(value);
    if (match) {
      return `${match[1]}${match[2]}`.replace(/\//g, '\\');
    }
    return value.replace(/\//g, '\\');
  }
  return value;
}

async function resolveWorkingDirectory(filePath: string, projectPath?: string): Promise<string | undefined> {
  const candidates = [projectPath, path.dirname(filePath)].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const stat = await statPath(candidate);
    if (stat?.type === vscode.FileType.Directory) {
      return candidate;
    }
  }
  return undefined;
}
