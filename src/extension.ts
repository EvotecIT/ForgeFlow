import * as path from 'path';
import * as vscode from 'vscode';
import { DashboardService } from './dashboard/dashboardService';
import { DashboardCache } from './dashboard/cache';
import { DashboardTokenStore } from './dashboard/tokenStore';
import { DashboardFilterStore } from './dashboard/filterStore';
import { DashboardViewStateStore } from './dashboard/viewStateStore';
import { GitService } from './git/gitService';
import { GitStore } from './git/gitStore';
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
import { GitViewProvider } from './views/gitView';
import { ForgeFlowLogger } from './util/log';
import { getForgeFlowSettings } from './util/config';
import { statPath } from './util/fs';
import { maybeRunOnboarding } from './onboarding/onboarding';
import { registerToggleQuotes } from './editor/toggleQuotes';
import { registerUnicodeSubstitutions } from './editor/unicodeSubstitutions';
import { registerBrowserCommands } from './extension/commands/browser';
import { registerMiscCommands } from './extension/commands/misc';
import { registerDashboardCommands } from './extension/dashboard/commands';
import { registerGitCommands } from './extension/git/commands';
import { registerPowerForgeCommands, handlePowerForgeTerminalClosed } from './extension/powerforge/commands';
import { registerRunCommands } from './extension/run/commands';
import { handleRunTerminalClosed } from './extension/run/terminal';
import {
  buildFilterMessage,
  formatScopeLabel,
  setTreeViewMessage,
  toggleFilterScope
} from './extension/filters';
import { getFiltersRevision } from './store/filterScope';
import {
  extractPath,
  getActiveEditorPath
} from './extension/selection';
import { normalizeFsPath } from './extension/pathUtils';
import { touchProjectActivity } from './extension/workspace/activity';
import { registerFileCommands } from './extension/commands/files';
import { registerProjectCommands } from './extension/commands/projects';
import { schedulePowerShellProfileHealthCheck } from './extension/run/health';

const GLOBAL_STATE_SYNC_KEYS = [
  'forgeflow.layout.mode.v1',
  'forgeflow.filters.revision.v1',
  'forgeflow.filters.presets.v1',
  'forgeflow.filters.presets.revision.v1',
  'forgeflow.tags.presets.v1',
  'forgeflow.tags.presets.revision.v1',
  'forgeflow.files.favorites.v1',
  'forgeflow.files.favorites.revision.v1',
  'forgeflow.projects.items.v1',
  'forgeflow.projects.revision.v1',
  'forgeflow.projects.favorites.v1',
  'forgeflow.projects.tags.v1',
  'forgeflow.projects.tags.revision.v1',
  'forgeflow.projects.sortOrder.v1',
  'forgeflow.files.filter.v1',
  'forgeflow.projects.filter.v1',
  'forgeflow.git.filter.v1',
  'forgeflow.dashboard.filter.v1',
  'forgeflow.tags.filter.v1',
  'forgeflow.run.history.v1',
  'forgeflow.run.history.revision.v1'
];

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
  context.globalState.setKeysForSync(GLOBAL_STATE_SYNC_KEYS);
  schedulePowerShellProfileHealthCheck();
  let filesRefreshTimer: NodeJS.Timeout | undefined;
  let lastFilesRefreshAt = 0;
  const filesRefreshMinIntervalMs = 1000;
  const scheduleFilesRefresh = (): void => {
    if (filesRefreshTimer) {
      clearTimeout(filesRefreshTimer);
    }
    const now = Date.now();
    const earliest = lastFilesRefreshAt + filesRefreshMinIntervalMs;
    const delay = Math.max(200, earliest - now);
    filesRefreshTimer = setTimeout(() => {
      lastFilesRefreshAt = Date.now();
      filesProvider.refresh();
    }, delay);
  };
  const shouldIgnoreFileEvent = (uri: vscode.Uri): boolean => {
    const fsPath = uri.fsPath;
    const gitSegment = `${path.sep}.git${path.sep}`;
    return fsPath === `${path.sep}.git`
      || fsPath.endsWith(`${path.sep}.git`)
      || fsPath.includes(gitSegment);
  };
  const fileWatchers = new Map<string, vscode.FileSystemWatcher>();
  let fileWatchMode: 'off' | 'roots' | 'all' | undefined;
  const syncFileWatchers = (): void => {
    const watchMode = getForgeFlowSettings().filesWatchMode;
    if (fileWatchMode && fileWatchMode !== watchMode) {
      for (const [, watcher] of fileWatchers) {
        watcher.dispose();
      }
      fileWatchers.clear();
    }
    fileWatchMode = watchMode;
    const folders = vscode.workspace.workspaceFolders ?? [];
    const activeRoots = new Set<string>();
    if (watchMode === 'off') {
      for (const [, watcher] of fileWatchers) {
        watcher.dispose();
      }
      fileWatchers.clear();
      return;
    }
    const pattern = watchMode === 'roots' ? '*' : '**/*';
    for (const folder of folders) {
      const key = folder.uri.fsPath;
      activeRoots.add(key);
      if (fileWatchers.has(key)) {
        continue;
      }
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, pattern));
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
    return [
      projectsStore.getRevision(),
      projectsStore.getWorkspaceRevision(),
      tagsStore.getRevision()
    ].join('::');
  };

  const computeFilterSyncKey = (): string => {
    const tagFilter = tagFilterStore.getFilter().map((tag) => tag.toLowerCase()).sort().join('\u001f');
    return [
      getFiltersRevision(stateStore),
      getForgeFlowSettings().filtersScope,
      filesFilterStore.getFilter(),
      projectsStore.getFilter(),
      gitFilterStore.getFilter(),
      dashboardFilterStore.getFilter(),
      tagFilter,
      projectsStore.getFavoritesOnly() ? '1' : '0'
    ].join('::');
  };

  const computeFavoritesSyncKey = (): string => favoritesStore.getRevision();
  const computeRunHistorySyncKey = (): string => runHistoryStore.getRevision();
  const computeGitSyncKey = (): string => gitStore.getRevision();
  const computeDashboardSyncKey = (): string => String(dashboardCache.load()?.updatedAt ?? 0);
  const computePresetsSyncKey = (): string => [
    filterPresetStore.getRevision(),
    tagFilterStore.getPresetsRevision()
  ].join('::');

  let lastProjectsSyncKey = computeProjectsSyncKey();
  let lastFilterSyncKey = computeFilterSyncKey();
  let lastFavoritesSyncKey = computeFavoritesSyncKey();
  let lastRunHistorySyncKey = computeRunHistorySyncKey();
  let lastGitSyncKey = computeGitSyncKey();
  let lastDashboardSyncKey = computeDashboardSyncKey();
  let lastPresetsSyncKey = computePresetsSyncKey();
  const syncProjectsAcrossWindows = async (): Promise<void> => {
    const nextProjectsKey = computeProjectsSyncKey();
    const nextFilterKey = computeFilterSyncKey();
    const nextFavoritesKey = computeFavoritesSyncKey();
    const nextRunHistoryKey = computeRunHistorySyncKey();
    const nextGitKey = computeGitSyncKey();
    const nextDashboardKey = computeDashboardSyncKey();
    const nextPresetsKey = computePresetsSyncKey();
    if (nextProjectsKey === lastProjectsSyncKey
      && nextFilterKey === lastFilterSyncKey
      && nextFavoritesKey === lastFavoritesSyncKey
      && nextRunHistoryKey === lastRunHistorySyncKey
      && nextGitKey === lastGitSyncKey
      && nextDashboardKey === lastDashboardSyncKey
      && nextPresetsKey === lastPresetsSyncKey) {
      return;
    }

    const projectsChanged = nextProjectsKey !== lastProjectsSyncKey;
    const filtersChanged = nextFilterKey !== lastFilterSyncKey;
    const favoritesChanged = nextFavoritesKey !== lastFavoritesSyncKey;
    const runHistoryChanged = nextRunHistoryKey !== lastRunHistorySyncKey;
    const gitChanged = nextGitKey !== lastGitSyncKey;
    const dashboardChanged = nextDashboardKey !== lastDashboardSyncKey;
    lastProjectsSyncKey = nextProjectsKey;
    lastFilterSyncKey = nextFilterKey;
    lastFavoritesSyncKey = nextFavoritesKey;
    lastRunHistorySyncKey = nextRunHistoryKey;
    lastGitSyncKey = nextGitKey;
    lastDashboardSyncKey = nextDashboardKey;
    lastPresetsSyncKey = nextPresetsKey;

    if (projectsChanged) {
      projectsProvider.syncFromStore();
      filesProvider.syncFilterFromStore();
      gitProvider.syncFilterFromStore();
      projectsWebviewProvider.clearDetailsCache();
      projectsWebviewPanelProvider.clearDetailsCache();
      await projectsWebviewProvider.refresh();
      await projectsWebviewPanelProvider.refresh();
      gitProvider.refreshView();
    }

    if (filtersChanged) {
      if (!projectsChanged) {
        projectsProvider.syncFromStore();
        filesProvider.syncFilterFromStore();
        gitProvider.syncFilterFromStore();
      }
      await dashboardProvider.applyFilter(dashboardFilterStore.getFilter(), false);
      await dashboardProvider.applyTagFilter(tagFilterStore.getFilter(), false, true);
      if (!projectsChanged) {
        await projectsWebviewProvider.refresh();
        await projectsWebviewPanelProvider.refresh();
      }
    }

    if (favoritesChanged) {
      filesProvider.refresh();
    }

    if (runHistoryChanged && !projectsChanged) {
      projectsProvider.refreshRunHistory();
      projectsWebviewProvider.clearDetailsCache();
      projectsWebviewPanelProvider.clearDetailsCache();
      await projectsWebviewProvider.refresh();
      await projectsWebviewPanelProvider.refresh();
    }

    if (gitChanged && !projectsChanged) {
      gitProvider.refreshView();
    }

    if (dashboardChanged) {
      dashboardProvider.syncFromCache();
    }
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
  let runHistoryRefreshTimer: NodeJS.Timeout | undefined;
  const scheduleRunHistoryRefresh = (): void => {
    if (runHistoryRefreshTimer) {
      clearTimeout(runHistoryRefreshTimer);
    }
    runHistoryRefreshTimer = setTimeout(() => {
      runHistoryRefreshTimer = undefined;
      projectsProvider.refreshRunHistory();
      projectsWebviewProvider.clearDetailsCache();
      projectsWebviewPanelProvider.clearDetailsCache();
      void projectsWebviewProvider.refresh();
      void projectsWebviewPanelProvider.refresh();
    }, 800);
  };
  context.subscriptions.push(
    runHistoryStore.onDidChange(() => {
      scheduleRunHistoryRefresh();
    })
  );
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((terminal) => {
      handleRunTerminalClosed(terminal);
      handlePowerForgeTerminalClosed(terminal);
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
      if (event.affectsConfiguration('forgeflow.files.watchMode')) {
        syncFileWatchers();
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

  registerRunCommands({
    context,
    filesProvider,
    projectsProvider,
    projectsStore,
    favoritesStore,
    runHistoryStore,
    runService
  });
  registerPowerForgeCommands(context, projectsStore, async () => {
    await powerForgeViewProvider.refresh();
    await powerForgePanelProvider.refresh();
  });
  registerGitCommands({
    context,
    projectsStore,
    gitService,
    gitStore,
    gitProvider,
    projectsProvider,
    filterPresetStore,
    logger
  });
  registerDashboardCommands({
    context,
    projectsStore,
    dashboardProvider,
    dashboardFilterStore,
    filterPresetStore,
    tokenStore
  });
  registerBrowserCommands(context);
  registerMiscCommands({
    context,
    stateStore,
    layoutStore,
    projectsStore,
    favoritesStore,
    tagsStore,
    runHistoryStore,
    gitStore,
    tokenStore
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
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
  const cachedProjects = projectsStore.list();
  if (cachedProjects.length > 0) {
    projectsProvider.syncFromStore();
    setTimeout(() => {
      void projectsProvider.refresh();
    }, 1500);
  } else {
    await projectsProvider.refresh();
  }
  logger.info('ForgeFlow activated.');
}

export function deactivate(): void {
  // handled by disposables
}
