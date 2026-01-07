import * as path from 'path';
import * as vscode from 'vscode';
import { DashboardService } from './dashboard/dashboardService';
import { ProjectScanner } from './scan/projectScanner';
import { RunService } from './run/runService';
import { TerminalManager } from './run/terminalManager';
import { FavoritesStore } from './store/favoritesStore';
import { ProjectsStore } from './store/projectsStore';
import { StateStore } from './store/stateStore';
import { FilesViewProvider, PathNode } from './views/filesView';
import {
  ProjectNodeWithEntry,
  ProjectNodeWithPath,
  ProjectNodeWithProject,
  ProjectsViewProvider
} from './views/projectsView';
import { DashboardViewProvider } from './views/dashboardView';
import { ForgeFlowLogger } from './util/log';
import type { Project, ProjectEntryPoint } from './models/project';
import { statPath } from './util/fs';
import type { RunTarget } from './models/run';
import { builtInProfiles } from './run/powershellProfiles';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = new ForgeFlowLogger();
  const stateStore = new StateStore(context);
  const favoritesStore = new FavoritesStore(stateStore);
  const projectsStore = new ProjectsStore(stateStore);
  const terminalManager = new TerminalManager();
  const runService = new RunService(logger, favoritesStore, projectsStore, terminalManager);
  const scanner = new ProjectScanner();

  const filesProvider = new FilesViewProvider(favoritesStore);
  const projectsProvider = new ProjectsViewProvider(projectsStore, scanner);
  const dashboardService = new DashboardService(projectsStore, logger);
  const dashboardProvider = new DashboardViewProvider(dashboardService, logger);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('forgeflow.files', filesProvider),
    vscode.window.registerTreeDataProvider('forgeflow.projects', projectsProvider),
    vscode.window.registerWebviewViewProvider('forgeflow.dashboard', dashboardProvider),
    terminalManager
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('forgeflow.files.open', async (target?: unknown) => {
      const filePath = extractPath(target);
      if (filePath) {
        await openPath(filePath);
      }
    }),
    vscode.commands.registerCommand('forgeflow.files.revealInOs', async (target?: unknown) => {
      const filePath = extractPath(target);
      if (filePath) {
        await revealPath(filePath);
      }
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
    vscode.commands.registerCommand('forgeflow.dashboard.open', async () => {
      await vscode.commands.executeCommand('workbench.action.openView', 'forgeflow.dashboard');
    }),
    vscode.commands.registerCommand('forgeflow.dashboard.refresh', async () => {
      await dashboardProvider.refresh();
    }),
    vscode.commands.registerCommand('forgeflow.dashboard.configureIdentity', async () => {
      await configureProjectIdentity(projectsStore, dashboardProvider);
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

async function revealPath(targetPath: string): Promise<void> {
  await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(targetPath));
}

async function pinFavorite(targetPath: string, store: FavoritesStore): Promise<void> {
  const stat = await statPath(targetPath);
  const kind = stat?.type === vscode.FileType.Directory ? 'folder' : 'file';
  await store.add({ path: targetPath, kind });
}

async function openProject(project: Project, store: ProjectsStore): Promise<void> {
  await store.updateLastOpened(project.id, Date.now());
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(project.path), false);
}

async function runPath(
  inputPath: string | undefined,
  runService: RunService,
  projectsStore: ProjectsStore,
  target: RunTarget | undefined,
  profileId?: string
): Promise<void> {
  const filePath = inputPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
  if (!filePath) {
    vscode.window.showWarningMessage('ForgeFlow: No file selected to run.');
    return;
  }

  if (path.extname(filePath).toLowerCase() !== '.ps1') {
    vscode.window.showWarningMessage('ForgeFlow: Only .ps1 scripts can be run.');
    return;
  }

  const project = findProjectByPath(projectsStore.list(), filePath);
  const workingDirectory = project?.path ?? path.dirname(filePath);
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
  return projects.find((project) => isWithin(project.path, resolved));
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

  const githubRepo = await vscode.window.showInputBox({
    prompt: 'GitHub repo (owner/name). Leave blank to skip.',
    value: pick.project.identity?.githubRepo ?? ''
  });

  if (githubRepo === undefined) {
    return;
  }

  const powershellModule = await vscode.window.showInputBox({
    prompt: 'PowerShell Gallery module name. Leave blank to skip.',
    value: pick.project.identity?.powershellModule ?? ''
  });

  if (powershellModule === undefined) {
    return;
  }

  const nugetPackage = await vscode.window.showInputBox({
    prompt: 'NuGet package name. Leave blank to skip.',
    value: pick.project.identity?.nugetPackage ?? ''
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
  return hasKey(value, 'path') && typeof value.path === 'string';
}

function isProjectNode(value: unknown): value is ProjectNodeWithProject {
  if (!hasKey(value, 'project')) {
    return false;
  }
  return isProject(value.project);
}

function isProjectEntry(value: unknown): value is ProjectNodeWithEntry {
  if (!hasKey(value, 'entry')) {
    return false;
  }
  return isEntryPoint(value.entry);
}

function isProject(value: unknown): value is Project {
  return hasKey(value, 'id') && hasKey(value, 'path') && typeof value.id === 'string' && typeof value.path === 'string';
}

function isEntryPoint(value: unknown): value is ProjectEntryPoint {
  return hasKey(value, 'path') && hasKey(value, 'label') && typeof value.path === 'string' && typeof value.label === 'string';
}
