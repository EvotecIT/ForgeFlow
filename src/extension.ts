import * as path from 'path';
import * as vscode from 'vscode';
import { DashboardService } from './dashboard/dashboardService';
import { DashboardCache } from './dashboard/cache';
import { DashboardTokenStore } from './dashboard/tokenStore';
import { DashboardFilterStore } from './dashboard/filterStore';
import { DashboardViewStateStore } from './dashboard/viewStateStore';
import { GitService } from './git/gitService';
import { buildProjectSummary, type GitProjectSummary } from './git/gitSummary';
import { GitStore, type GitProjectSettings } from './git/gitStore';
import { GitWatchService } from './git/gitWatchService';
import { ProjectScanner } from './scan/projectScanner';
import { RunService } from './run/runService';
import { TerminalManager } from './run/terminalManager';
import { FavoritesStore } from './store/favoritesStore';
import { FilesFilterStore } from './store/filesFilterStore';
import { ProjectsStore } from './store/projectsStore';
import { TagsStore } from './store/tagsStore';
import { TagFilterStore } from './store/tagFilterStore';
import { FilterPresetStore } from './store/filterPresetStore';
import { GitCommitCacheStore } from './store/gitCommitCacheStore';
import { RunHistoryStore } from './store/runHistoryStore';
import { StateStore } from './store/stateStore';
import { LayoutStore } from './store/layoutStore';
import { GitFilterStore } from './store/gitFilterStore';
import { FilesViewProvider } from './views/filesView';
import { FilesDragAndDropController } from './views/filesDragAndDrop';
import { ProjectsViewProvider } from './views/projectsView';
import { ProjectsWebviewProvider } from './views/projectsWebview';
import { PowerForgeViewProvider } from './views/powerforge';
import { DashboardViewProvider } from './views/dashboardView';
import { GitViewProvider, isGitBranchNode, isGitProjectNode } from './views/gitView';
import { ForgeFlowLogger } from './util/log';
import type { Project, ProjectEntryPoint } from './models/project';
import type { RunHistoryEntry, RunPreset, RunTarget } from './models/run';
import { getAllProfiles, profileKindIcon, profileKindLabel } from './run/powershellProfiles';
import type { PowerShellProfile } from './models/run';
import { renderCommandTemplate, quoteShellArg } from './run/runByFile';
import { buildPresetFromEntry } from './run/runPresets';
import { detectProjectIdentity } from './scan/identityDetector';
import type { SortDirection } from './util/config';
import { getForgeFlowSettings } from './util/config';
import { pathExists, readDirectory, statPath } from './util/fs';
import { openFileInBrowser, openFileInDefaultApp, openInVisualStudio } from './util/open';
import { baseName } from './util/path';
import { maybeRunOnboarding, openForgeFlowSelectedViews, runOnboarding } from './onboarding/onboarding';
import { registerToggleQuotes } from './editor/toggleQuotes';
import { registerUnicodeSubstitutions } from './editor/unicodeSubstitutions';
import { stableIdFromPath } from './util/ids';
import {
  ensureCustomBrowserPath,
  isBrowserFile,
  pickBrowserTarget,
  pickExecutablePath
} from './extension/browserUtils';
import {
  buildFilterMessage,
  deleteFilterPreset,
  formatScopeLabel,
  openLiveFilterInput,
  pickFilterPreset,
  saveFilterPreset,
  setTreeViewMessage,
  toggleFilterScope
} from './extension/filters';
import {
  extractEntry,
  extractHistoryEntry,
  extractPath,
  extractPreset,
  extractProject,
  getActiveEditorPath,
  isProjectHistory,
  isProjectPreset,
  resolveTargetPath
} from './extension/selection';
import { normalizeFsPath } from './extension/pathUtils';
import {
  findProjectByPath,
  pickProject,
  resolveProjectFromTarget
} from './extension/projectUtils';
import { registerFileCommands } from './extension/commands/files';
import { registerProjectCommands } from './extension/commands/projects';
import { openProject } from './extension/projects/actions';

let runByFileTerminal: vscode.Terminal | undefined;
let powerForgeTerminal: vscode.Terminal | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = new ForgeFlowLogger();
  const stateStore = new StateStore(context);
  const favoritesStore = new FavoritesStore(stateStore);
  const filesFilterStore = new FilesFilterStore(stateStore);
  const projectsStore = new ProjectsStore(stateStore);
  const tagsStore = new TagsStore(stateStore);
  const tagFilterStore = new TagFilterStore(stateStore);
  const filterPresetStore = new FilterPresetStore(stateStore);
  const gitCommitCacheStore = new GitCommitCacheStore(stateStore);
  const runHistoryStore = new RunHistoryStore(stateStore);
  const layoutStore = new LayoutStore(stateStore);
  const terminalManager = new TerminalManager();
  const runService = new RunService(logger, favoritesStore, projectsStore, terminalManager);
  const scanner = new ProjectScanner();
  const tokenStore = new DashboardTokenStore(context);
  const dashboardCache = new DashboardCache(stateStore);
  const dashboardFilterStore = new DashboardFilterStore(stateStore);
  const dashboardViewStateStore = new DashboardViewStateStore(stateStore);
  const gitStore = new GitStore(stateStore);
  const gitFilterStore = new GitFilterStore(stateStore);
  const gitService = new GitService(logger);
  const gitWatchService = new GitWatchService(projectsStore, gitCommitCacheStore, logger);
  const layoutMode = layoutStore.getMode();
  void vscode.commands.executeCommand('setContext', 'forgeflow.layout', layoutMode);
  let filesRefreshTimer: NodeJS.Timeout | undefined;
  const scheduleFilesRefresh = (): void => {
    if (filesRefreshTimer) {
      clearTimeout(filesRefreshTimer);
    }
    filesRefreshTimer = setTimeout(() => {
      filesProvider.refresh();
    }, 200);
  };
  const shouldIgnoreFileEvent = (uri: vscode.Uri): boolean => {
    const fsPath = uri.fsPath;
    const gitSegment = `${path.sep}.git${path.sep}`;
    return fsPath === `${path.sep}.git`
      || fsPath.endsWith(`${path.sep}.git`)
      || fsPath.includes(gitSegment);
  };
  const fileWatchers = new Map<string, vscode.FileSystemWatcher>();
  const syncFileWatchers = (): void => {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const activeRoots = new Set<string>();
    for (const folder of folders) {
      const key = folder.uri.fsPath;
      activeRoots.add(key);
      if (fileWatchers.has(key)) {
        continue;
      }
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '**/*'));
      watcher.onDidCreate((uri) => {
        if (!shouldIgnoreFileEvent(uri)) {
          scheduleFilesRefresh();
        }
      });
      watcher.onDidChange((uri) => {
        if (!shouldIgnoreFileEvent(uri)) {
          scheduleFilesRefresh();
        }
      });
      watcher.onDidDelete((uri) => {
        if (!shouldIgnoreFileEvent(uri)) {
          scheduleFilesRefresh();
        }
      });
      fileWatchers.set(key, watcher);
      context.subscriptions.push(watcher);
    }

    for (const [key, watcher] of fileWatchers.entries()) {
      if (!activeRoots.has(key)) {
        watcher.dispose();
        fileWatchers.delete(key);
      }
    }
  };

  const filesProvider = new FilesViewProvider(favoritesStore, filesFilterStore);
  const filesDragAndDrop = new FilesDragAndDropController();
  const projectsProvider = new ProjectsViewProvider(
    projectsStore,
    scanner,
    gitStore,
    gitCommitCacheStore,
    tagsStore,
    tagFilterStore,
    runHistoryStore
  );
  const dashboardService = new DashboardService(projectsStore, logger, tokenStore, tagsStore);
  const dashboardProvider = new DashboardViewProvider(
    dashboardService,
    logger,
    dashboardCache,
    dashboardFilterStore,
    tokenStore,
    dashboardViewStateStore,
    tagFilterStore
  );
  const gitProvider = new GitViewProvider(projectsStore, gitService, gitStore, gitFilterStore, logger);
  const projectsWebviewProvider = new ProjectsWebviewProvider(projectsProvider, projectsStore, dashboardProvider);
  const projectsWebviewPanelProvider = new ProjectsWebviewProvider(projectsProvider, projectsStore, dashboardProvider);
  const powerForgeViewProvider = new PowerForgeViewProvider(context, projectsStore);
  const powerForgePanelProvider = new PowerForgeViewProvider(context, projectsStore);

  const filesView = vscode.window.createTreeView('forgeflow.files', {
    treeDataProvider: filesProvider,
    canSelectMany: true,
    dragAndDropController: filesDragAndDrop
  });
  const filesPanelView = vscode.window.createTreeView('forgeflow.files.panel', {
    treeDataProvider: filesProvider,
    canSelectMany: true,
    dragAndDropController: filesDragAndDrop
  });
  const projectsView = vscode.window.createTreeView('forgeflow.projects', { treeDataProvider: projectsProvider });
  const projectsPanelView = vscode.window.createTreeView('forgeflow.projects.panel', { treeDataProvider: projectsProvider });
  const gitView = vscode.window.createTreeView('forgeflow.git', { treeDataProvider: gitProvider });
  const gitPanelView = vscode.window.createTreeView('forgeflow.git.panel', { treeDataProvider: gitProvider });

  const openSelectionTimers = new Map<string, NodeJS.Timeout>();
  const openSelectionDelayMs = 150;

  const clearOpenSelectionTimer = (viewId: string): void => {
    const timer = openSelectionTimers.get(viewId);
    if (timer) {
      clearTimeout(timer);
      openSelectionTimers.delete(viewId);
    }
  };

  const getFilesViewById = (viewId: string): vscode.TreeView<unknown> | undefined => {
    switch (viewId) {
      case 'forgeflow.files':
        return filesView;
      case 'forgeflow.files.panel':
        return filesPanelView;
      default:
        return undefined;
    }
  };

  const scheduleOpenOnSelection = (viewId: string, selection: readonly unknown[]): void => {
    clearOpenSelectionTimer(viewId);
    if (!getForgeFlowSettings().filesOpenOnSelection) {
      return;
    }
    if (selection.length !== 1) {
      return;
    }
    const candidatePath = extractPath(selection[0]);
    if (!candidatePath) {
      return;
    }
    const timer = setTimeout(async () => {
      openSelectionTimers.delete(viewId);
      const view = getFilesViewById(viewId);
      if (!view?.visible) {
        return;
      }
      const activeSelection = view.selection;
      if (activeSelection.length !== 1) {
        return;
      }
      const activePath = extractPath(activeSelection[0]);
      if (!activePath || normalizeFsPath(activePath) !== normalizeFsPath(candidatePath)) {
        return;
      }
      const stat = await statPath(candidatePath);
      if (stat?.type !== vscode.FileType.File) {
        return;
      }
      const activeEditorPath = getActiveEditorPath();
      if (activeEditorPath && normalizeFsPath(activeEditorPath) === normalizeFsPath(candidatePath)) {
        return;
      }
      await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(candidatePath), {
        preview: true,
        preserveFocus: true
      });
    }, openSelectionDelayMs);
    openSelectionTimers.set(viewId, timer);
  };

  context.subscriptions.push(
    filesView.onDidChangeSelection((event) => {
      scheduleOpenOnSelection('forgeflow.files', event.selection);
    }),
    filesPanelView.onDidChangeSelection((event) => {
      scheduleOpenOnSelection('forgeflow.files.panel', event.selection);
    })
  );

  const updateFilesFilterMessage = (): void => {
    const settings = getForgeFlowSettings();
    const message = buildFilterMessage({
      filterText: filesProvider.getFilter(),
      minChars: settings.filtersFilesMinChars,
      focusCommand: 'forgeflow.files.focusFilter',
      clearCommand: 'forgeflow.files.clearFilter',
      scopeLabel: formatScopeLabel(settings.filtersScope)
    });
    setTreeViewMessage([filesView, filesPanelView], message);
  };
  const updateProjectsFilterMessage = (): void => {
    const settings = getForgeFlowSettings();
    const tags = projectsProvider.getTagFilter();
    const message = buildFilterMessage({
      filterText: projectsProvider.getFilter(),
      minChars: settings.filtersProjectsMinChars,
      focusCommand: 'forgeflow.projects.focusFilter',
      clearCommand: 'forgeflow.projects.clearFilter',
      scopeLabel: formatScopeLabel(settings.filtersScope),
      extraText: tags.length > 0 ? `Tags: ${tags.join(', ')}` : undefined,
      extraClearCommand: tags.length > 0 ? 'forgeflow.tags.clearFilter' : undefined
    });
    setTreeViewMessage([projectsView, projectsPanelView], message);
  };
  const updateGitFilterMessage = (): void => {
    const settings = getForgeFlowSettings();
    const message = buildFilterMessage({
      filterText: gitProvider.getFilter(),
      minChars: settings.filtersGitMinChars,
      focusCommand: 'forgeflow.git.focusFilter',
      clearCommand: 'forgeflow.git.clearFilter',
      scopeLabel: formatScopeLabel(settings.filtersScope)
    });
    setTreeViewMessage([gitView, gitPanelView], message);
  };

  updateFilesFilterMessage();
  updateProjectsFilterMessage();
  updateGitFilterMessage();

  const computeProjectsSyncKey = (): string => {
    const scanMeta = projectsStore.getScanMeta();
    const sortOrder = projectsStore.getSortOrder();
    const favorites = projectsStore.getFavoriteIds();
    const projects = projectsStore.list();
    let maxTimestamp = 0;
    for (const project of projects) {
      const candidates = [
        project.lastModified,
        project.lastGitCommit,
        project.lastActivity,
        project.lastOpened
      ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      for (const value of candidates) {
        if (value > maxTimestamp) {
          maxTimestamp = value;
        }
      }
    }
    return [
      scanMeta?.fetchedAt ?? 0,
      sortOrder?.savedAt ?? 0,
      favorites.join('|'),
      projects.length,
      maxTimestamp
    ].join('::');
  };

  let lastProjectsSyncKey = computeProjectsSyncKey();
  const syncProjectsAcrossWindows = async (): Promise<void> => {
    const nextKey = computeProjectsSyncKey();
    if (nextKey === lastProjectsSyncKey) {
      return;
    }
    lastProjectsSyncKey = nextKey;
    await projectsProvider.refresh(false);
    await projectsWebviewProvider.refresh();
    await projectsWebviewPanelProvider.refresh();
    await gitProvider.refresh();
  };

  const syncIntervalMs = 30_000;
  const syncTimer = setInterval(() => {
    void syncProjectsAcrossWindows();
  }, syncIntervalMs);
  context.subscriptions.push({ dispose: () => clearInterval(syncTimer) });
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) {
        void syncProjectsAcrossWindows();
      }
    })
  );

  syncFileWatchers();

  context.subscriptions.push(
    filesProvider.onDidChangeTreeData(() => updateFilesFilterMessage()),
    projectsProvider.onDidChangeTreeData(() => updateProjectsFilterMessage()),
    gitProvider.onDidChangeTreeData(() => updateGitFilterMessage())
  );

  context.subscriptions.push(
    filesView,
    filesPanelView,
    projectsView,
    projectsPanelView,
    gitView,
    gitPanelView,
    vscode.window.registerWebviewViewProvider('forgeflow.dashboard', dashboardProvider),
    vscode.window.registerWebviewViewProvider('forgeflow.projects.web', projectsWebviewProvider),
    vscode.window.registerWebviewViewProvider('forgeflow.projects.web.panel', projectsWebviewPanelProvider),
    vscode.window.registerWebviewViewProvider('forgeflow.powerforge', powerForgeViewProvider),
    vscode.window.registerWebviewViewProvider('forgeflow.powerforge.panel', powerForgePanelProvider),
    terminalManager,
    runService,
    gitWatchService,
    runHistoryStore
  );

  registerToggleQuotes(context);
  registerUnicodeSubstitutions(context);
  context.subscriptions.push(
    runHistoryStore.onDidChange(() => {
      projectsProvider.refresh();
      void projectsWebviewProvider.refresh();
      void projectsWebviewPanelProvider.refresh();
    })
  );
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((terminal) => {
      if (terminal === runByFileTerminal) {
        runByFileTerminal = undefined;
      }
      if (terminal === powerForgeTerminal) {
        powerForgeTerminal = undefined;
      }
    })
  );

  projectsProvider.onDidUpdateProjects((projects) => {
    gitWatchService.setProjects(projects, projectsStore.getFavoriteIds());
    void projectsWebviewProvider.refresh();
    void projectsWebviewPanelProvider.refresh();
  });
  dashboardProvider.onDidChangeTagFilter(async (tags) => {
    await projectsProvider.setTagFilter(tags, false);
  });
  gitWatchService.onDidUpdate((update) => {
    projectsProvider.applyGitCommitUpdate(update.projectId, update.lastGitCommit);
    void projectsWebviewProvider.refresh();
    void projectsWebviewPanelProvider.refresh();
  });
  gitWatchService.setProjects(projectsStore.list(), projectsStore.getFavoriteIds());
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('forgeflow.projects.gitWatch')
        || event.affectsConfiguration('forgeflow.projects.gitWatchMaxRepos')
        || event.affectsConfiguration('forgeflow.projects.gitWatchDebounceMs')) {
        gitWatchService.refresh();
      }
      if (event.affectsConfiguration('forgeflow.filters')) {
        updateFilesFilterMessage();
        updateProjectsFilterMessage();
        updateGitFilterMessage();
        void projectsWebviewProvider.refresh();
        void projectsWebviewPanelProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCreateFiles(() => scheduleFilesRefresh()),
    vscode.workspace.onDidDeleteFiles(() => scheduleFilesRefresh()),
    vscode.workspace.onDidRenameFiles(() => scheduleFilesRefresh()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      syncFileWatchers();
      scheduleFilesRefresh();
    })
  );

  registerFileCommands({
    context,
    filesProvider,
    filesView,
    filesPanelView,
    projectsProvider,
    favoritesStore,
    filterPresetStore
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('forgeflow.filters.toggleScope', async () => {
      await toggleFilterScope(filesProvider, projectsProvider, gitProvider, dashboardProvider, dashboardFilterStore, tagFilterStore);
    })
  );

  registerProjectCommands({
    context,
    projectsProvider,
    projectsWebviewProvider,
    projectsWebviewPanelProvider,
    projectsStore,
    tagsStore,
    tagFilterStore,
    filterPresetStore,
    dashboardProvider
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('forgeflow.projects.run', async (target?: unknown) => {
      const project = resolveProjectFromTarget(target, projectsStore);
      if (!project) {
        return;
      }
      await runProjectEntryPoint(project, projectsProvider, runService, projectsStore, favoritesStore, runHistoryStore);
    }),
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
    vscode.commands.registerCommand('forgeflow.powerforge.plan', async (target?: unknown) => {
      await runPowerForgePipeline('plan', target, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.powerforge.pipeline', async (target?: unknown) => {
      await runPowerForgePipeline('pipeline', target, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.powerforge.dotnetPublish', async (target?: unknown) => {
      await runPowerForgeDotNetPublish('publish', target, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.powerforge.dotnetPublish.plan', async (target?: unknown) => {
      await runPowerForgeDotNetPublish('plan', target, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.powerforge.dotnetPublish.validate', async (target?: unknown) => {
      await runPowerForgeDotNetPublish('validate', target, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.powerforge.refresh', async () => {
      await powerForgeViewProvider.refresh();
      await powerForgePanelProvider.refresh();
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
      if (browser === 'custom') {
        const ok = await ensureCustomBrowserPath();
        if (!ok) {
          return;
        }
      }
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
      if (browser === 'custom') {
        const ok = await ensureCustomBrowserPath();
        if (!ok) {
          return;
        }
      }
      await openFileInBrowser(filePath, browser);
    }),
    vscode.commands.registerCommand('forgeflow.openInBrowser.setPreferred', async () => {
      const browser = await pickBrowserTarget();
      if (!browser) {
        return;
      }
      const config = vscode.workspace.getConfiguration('forgeflow');
      if (browser === 'custom') {
        const ok = await ensureCustomBrowserPath();
        if (!ok) {
          return;
        }
      }
      await config.update('browser.preferred', browser, vscode.ConfigurationTarget.Global);
      vscode.window.setStatusBarMessage('ForgeFlow: Preferred browser updated.', 3000);
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
      await powerForgeViewProvider.refresh();
      await powerForgePanelProvider.refresh();
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

  let onboardingRequested = false;
  const requestOnboarding = (): void => {
    if (onboardingRequested) {
      return;
    }
    onboardingRequested = true;
    void maybeRunOnboarding(stateStore, context);
  };
  const registerOnboardingOnVisible = (view: vscode.TreeView<unknown>): void => {
    context.subscriptions.push(
      view.onDidChangeVisibility((event) => {
        if (event.visible) {
          requestOnboarding();
        }
      })
    );
  };
  registerOnboardingOnVisible(filesView);
  registerOnboardingOnVisible(filesPanelView);
  registerOnboardingOnVisible(projectsView);
  registerOnboardingOnVisible(projectsPanelView);
  registerOnboardingOnVisible(gitView);
  registerOnboardingOnVisible(gitPanelView);
  await projectsProvider.refresh();
  logger.info('ForgeFlow activated.');
}

export function deactivate(): void {
  // handled by disposables
}

async function runProjectEntryPoint(
  project: Project,
  projectsProvider: ProjectsViewProvider,
  runService: RunService,
  projectsStore: ProjectsStore,
  favoritesStore: FavoritesStore,
  runHistoryStore: RunHistoryStore
): Promise<void> {
  const groups = await projectsProvider.getEntryPointGroups(project);
  const entries = [...groups.entryPoints, ...groups.buildScripts];
  const runnable = entries.filter((entry) => {
    const ext = path.extname(entry.path).toLowerCase();
    return entry.kind === 'task' || ext === '.ps1' || ext === '.cs';
  });
  if (runnable.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: No runnable entry points found (.ps1, .cs, or tasks).');
    return;
  }
  const pick = await vscode.window.showQuickPick(
    runnable.map((entry) => ({
      label: entry.label,
      description: entry.kind === 'task' ? entry.task?.type ?? 'task' : entry.path,
      entry
    })),
    { placeHolder: `Run entry point for ${project.name}` }
  );
  if (!pick) {
    return;
  }
  if (pick.entry.kind === 'task') {
    await runTaskEntryPoint(pick.entry, project, runHistoryStore);
    return;
  }
  await runPath(pick.entry.path, runService, projectsStore, favoritesStore, runHistoryStore, undefined);
}

async function toggleLayout(layoutStore: LayoutStore): Promise<void> {
  const current = layoutStore.getMode();
  const next = current === 'compact' ? 'expanded' : 'compact';
  await layoutStore.setMode(next);
  await vscode.commands.executeCommand('setContext', 'forgeflow.layout', next);
  vscode.window.setStatusBarMessage(`ForgeFlow layout: ${next}`, 2000);
}

async function runPath(
  inputPath: string | undefined,
  runService: RunService,
  projectsStore: ProjectsStore,
  favoritesStore: FavoritesStore,
  runHistoryStore: RunHistoryStore,
  target: RunTarget | undefined,
  profileId?: string
): Promise<void> {
  const filePathRaw = inputPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
  const filePath = filePathRaw ? normalizeFsPath(filePathRaw) : undefined;
  if (!filePath) {
    vscode.window.showWarningMessage('ForgeFlow: No file selected to run.');
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  if (extension !== '.ps1') {
    const settings = getForgeFlowSettings();
    if (settings.runByFileEnabled) {
      const handled = await runByFile(filePath, projectsStore, settings, runHistoryStore);
      if (handled) {
        return;
      }
    }
    vscode.window.showWarningMessage('ForgeFlow: Only .ps1 scripts can be run (enable run-by-file to run other types).');
    return;
  }

  const project = findProjectByPath(projectsStore.list(), filePath);
  const projectPath = project ? normalizeFsPath(project.path) : undefined;
  const preferredWorkingDirectory = project?.preferredRunWorkingDirectory;
  const workingDirectory = await resolveWorkingDirectory(filePath, projectPath, preferredWorkingDirectory);
  if (project) {
    await projectsStore.updateLastActivity(project.id, Date.now());
  }
  const resolvedTarget = target ?? project?.preferredRunTarget;
  await runService.run({
    filePath,
    workingDirectory,
    projectId: project?.id,
    profileId,
    target: resolvedTarget
  });

  await recordPowerShellRunHistory({
    filePath,
    workingDirectory,
    project,
    favoritesStore,
    projectsStore,
    runHistoryStore,
    target: resolvedTarget,
    profileId
  });
}

async function recordPowerShellRunHistory(options: {
  filePath: string;
  workingDirectory?: string;
  project?: Project;
  favoritesStore: FavoritesStore;
  projectsStore: ProjectsStore;
  runHistoryStore: RunHistoryStore;
  target?: RunTarget;
  profileId?: string;
}): Promise<void> {
  const settings = getForgeFlowSettings();
  const resolvedProfileId = resolveProfileIdForHistory(
    options.filePath,
    options.project,
    options.profileId,
    options.favoritesStore,
    settings
  );
  const entry: RunHistoryEntry = {
    id: buildRunHistoryId(),
    kind: 'powershell',
    label: baseName(options.filePath),
    timestamp: Date.now(),
    filePath: options.filePath,
    workingDirectory: options.workingDirectory,
    projectId: options.project?.id,
    profileId: resolvedProfileId,
    target: options.target ?? settings.runDefaultTarget
  };
  await options.runHistoryStore.add(entry, getRunHistoryMaxItems());
}

async function recordCommandRunHistory(
  runHistoryStore: RunHistoryStore,
  options: { filePath: string; command: string; workingDirectory?: string; projectId?: string; label: string }
): Promise<void> {
  const entry: RunHistoryEntry = {
    id: buildRunHistoryId(),
    kind: 'command',
    label: options.label,
    timestamp: Date.now(),
    filePath: options.filePath,
    command: options.command,
    workingDirectory: options.workingDirectory,
    projectId: options.projectId
  };
  await runHistoryStore.add(entry, getRunHistoryMaxItems());
}

async function runByFile(
  filePath: string,
  projectsStore: ProjectsStore,
  settings: ReturnType<typeof getForgeFlowSettings>,
  runHistoryStore: RunHistoryStore
): Promise<boolean> {
  const extension = path.extname(filePath).toLowerCase();
  if (extension !== '.cs') {
    return false;
  }

  const project = findProjectByPath(projectsStore.list(), filePath);
  if (project) {
    await projectsStore.updateLastActivity(project.id, Date.now());
  }
  const resolution = await resolveDotnetProjectFile(filePath, project?.path);
  if (resolution?.projectFile) {
    const command = renderCommandTemplate(settings.runByFileCsProjectCommand, {
      file: filePath,
      project: resolution.projectFile,
      projectDir: path.dirname(resolution.projectFile)
    });
    await runShellCommand(command, path.dirname(resolution.projectFile), settings.runByFileReuseTerminal);
    await recordCommandRunHistory(runHistoryStore, {
      filePath,
      command,
      workingDirectory: path.dirname(resolution.projectFile),
      projectId: project?.id,
      label: `${path.basename(filePath)} (csproj)`
    });
    return true;
  }
  if (resolution?.solutionFile) {
    const command = renderCommandTemplate(settings.runByFileCsSolutionCommand, {
      file: filePath,
      project: resolution.solutionFile,
      projectDir: path.dirname(resolution.solutionFile)
    });
    await runShellCommand(command, path.dirname(resolution.solutionFile), settings.runByFileReuseTerminal);
    await recordCommandRunHistory(runHistoryStore, {
      filePath,
      command,
      workingDirectory: path.dirname(resolution.solutionFile),
      projectId: project?.id,
      label: `${path.basename(filePath)} (sln)`
    });
    return true;
  }

  if (settings.runByFileCsScriptEnabled) {
    const command = renderCommandTemplate(settings.runByFileCsScriptCommand, {
      file: filePath,
      project: '',
      projectDir: path.dirname(filePath)
    });
    await runShellCommand(command, path.dirname(filePath), settings.runByFileReuseTerminal);
    await recordCommandRunHistory(runHistoryStore, {
      filePath,
      command,
      workingDirectory: path.dirname(filePath),
      projectId: project?.id,
      label: `${path.basename(filePath)} (script)`
    });
    return true;
  }

  vscode.window.showWarningMessage('ForgeFlow: No .csproj or .sln found. Enable .cs script runs or open a project.');
  return true;
}

async function resolveDotnetProjectFile(
  filePath: string,
  projectRoot?: string
): Promise<{ projectFile?: string; solutionFile?: string } | undefined> {
  const workspaceRoot = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))?.uri.fsPath;
  const root = projectRoot ?? workspaceRoot;
  if (!root) {
    return undefined;
  }
  let current = path.dirname(filePath);
  let foundSolution: string | undefined;
  while (true) {
    const entries = await readDirectory(current);
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File) {
        continue;
      }
      if (name.toLowerCase().endsWith('.csproj')) {
        return { projectFile: path.join(current, name) };
      }
      if (!foundSolution && name.toLowerCase().endsWith('.sln')) {
        foundSolution = path.join(current, name);
      }
    }
    if (normalizeFsPath(current) === normalizeFsPath(root)) {
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return foundSolution ? { solutionFile: foundSolution } : undefined;
}

async function runShellCommand(command: string, workingDirectory: string | undefined, reuseTerminal: boolean): Promise<void> {
  const terminal = getRunByFileTerminal(reuseTerminal, workingDirectory);
  terminal.show(true);
  if (workingDirectory && reuseTerminal) {
    terminal.sendText(`cd ${quoteShellArg(workingDirectory)}`, true);
  }
  terminal.sendText(command, true);
}

async function runPowerForgePipeline(
  mode: 'plan' | 'pipeline',
  target: unknown,
  projectsStore: ProjectsStore
): Promise<void> {
  const resolved = await resolvePowerForgeConfig('pipeline', target, projectsStore);
  if (!resolved) {
    return;
  }
  const { configPath, projectRoot } = resolved;
  const launcher = await resolvePowerForgeLauncher(projectRoot);
  const args = [
    mode,
    '--config',
    configPath,
    '--output',
    'json'
  ];
  if (projectRoot) {
    args.push('--project-root', projectRoot);
  }
  const commandLine = buildShellCommandLine(launcher.command, [...launcher.args, ...args]);
  await runPowerForgeCommand(commandLine, projectRoot ?? path.dirname(configPath));
}

async function runPowerForgeDotNetPublish(
  mode: 'publish' | 'plan' | 'validate',
  target: unknown,
  projectsStore: ProjectsStore
): Promise<void> {
  const resolved = await resolvePowerForgeConfig('dotnetpublish', target, projectsStore);
  if (!resolved) {
    return;
  }
  const { configPath, projectRoot } = resolved;
  const launcher = await resolvePowerForgeLauncher(projectRoot);
  const args = [
    'dotnet',
    'publish',
    '--config',
    configPath,
    '--output',
    'json'
  ];
  if (mode === 'plan') {
    args.push('--plan');
  } else if (mode === 'validate') {
    args.push('--validate');
  }
  if (projectRoot) {
    args.push('--project-root', projectRoot);
  }
  const commandLine = buildShellCommandLine(launcher.command, [...launcher.args, ...args]);
  await runPowerForgeCommand(commandLine, projectRoot ?? path.dirname(configPath));
}

type PowerForgeConfigKind = 'pipeline' | 'dotnetpublish';

interface PowerForgeConfigSelection {
  configPath: string;
  projectRoot?: string;
}

interface PowerForgeLauncher {
  command: string;
  args: string[];
}

const POWERFORGE_PIPELINE_CONFIGS = [
  'powerforge.json',
  'powerforge.pipeline.json',
  path.join('.powerforge', 'pipeline.json')
];
const POWERFORGE_DOTNETPUBLISH_CONFIGS = [
  'powerforge.dotnetpublish.json',
  'powerforge.dotnet.publish.json'
];

function isPowerForgePipelineConfig(filePath: string): boolean {
  const name = path.basename(filePath).toLowerCase();
  return name === 'powerforge.json' || name === 'powerforge.pipeline.json';
}

function isPowerForgeDotNetPublishConfig(filePath: string): boolean {
  const name = path.basename(filePath).toLowerCase();
  return name === 'powerforge.dotnetpublish.json' || name === 'powerforge.dotnet.publish.json';
}

async function resolvePowerForgeConfig(
  kind: PowerForgeConfigKind,
  target: unknown,
  projectsStore: ProjectsStore
): Promise<PowerForgeConfigSelection | undefined> {
  const targetPath = resolveTargetPath(target);
  let projectRoot = resolveProjectFromTarget(target, projectsStore)?.path;
  if (targetPath) {
    const stat = await statPath(targetPath);
    if (stat?.type === vscode.FileType.Directory) {
      if (!projectRoot) {
        projectRoot = targetPath;
      }
    } else if (stat?.type === vscode.FileType.File) {
      if (kind === 'pipeline' && isPowerForgePipelineConfig(targetPath)) {
        return { configPath: targetPath, projectRoot: projectRoot ?? path.dirname(targetPath) };
      }
      if (kind === 'dotnetpublish' && isPowerForgeDotNetPublishConfig(targetPath)) {
        return { configPath: targetPath, projectRoot: projectRoot ?? path.dirname(targetPath) };
      }
      if (!projectRoot) {
        projectRoot = path.dirname(targetPath);
      }
    }
  }

  if (!projectRoot) {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 1) {
      projectRoot = folders[0]?.uri.fsPath;
    } else if (folders.length > 1) {
      const pick = await vscode.window.showQuickPick(
        folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
        { placeHolder: 'Select workspace folder' }
      );
      projectRoot = pick?.folder.uri.fsPath;
    }
  }

  if (projectRoot) {
    const candidates = await findPowerForgeConfigsInRoot(projectRoot, kind);
    if (candidates.length === 1) {
      const only = candidates[0];
      if (only) {
        return { configPath: only, projectRoot };
      }
    }
    if (candidates.length > 1) {
      const pick = await vscode.window.showQuickPick(
        candidates.map((configPath) => ({
          label: path.basename(configPath),
          description: configPath,
          configPath
        })),
        { placeHolder: 'Select PowerForge config' }
      );
      return pick ? { configPath: pick.configPath, projectRoot } : undefined;
    }
  }

  const workspaceConfigs = await findPowerForgeConfigsInWorkspace(kind);
  if (workspaceConfigs.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: No PowerForge configuration found.');
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(
    workspaceConfigs.map((configPath) => ({
      label: path.basename(configPath),
      description: configPath,
      configPath
    })),
    { placeHolder: 'Select PowerForge config' }
  );
  if (!pick) {
    return undefined;
  }
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(pick.configPath));
  return { configPath: pick.configPath, projectRoot: folder?.uri.fsPath };
}

async function findPowerForgeConfigsInRoot(root: string, kind: PowerForgeConfigKind): Promise<string[]> {
  const names = kind === 'pipeline' ? POWERFORGE_PIPELINE_CONFIGS : POWERFORGE_DOTNETPUBLISH_CONFIGS;
  const results: string[] = [];
  for (const name of names) {
    const candidate = path.join(root, name);
    if (await pathExists(candidate)) {
      results.push(candidate);
    }
  }
  return results;
}

async function findPowerForgeConfigsInWorkspace(kind: PowerForgeConfigKind): Promise<string[]> {
  const patterns = kind === 'pipeline'
    ? ['**/powerforge.json', '**/powerforge.pipeline.json', '**/.powerforge/pipeline.json']
    : ['**/powerforge.dotnetpublish.json', '**/powerforge.dotnet.publish.json'];
  const exclude = '**/{node_modules,.git,Artifacts,Artefacts,bin,obj}/**';
  const uris = (
    await Promise.all(patterns.map((pattern) => vscode.workspace.findFiles(pattern, exclude)))
  ).flat();
  const unique = new Map<string, string>();
  for (const uri of uris) {
    unique.set(uri.fsPath, uri.fsPath);
  }
  return [...unique.values()];
}

async function resolvePowerForgeLauncher(projectRoot?: string): Promise<PowerForgeLauncher> {
  const settings = getForgeFlowSettings();
  const configured = settings.powerforgeCliPath?.trim();
  if (configured) {
    if (await pathExists(configured)) {
      return { command: configured, args: [] };
    }
    vscode.window.showWarningMessage(`ForgeFlow: PowerForge CLI path not found: ${configured}`);
  }

  if (projectRoot) {
    const artifact = await findPowerForgeBinary(projectRoot);
    if (artifact) {
      return { command: artifact, args: [] };
    }
    const cliProject = path.join(projectRoot, 'PowerForge.Cli', 'PowerForge.Cli.csproj');
    if (await pathExists(cliProject)) {
      return { command: 'dotnet', args: ['run', '--project', cliProject, '--'] };
    }
  }

  return { command: process.platform === 'win32' ? 'powerforge.exe' : 'powerforge', args: [] };
}

async function findPowerForgeBinary(projectRoot: string): Promise<string | undefined> {
  const base = path.join(projectRoot, 'Artifacts', 'PowerForge');
  if (!await pathExists(base)) {
    return undefined;
  }
  const targetName = process.platform === 'win32' ? 'powerforge.exe' : 'powerforge';
  return findFileRecursive(base, targetName, 4);
}

async function findFileRecursive(root: string, fileName: string, depth: number): Promise<string | undefined> {
  if (depth < 0) {
    return undefined;
  }
  const entries = await readDirectory(root);
  for (const [name, type] of entries) {
    const fullPath = path.join(root, name);
    if (type === vscode.FileType.File && name.toLowerCase() === fileName.toLowerCase()) {
      return fullPath;
    }
    if (type === vscode.FileType.Directory) {
      const found = await findFileRecursive(fullPath, fileName, depth - 1);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

function buildShellCommandLine(command: string, args: string[]): string {
  const needsQuote = /\s/.test(command);
  const commandPart = needsQuote
    ? (process.platform === 'win32' ? `& ${quoteShellArg(command)}` : quoteShellArg(command))
    : command;
  const parts = [commandPart, ...args.map((arg) => quoteShellArg(arg))];
  return parts.join(' ');
}

async function runPowerForgeCommand(commandLine: string, workingDirectory: string | undefined): Promise<void> {
  const terminal = getPowerForgeTerminal(workingDirectory);
  terminal.show(true);
  if (workingDirectory) {
    terminal.sendText(`cd ${quoteShellArg(workingDirectory)}`, true);
  }
  terminal.sendText(commandLine, true);
}

async function runLastHistoryEntry(
  runHistoryStore: RunHistoryStore,
  runService: RunService,
  projectsStore: ProjectsStore
): Promise<void> {
  const entries = runHistoryStore.list();
  const entry = entries[0];
  if (!entry) {
    vscode.window.showWarningMessage('ForgeFlow: Run history is empty.');
    return;
  }
  await runHistoryEntry(entry, runHistoryStore, runService, projectsStore);
}

async function runFromHistory(
  runHistoryStore: RunHistoryStore,
  runService: RunService,
  projectsStore: ProjectsStore
): Promise<void> {
  const entries = runHistoryStore.list();
  if (entries.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: Run history is empty.');
    return;
  }
  const pick = await vscode.window.showQuickPick(
    entries.map((entry) => ({
      label: entry.label,
      description: formatHistoryDescription(entry),
      detail: entry.filePath ?? entry.command ?? '',
      entry
    })),
    { placeHolder: 'Select a recent run' }
  );
  if (!pick) {
    return;
  }
  await runHistoryEntry(pick.entry, runHistoryStore, runService, projectsStore);
}

async function runHistoryEntry(
  entry: RunHistoryEntry,
  runHistoryStore: RunHistoryStore,
  runService: RunService,
  projectsStore: ProjectsStore
): Promise<void> {
  if (entry.kind === 'powershell' && entry.filePath) {
    await runService.run({
      filePath: entry.filePath,
      workingDirectory: entry.workingDirectory,
      projectId: entry.projectId,
      profileId: entry.profileId,
      target: entry.target
    });
    await runHistoryStore.add({ ...entry, id: buildRunHistoryId(), timestamp: Date.now() }, getRunHistoryMaxItems());
    return;
  }
  if (entry.kind === 'command' && entry.command) {
    await runShellCommand(entry.command, entry.workingDirectory, getForgeFlowSettings().runByFileReuseTerminal);
    await runHistoryStore.add({ ...entry, id: buildRunHistoryId(), timestamp: Date.now() }, getRunHistoryMaxItems());
    return;
  }
  if (entry.kind === 'task' && entry.taskName) {
    const project = entry.projectId
      ? projectsStore.list().find((item) => item.id === entry.projectId)
      : undefined;
    if (!project) {
      vscode.window.showWarningMessage('ForgeFlow: Task run requires a project.');
      return;
    }
    await runTaskByName(entry.taskName, project);
    await runHistoryStore.add({ ...entry, id: buildRunHistoryId(), timestamp: Date.now() }, getRunHistoryMaxItems());
    return;
  }
  vscode.window.showWarningMessage('ForgeFlow: Unable to run selected history entry.');
}

async function confirmRunHistoryClick(entry: RunHistoryEntry, project?: Project): Promise<boolean> {
  const label = entry.label || 'Recent run';
  const locationHint = entry.filePath ?? entry.command ?? project?.path;
  const detail = locationHint ? `\n${locationHint}` : '';
  const message = `ForgeFlow: Run "${label}"?${detail}`;
  const runChoice = 'Run';
  const picked = await vscode.window.showInformationMessage(message, { modal: true }, runChoice);
  return picked === runChoice;
}

async function runProjectHistory(
  project: Project,
  runHistoryStore: RunHistoryStore,
  runService: RunService,
  projectsStore: ProjectsStore
): Promise<void> {
  const entries = runHistoryStore.listForProject(
    project.id,
    getRunHistoryMaxItems(),
    getForgeFlowSettings().runHistoryPerProjectSortMode
  );
  if (entries.length === 0) {
    vscode.window.showWarningMessage(`ForgeFlow: No recent runs for ${project.name}.`);
    return;
  }
  const pick = await vscode.window.showQuickPick(
    entries.map((entry) => ({
      label: entry.label,
      description: formatHistoryDescription(entry),
      detail: entry.filePath ?? entry.command ?? '',
      entry
    })),
    { placeHolder: `Select a recent run for ${project.name}` }
  );
  if (!pick) {
    return;
  }
  await runHistoryEntry(pick.entry, runHistoryStore, runService, projectsStore);
}

async function saveProjectHistoryAsPreset(
  project: Project,
  runHistoryStore: RunHistoryStore,
  projectsStore: ProjectsStore
): Promise<void> {
  const entries = runHistoryStore.listForProject(
    project.id,
    getRunHistoryMaxItems(),
    getForgeFlowSettings().runHistoryPerProjectSortMode
  );
  if (entries.length === 0) {
    vscode.window.showWarningMessage(`ForgeFlow: No recent runs for ${project.name}.`);
    return;
  }
  const pick = await vscode.window.showQuickPick(
    entries.map((entry) => ({
      label: entry.label,
      description: formatHistoryDescription(entry),
      detail: entry.filePath ?? entry.command ?? '',
      entry
    })),
    { placeHolder: `Save recent run as preset for ${project.name}` }
  );
  if (!pick) {
    return;
  }
  await saveRunPresetFromEntry(pick.entry, projectsStore);
}

async function saveProjectHistoryAsPresets(
  project: Project,
  runHistoryStore: RunHistoryStore,
  projectsStore: ProjectsStore
): Promise<void> {
  const entries = runHistoryStore.listForProject(
    project.id,
    getRunHistoryMaxItems(),
    getForgeFlowSettings().runHistoryPerProjectSortMode
  );
  if (entries.length === 0) {
    vscode.window.showWarningMessage(`ForgeFlow: No recent runs for ${project.name}.`);
    return;
  }
  const picks = await vscode.window.showQuickPick(
    entries.map((entry) => ({
      label: entry.label,
      description: formatHistoryDescription(entry),
      detail: entry.filePath ?? entry.command ?? '',
      entry
    })),
    { placeHolder: `Select recent runs to save as presets for ${project.name}`, canPickMany: true }
  );
  if (!picks || picks.length === 0) {
    return;
  }
  let saved = 0;
  for (const pick of picks) {
    await saveRunPresetFromEntry(pick.entry, projectsStore);
    saved += 1;
  }
  vscode.window.setStatusBarMessage(`ForgeFlow: Saved ${saved} preset${saved === 1 ? '' : 's'}.`, 3000);
}

async function saveRunPresetFromHistory(runHistoryStore: RunHistoryStore, projectsStore: ProjectsStore): Promise<void> {
  const entries = runHistoryStore.list();
  if (entries.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: Run history is empty.');
    return;
  }
  const pick = await vscode.window.showQuickPick(
    entries.map((entry) => ({
      label: entry.label,
      description: formatHistoryDescription(entry),
      detail: entry.filePath ?? entry.command ?? '',
      entry
    })),
    { placeHolder: 'Select a run to save as preset' }
  );
  if (!pick) {
    return;
  }
  await saveRunPresetFromEntry(pick.entry, projectsStore);
}

async function saveRunPresetFromEntry(entry: RunHistoryEntry, projectsStore: ProjectsStore): Promise<void> {
  const project = entry.projectId
    ? projectsStore.list().find((item) => item.id === entry.projectId)
    : undefined;
  const targetProject = project ?? await pickProject(projectsStore.list(), 'Select a project for this preset');
  if (!targetProject) {
    return;
  }
  const name = await vscode.window.showInputBox({
    prompt: `Preset name for ${targetProject.name}`,
    value: entry.label
  });
  if (!name) {
    return;
  }
  const preset: RunPreset = buildPresetFromEntry(entry, name, buildPresetId());
  const existing = targetProject.runPresets ?? [];
  const index = existing.findIndex((item) => item.label.toLowerCase() === name.toLowerCase());
  const next = [...existing];
  if (index >= 0) {
    next[index] = preset;
  } else {
    next.push(preset);
  }
  await projectsStore.updateRunPresets(targetProject.id, next);
  vscode.window.setStatusBarMessage(`ForgeFlow: Saved preset "${name}".`, 3000);
}

async function runProjectPreset(
  project: Project,
  runService: RunService,
  runHistoryStore: RunHistoryStore
): Promise<void> {
  const presets = project.runPresets ?? [];
  if (presets.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: No run presets saved for this project.');
    return;
  }
  const pick = await vscode.window.showQuickPick(
    presets.map((preset) => ({
      label: preset.label,
      description: formatPresetDescription(preset),
      detail: preset.filePath ?? preset.command ?? preset.taskName ?? '',
      preset
    })),
    { placeHolder: `Run preset for ${project.name}` }
  );
  if (!pick) {
    return;
  }
  const preset = pick.preset;
  await runPresetItem(preset, project, runService, runHistoryStore);
}

async function deleteProjectPreset(project: Project, projectsStore: ProjectsStore): Promise<void> {
  const presets = project.runPresets ?? [];
  if (presets.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: No run presets saved for this project.');
    return;
  }
  const pick = await vscode.window.showQuickPick(
    presets.map((preset) => ({
      label: preset.label,
      description: formatPresetDescription(preset),
      preset
    })),
    { placeHolder: `Delete preset for ${project.name}` }
  );
  if (!pick) {
    return;
  }
  const next = presets.filter((preset) => preset.id !== pick.preset.id);
  await projectsStore.updateRunPresets(project.id, next);
  vscode.window.setStatusBarMessage(`ForgeFlow: Deleted preset "${pick.preset.label}".`, 3000);
}

async function runPresetItem(
  preset: RunPreset,
  project: Project,
  runService: RunService,
  runHistoryStore: RunHistoryStore
): Promise<void> {
  if (preset.kind === 'powershell' && preset.filePath) {
    await runService.run({
      filePath: preset.filePath,
      workingDirectory: preset.workingDirectory,
      projectId: project.id,
      profileId: preset.profileId,
      target: preset.target
    });
    await recordPresetHistory(runHistoryStore, preset, project.id);
    return;
  }
  if (preset.kind === 'command' && preset.command) {
    await runShellCommand(preset.command, preset.workingDirectory, getForgeFlowSettings().runByFileReuseTerminal);
    await recordPresetHistory(runHistoryStore, preset, project.id);
    return;
  }
  if (preset.kind === 'task' && preset.taskName) {
    await runTaskByName(preset.taskName, project);
    await recordPresetHistory(runHistoryStore, preset, project.id);
    return;
  }
  vscode.window.showWarningMessage('ForgeFlow: Preset is missing required data.');
}

async function deletePresetItem(project: Project, preset: RunPreset, projectsStore: ProjectsStore): Promise<void> {
  const presets = project.runPresets ?? [];
  const next = presets.filter((item) => item.id !== preset.id);
  if (next.length === presets.length) {
    return;
  }
  await projectsStore.updateRunPresets(project.id, next);
  vscode.window.setStatusBarMessage(`ForgeFlow: Deleted preset "${preset.label}".`, 3000);
}

async function recordPresetHistory(
  runHistoryStore: RunHistoryStore,
  preset: RunPreset,
  projectId?: string
): Promise<void> {
  const entry: RunHistoryEntry = {
    id: buildRunHistoryId(),
    kind: preset.kind,
    label: preset.label,
    timestamp: Date.now(),
    filePath: preset.filePath,
    command: preset.command,
    workingDirectory: preset.workingDirectory,
    projectId,
    profileId: preset.profileId,
    target: preset.target,
    taskName: preset.taskName,
    taskSource: preset.taskSource
  };
  await runHistoryStore.add(entry, getRunHistoryMaxItems());
}

async function configureProjectRunTarget(
  project: Project,
  projectsStore: ProjectsStore,
  projectsProvider: ProjectsViewProvider
): Promise<void> {
  const options: Array<{ label: string; value: RunTarget; description?: string }> = [
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
  project: Project,
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

async function runTaskEntryPoint(entry: ProjectEntryPoint, project: Project, runHistoryStore: RunHistoryStore): Promise<void> {
  const taskName = entry.task?.name ?? entry.label;
  await runTaskByName(taskName, project);
  const historyEntry: RunHistoryEntry = {
    id: buildRunHistoryId(),
    kind: 'task',
    label: entry.label,
    timestamp: Date.now(),
    projectId: project.id,
    taskName,
    taskSource: entry.task?.source
  };
  await runHistoryStore.add(historyEntry, getRunHistoryMaxItems());
}

async function runTaskByName(taskName: string, project: Project): Promise<void> {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(project.path));
  const tasks = await vscode.tasks.fetchTasks();
  const matches = tasks.filter((task) => {
    if (task.name.toLowerCase() !== taskName.toLowerCase()) {
      return false;
    }
    if (!folder || typeof task.scope !== 'object' || !task.scope) {
      return true;
    }
    if ('uri' in task.scope) {
      return normalizeFsPath(task.scope.uri.fsPath) === normalizeFsPath(folder.uri.fsPath);
    }
    return true;
  });
  if (matches.length === 0) {
    vscode.window.showWarningMessage(`ForgeFlow: Task "${taskName}" not found for ${project.name}.`);
    return;
  }
  const first = matches[0];
  if (!first) {
    return;
  }
  let targetTask = first;
  if (matches.length > 1) {
    const pick = await vscode.window.showQuickPick(
      matches.map((task) => ({
        label: task.name,
        description: task.source,
        detail: task.definition?.type,
        task
      })),
      { placeHolder: `Select task "${taskName}" to run` }
    );
    if (!pick) {
      return;
    }
    targetTask = pick.task;
  }
  await vscode.tasks.executeTask(targetTask);
}

function formatHistoryDescription(entry: RunHistoryEntry): string {
  if (entry.kind === 'powershell') {
    return `PowerShell${entry.target ? ` • ${entry.target}` : ''}`;
  }
  if (entry.kind === 'task') {
    return 'Task';
  }
  return 'Command';
}

function formatPresetDescription(preset: RunPreset): string {
  if (preset.kind === 'powershell') {
    return `PowerShell${preset.target ? ` • ${preset.target}` : ''}`;
  }
  if (preset.kind === 'task') {
    return 'Task';
  }
  return 'Command';
}

function buildRunHistoryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildPresetId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getRunHistoryMaxItems(): number {
  const config = vscode.workspace.getConfiguration('forgeflow');
  const value = config.get<number>('run.history.maxItems', 50);
  if (!Number.isFinite(value) || value <= 0) {
    return 50;
  }
  return Math.min(200, Math.max(1, Math.floor(value)));
}

function resolveProfileIdForHistory(
  filePath: string,
  project: Project | undefined,
  explicitProfileId: string | undefined,
  favoritesStore: FavoritesStore,
  settings: ReturnType<typeof getForgeFlowSettings>
): string | undefined {
  if (explicitProfileId) {
    return explicitProfileId;
  }
  const favoriteOverride = favoritesStore.list().find((item) => item.path === filePath)?.profileOverrideId;
  if (favoriteOverride) {
    return favoriteOverride;
  }
  if (project?.preferredRunProfileId) {
    return project.preferredRunProfileId;
  }
  if (settings.defaultProfileId) {
    return settings.defaultProfileId;
  }
  return getAllProfiles(settings.powershellProfiles)[0]?.id;
}

function getRunByFileTerminal(reuse: boolean, cwd?: string): vscode.Terminal {
  if (reuse && runByFileTerminal) {
    return runByFileTerminal;
  }
  const terminal = vscode.window.createTerminal({
    name: 'ForgeFlow: Run',
    cwd: cwd
  });
  if (reuse) {
    runByFileTerminal = terminal;
  }
  return terminal;
}

function getPowerForgeTerminal(cwd?: string): vscode.Terminal {
  if (powerForgeTerminal) {
    return powerForgeTerminal;
  }
  powerForgeTerminal = vscode.window.createTerminal({
    name: 'ForgeFlow: PowerForge',
    cwd: cwd
  });
  return powerForgeTerminal;
}


async function chooseProfileId(allowClear = false): Promise<string | null | undefined> {
  const config = vscode.workspace.getConfiguration('forgeflow');
  const profiles = config.get<PowerShellProfile[]>('powershell.profiles', []);
  const allProfiles = getAllProfiles(profiles);
  const items: Array<vscode.QuickPickItem & { id?: string; clear?: boolean }> = [];
  if (allowClear) {
    items.push({
      label: '$(circle-slash) Use default',
      description: 'Clear override',
      clear: true
    });
  }
  items.push({
    label: '$(plus) Add custom profile...',
    description: 'Choose a PowerShell executable'
  });
  for (const profile of allProfiles) {
    const icon = profileKindIcon(profile.kind);
    const label = icon ? `$(${icon}) ${profile.label}` : profile.label;
    const description = profileKindLabel(profile.kind);
    const detail = profile.kind === 'custom' ? profile.executablePath : undefined;
    items.push({ label, description, detail, id: profile.id });
  }
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: allowClear ? 'Select PowerShell profile (or use default)' : 'Select PowerShell profile',
    matchOnDescription: true,
    matchOnDetail: true
  });
  if (!picked) {
    return undefined;
  }
  if (picked.clear) {
    return null;
  }
  if (!picked.id && picked.label.includes('Add custom profile')) {
    const customId = await createCustomProfile();
    return customId ?? undefined;
  }
  return picked.id;
}

async function createCustomProfile(): Promise<string | undefined> {
  const exePath = await pickExecutablePath('Select PowerShell executable');
  if (!exePath) {
    return undefined;
  }
  const defaultLabel = path.basename(exePath);
  const label = await vscode.window.showInputBox({
    title: 'Profile label',
    prompt: 'Label for the custom profile',
    value: defaultLabel
  });
  if (!label) {
    return undefined;
  }
  const profile: PowerShellProfile = {
    id: `custom-${stableIdFromPath(exePath)}`,
    label,
    kind: 'custom',
    executablePath: exePath
  };
  const config = vscode.workspace.getConfiguration('forgeflow');
  const profiles = config.get<PowerShellProfile[]>('powershell.profiles', []);
  const nextProfiles = profiles.some((existing) => existing.id === profile.id)
    ? profiles.map((existing) => (existing.id === profile.id ? profile : existing))
    : [...profiles, profile];
  await config.update('powershell.profiles', nextProfiles, vscode.ConfigurationTarget.Global);
  vscode.window.setStatusBarMessage('ForgeFlow: Custom PowerShell profile added.', 3000);
  return profile.id;
}

async function pickExternalSessionTarget(): Promise<{ profileId?: string; label?: string } | undefined> {
  const config = vscode.workspace.getConfiguration('forgeflow');
  const profiles = config.get<PowerShellProfile[]>('powershell.profiles', []);
  const allProfiles = getAllProfiles(profiles);
  const items: Array<vscode.QuickPickItem & { profileId?: string; all?: boolean }> = [
    {
      label: '$(trash) All external sessions',
      description: 'Reset all external PowerShell sessions',
      all: true
    }
  ];

  for (const profile of allProfiles) {
    const icon = profileKindIcon(profile.kind);
    const label = icon ? `$(${icon}) ${profile.label}` : profile.label;
    const description = profileKindLabel(profile.kind);
    const detail = profile.kind === 'custom' ? profile.executablePath : undefined;
    items.push({
      label,
      description,
      detail,
      profileId: profile.id
    });
  }

  const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Select external session to reset' });
  if (!pick) {
    return undefined;
  }
  if (pick.all) {
    return {};
  }
  if (!pick.profileId) {
    return undefined;
  }
  return { profileId: pick.profileId, label: pick.label };
}

async function managePowerShellProfiles(): Promise<void> {
  const config = vscode.workspace.getConfiguration('forgeflow');
  const profiles = config.get<PowerShellProfile[]>('powershell.profiles', []);
  const allProfiles = getAllProfiles(profiles);
  const items: Array<vscode.QuickPickItem & { action: 'add' | 'edit' | 'remove'; profileId?: string }> = [
    {
      label: '$(plus) Add custom profile...',
      description: 'Choose a PowerShell executable',
      action: 'add'
    }
  ];
  for (const profile of allProfiles) {
    const icon = profileKindIcon(profile.kind);
    const label = icon ? `$(${icon}) ${profile.label}` : profile.label;
    const description = profileKindLabel(profile.kind);
    const detail = profile.kind === 'custom' ? profile.executablePath : 'Built-in profile';
    items.push({ label, description: `Edit ${description}`, detail, action: 'edit', profileId: profile.id });
    if (profile.kind === 'custom') {
      items.push({
        label,
        description: `Remove ${description}`,
        detail,
        action: 'remove',
        profileId: profile.id
      });
    }
  }

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: 'Manage PowerShell profiles',
    matchOnDescription: true,
    matchOnDetail: true
  });
  if (!pick) {
    return;
  }
  if (pick.action === 'add') {
    await createCustomProfile();
    return;
  }
  if (!pick.profileId) {
    return;
  }

  const existing = profiles.find((profile) => profile.id === pick.profileId);
  if (!existing) {
    vscode.window.showWarningMessage('ForgeFlow: Built-in profiles cannot be edited here.');
    return;
  }

  if (pick.action === 'remove') {
    const confirm = await vscode.window.showWarningMessage(
      `ForgeFlow: Remove PowerShell profile "${existing.label}"?`,
      { modal: true },
      'Remove'
    );
    if (confirm !== 'Remove') {
      return;
    }
    const nextProfiles = profiles.filter((profile) => profile.id !== existing.id);
    await config.update('powershell.profiles', nextProfiles, vscode.ConfigurationTarget.Global);
    const defaultId = config.get<string | undefined>('powershell.defaultProfileId');
    if (defaultId === existing.id) {
      await config.update('powershell.defaultProfileId', undefined, vscode.ConfigurationTarget.Global);
    }
    vscode.window.setStatusBarMessage('ForgeFlow: PowerShell profile removed.', 3000);
    return;
  }

  const newLabel = await vscode.window.showInputBox({
    title: 'Profile label',
    prompt: 'Label for the PowerShell profile',
    value: existing.label
  });
  if (!newLabel) {
    return;
  }
  const newPath = await vscode.window.showInputBox({
    title: 'Executable path',
    prompt: 'Path to the PowerShell executable',
    value: existing.executablePath ?? ''
  });
  if (!newPath) {
    return;
  }
  const updated: PowerShellProfile = {
    ...existing,
    label: newLabel,
    executablePath: newPath
  };
  const nextProfiles = profiles.map((profile) => (profile.id === existing.id ? updated : profile));
  await config.update('powershell.profiles', nextProfiles, vscode.ConfigurationTarget.Global);
  vscode.window.setStatusBarMessage('ForgeFlow: PowerShell profile updated.', 3000);
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

async function previewCleanAllProjects(
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

async function cleanAllProjects(
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
  const direct = extractProject(target);
  if (direct) {
    return direct;
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

async function resolveWorkingDirectory(
  filePath: string,
  projectPath?: string,
  preferredPath?: string
): Promise<string | undefined> {
  const candidates = [preferredPath, projectPath, path.dirname(filePath)].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const stat = await statPath(candidate);
    if (stat?.type === vscode.FileType.Directory) {
      return candidate;
    }
  }
  return undefined;
}
