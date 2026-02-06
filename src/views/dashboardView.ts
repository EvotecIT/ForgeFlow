import * as vscode from 'vscode';
import * as path from 'path';
import type { DashboardRow, DashboardService } from '../dashboard/dashboardService';
import { renderDashboardHtml } from '../dashboard/webviewHtml';
import type { ForgeFlowLogger } from '../util/log';
import type { DashboardCache } from '../dashboard/cache';
import type { DashboardFilterStore } from '../dashboard/filterStore';
import type { DashboardTokenStore } from '../dashboard/tokenStore';
import type { DashboardViewState, DashboardViewStateStore } from '../dashboard/viewStateStore';
import { getForgeFlowSettings } from '../util/config';
import type { TagFilterStore } from '../store/tagFilterStore';
import { statPath } from '../util/fs';

export class DashboardViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private lastRows: DashboardRow[] = [];
  private lastUpdated?: number;
  private authSummary = '';
  private pendingFocusFilter = false;
  private tagFilter: string[] = [];
  private readonly onDidChangeTagFilterEmitter = new vscode.EventEmitter<string[]>();
  public readonly onDidChangeTagFilter = this.onDidChangeTagFilterEmitter.event;
  private refreshController?: AbortController;
  private refreshPromise?: Promise<void>;
  private progressCurrent = 0;
  private progressTotal = 0;
  private progressLabel = '';
  private lastProgressUpdate = 0;

  public constructor(
    private readonly dashboardService: DashboardService,
    private readonly logger: ForgeFlowLogger,
    private readonly cache: DashboardCache,
    private readonly filterStore: DashboardFilterStore,
    private readonly tokenStore: DashboardTokenStore,
    private readonly viewStateStore: DashboardViewStateStore,
    private readonly tagFilterStore: TagFilterStore
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.title = 'Dashboard — ForgeFlow';
    webviewView.webview.options = {
      enableScripts: true
    };

    void this.getAuthSummary().then((summary) => {
      this.authSummary = summary;
      if (this.view) {
        const filter = this.filterStore.getFilter();
        const viewState = this.viewStateStore.getState();
        const settings = getForgeFlowSettings();
        this.tagFilter = this.tagFilterStore.getFilter();
        this.view.webview.html = renderDashboardHtml(this.lastRows, this.view.webview, {
          updatedAt: this.lastUpdated,
          filter,
          activeTags: this.tagFilter,
          filterMinChars: settings.filtersDashboardMinChars,
          filterMatchMode: settings.filtersMatchMode,
          authSummary: this.authSummary,
          sortKey: viewState.sortKey,
          sortDir: viewState.sortDir,
          colWidths: viewState.colWidths,
          expandAllGroups: viewState.expandAllGroups,
          showAllChildren: viewState.showAllChildren,
          hideActionsColumn: settings.dashboardHideActionsColumn,
          showGroupChildren: settings.dashboardGroupDuplicateChildren
        });
      }
    });

    const cached = this.cache.load();
    if (cached?.rows?.length) {
      this.lastRows = cached.rows;
      this.lastUpdated = cached.updatedAt;
      const filter = this.filterStore.getFilter();
      const viewState = this.viewStateStore.getState();
      const settings = getForgeFlowSettings();
      this.tagFilter = this.tagFilterStore.getFilter();
      webviewView.webview.html = renderDashboardHtml(this.lastRows, webviewView.webview, {
        updatedAt: this.lastUpdated,
        filter,
        activeTags: this.tagFilter,
        filterMinChars: settings.filtersDashboardMinChars,
        filterMatchMode: settings.filtersMatchMode,
        authSummary: this.authSummary,
        progressCurrent: this.progressCurrent,
        progressTotal: this.progressTotal,
        sortKey: viewState.sortKey,
        sortDir: viewState.sortDir,
        colWidths: viewState.colWidths,
        expandAllGroups: viewState.expandAllGroups,
        showAllChildren: viewState.showAllChildren,
        hideActionsColumn: settings.dashboardHideActionsColumn,
        showGroupChildren: settings.dashboardGroupDuplicateChildren
      });
    }

    if (this.pendingFocusFilter) {
      this.pendingFocusFilter = false;
      void webviewView.webview.postMessage({ type: 'focusFilter' });
    }

    webviewView.webview.onDidReceiveMessage(async (message: {
      type?: string;
      url?: string;
      path?: string;
      paths?: string[];
      filter?: string;
      tags?: string[];
      sortKey?: string;
      sortDir?: string;
      colWidths?: Record<string, number>;
      expandAllGroups?: boolean;
      showAllChildren?: boolean;
      hide?: boolean;
    }) => {
      if (message.type === 'refresh') {
        await this.refresh();
      }
      if (message.type === 'cancelRefresh') {
        if (this.refreshController) {
          this.refreshController.abort();
          vscode.window.setStatusBarMessage('ForgeFlow: Dashboard refresh cancelled.', 3000);
          const filter = this.filterStore.getFilter();
          const viewState = this.viewStateStore.getState();
          const settings = getForgeFlowSettings();
          this.tagFilter = this.tagFilterStore.getFilter();
          if (this.view) {
            this.view.webview.html = renderDashboardHtml(this.lastRows, this.view.webview, {
              updatedAt: this.lastUpdated,
              filter,
              activeTags: this.tagFilter,
              filterMinChars: settings.filtersDashboardMinChars,
              filterMatchMode: settings.filtersMatchMode,
              authSummary: this.authSummary,
              progressCurrent: this.progressCurrent,
              progressTotal: this.progressTotal,
              expandAllGroups: viewState.expandAllGroups,
              showAllChildren: viewState.showAllChildren,
              hideActionsColumn: settings.dashboardHideActionsColumn
            });
          }
        }
      }
      if (message.type === 'setFilter') {
        await this.filterStore.setFilter(message.filter ?? '');
      }
      if (message.type === 'setTagFilter') {
        const tags = Array.isArray(message.tags) ? message.tags.filter((tag) => typeof tag === 'string') : [];
        await this.applyTagFilter(tags, true, false);
        this.onDidChangeTagFilterEmitter.fire(this.tagFilter);
      }
      if (message.type === 'setViewState') {
        const sortDir: DashboardViewState['sortDir'] = message.sortDir === 'asc' || message.sortDir === 'desc'
          ? message.sortDir
          : undefined;
        const next: DashboardViewState = {
          sortKey: typeof message.sortKey === 'string' ? message.sortKey : undefined,
          sortDir,
          colWidths: message.colWidths ?? undefined,
          expandAllGroups: typeof message.expandAllGroups === 'boolean' ? message.expandAllGroups : undefined,
          showAllChildren: typeof message.showAllChildren === 'boolean' ? message.showAllChildren : undefined
        };
        await this.viewStateStore.setState(next);
      }
      if (message.type === 'setDashboardActionsVisibility') {
        const config = vscode.workspace.getConfiguration('forgeflow');
        await config.update('dashboard.hideActionsColumn', message.hide === true, vscode.ConfigurationTarget.Workspace);
      }
      if (message.type === 'openUrl' && message.url) {
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
      }
      if (message.type === 'openProject' && message.path) {
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(message.path), false);
      }
      if (message.type === 'openProjects' && Array.isArray(message.paths)) {
        const uniquePaths = Array.from(new Set(message.paths.filter((value) => typeof value === 'string' && value.trim())));
        for (const path of uniquePaths) {
          await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(path), true);
        }
      }
      if (message.type === 'openProjectsInWorkspace' && Array.isArray(message.paths)) {
        const uniquePaths = Array.from(new Set(message.paths.filter((value) => typeof value === 'string' && value.trim())));
        if (uniquePaths.length > 0) {
          const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
          const existing = new Set(workspaceFolders.map((folder) => folder.uri.fsPath));
          const toAdd = uniquePaths.filter((path) => !existing.has(path));
          if (toAdd.length === 0) {
            vscode.window.setStatusBarMessage('ForgeFlow: All group paths already in workspace.', 2000);
          } else {
            const index = workspaceFolders.length;
            const added = vscode.workspace.updateWorkspaceFolders(
              index,
              0,
              ...toAdd.map((path) => ({ uri: vscode.Uri.file(path) }))
            );
            if (!added) {
              vscode.window.setStatusBarMessage('ForgeFlow: Unable to add group to workspace.', 3000);
            }
          }
        }
      }
      if (message.type === 'openGroupTerminals' && Array.isArray(message.paths)) {
        const uniquePaths = Array.from(new Set(message.paths.filter((value) => typeof value === 'string' && value.trim())));
        for (const targetPath of uniquePaths) {
          const stat = await statPath(targetPath);
          const cwd = stat?.type === vscode.FileType.Directory ? targetPath : path.dirname(targetPath);
          const label = `ForgeFlow: ${path.basename(targetPath)}`;
          const terminal = vscode.window.createTerminal({ name: label, cwd });
          terminal.show(true);
        }
      }
      if (message.type === 'revealInOs' && message.path) {
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(message.path));
      }
      if (message.type === 'copyPath' && message.path) {
        await vscode.env.clipboard.writeText(message.path);
        vscode.window.setStatusBarMessage('ForgeFlow: Path copied.', 2000);
      }
      if (message.type === 'copyPaths' && Array.isArray(message.paths)) {
        const uniquePaths = Array.from(new Set(message.paths.filter((value) => typeof value === 'string' && value.trim())));
        if (uniquePaths.length > 0) {
          await vscode.env.clipboard.writeText(uniquePaths.join('\\n'));
          vscode.window.setStatusBarMessage('ForgeFlow: Paths copied.', 2000);
        }
      }
      if (message.type === 'copyRelativePath' && message.path) {
        await vscode.env.clipboard.writeText(message.path);
        vscode.window.setStatusBarMessage('ForgeFlow: Relative path copied.', 2000);
      }
      if (message.type === 'openTerminal' && message.path) {
        await vscode.commands.executeCommand('forgeflow.projects.openInTerminal', message.path);
      }
      if (message.type === 'runProject' && message.path) {
        await vscode.commands.executeCommand('forgeflow.projects.run', message.path);
      }
      if (message.type === 'gitCleanProject' && message.path) {
        await vscode.commands.executeCommand('forgeflow.projects.gitClean', message.path);
      }
      if (message.type === 'openVisualStudio' && message.path) {
        await vscode.commands.executeCommand('forgeflow.projects.openInVisualStudio', message.path);
      }
    });

    const settings = getForgeFlowSettings();
    const autoRefreshMinutes = settings.dashboardAutoRefreshMinutes;
    const cacheAgeMs = this.lastUpdated ? Date.now() - this.lastUpdated : undefined;
    const shouldAutoRefresh = autoRefreshMinutes <= 0
      ? true
      : cacheAgeMs === undefined
        ? true
        : cacheAgeMs > autoRefreshMinutes * 60_000;
    if (shouldAutoRefresh && settings.dashboardAutoRefreshOnOpen) {
      void this.refresh();
    }
  }

  public async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }
    if (this.refreshController) {
      this.refreshController.abort();
    }
    const controller = new AbortController();
    this.refreshController = controller;
    this.progressCurrent = 0;
    this.progressTotal = 0;
    this.progressLabel = '';
    this.lastProgressUpdate = 0;
    const task = this.performRefresh(controller.signal).finally(() => {
      if (this.refreshController === controller) {
        this.refreshController = undefined;
      }
      if (this.refreshPromise === task) {
        this.refreshPromise = undefined;
      }
    });
    this.refreshPromise = task;
    await task;
  }

  private async performRefresh(signal: AbortSignal): Promise<void> {
    if (!this.view) {
      return;
    }
    this.authSummary = await this.getAuthSummary();
    const filter = this.filterStore.getFilter();
    const viewState = this.viewStateStore.getState();
    const settings = getForgeFlowSettings();
    this.tagFilter = this.tagFilterStore.getFilter();
    this.view.webview.html = renderDashboardHtml(this.lastRows, this.view.webview, {
      loading: true,
      updatedAt: this.lastUpdated,
      filter,
      activeTags: this.tagFilter,
      filterMinChars: settings.filtersDashboardMinChars,
      filterMatchMode: settings.filtersMatchMode,
      authSummary: this.authSummary,
      progressCurrent: this.progressCurrent,
      progressTotal: this.progressTotal,
      sortKey: viewState.sortKey,
      sortDir: viewState.sortDir,
      colWidths: viewState.colWidths,
      expandAllGroups: viewState.expandAllGroups,
      showAllChildren: viewState.showAllChildren,
      hideActionsColumn: settings.dashboardHideActionsColumn
    });
    try {
      const rows = await this.dashboardService.buildRows(signal, (current, total, label) => {
        this.progressCurrent = current;
        this.progressTotal = total;
        if (label) {
          this.progressLabel = label;
        }
        this.maybeReportProgress();
      });
      if (signal.aborted) {
        return;
      }
      this.lastRows = rows;
      this.lastUpdated = Date.now();
      await this.cache.save(rows, this.lastUpdated);
      const viewState = this.viewStateStore.getState();
      const settings = getForgeFlowSettings();
      this.tagFilter = this.tagFilterStore.getFilter();
      const latestFilter = this.filterStore.getFilter();
      this.view.webview.html = renderDashboardHtml(rows, this.view.webview, {
        updatedAt: this.lastUpdated,
        filter: latestFilter,
        activeTags: this.tagFilter,
        filterMinChars: settings.filtersDashboardMinChars,
        filterMatchMode: settings.filtersMatchMode,
        authSummary: this.authSummary,
        progressCurrent: this.progressCurrent,
        progressTotal: this.progressTotal,
        sortKey: viewState.sortKey,
        sortDir: viewState.sortDir,
        colWidths: viewState.colWidths,
        expandAllGroups: viewState.expandAllGroups,
        showAllChildren: viewState.showAllChildren,
        hideActionsColumn: settings.dashboardHideActionsColumn
      });
    } catch (error) {
      if (signal.aborted) {
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message === 'AbortError') {
        return;
      }
      this.logger.error(`Dashboard refresh failed: ${message}`);
      const viewState = this.viewStateStore.getState();
      const settings = getForgeFlowSettings();
      this.tagFilter = this.tagFilterStore.getFilter();
      const latestFilter = this.filterStore.getFilter();
      this.view.webview.html = renderDashboardHtml(this.lastRows, this.view.webview, {
        message: 'Dashboard refresh failed.',
        updatedAt: this.lastUpdated,
        filter: latestFilter,
        activeTags: this.tagFilter,
        filterMinChars: settings.filtersDashboardMinChars,
        filterMatchMode: settings.filtersMatchMode,
        authSummary: this.authSummary,
        progressCurrent: this.progressCurrent,
        progressTotal: this.progressTotal,
        sortKey: viewState.sortKey,
        sortDir: viewState.sortDir,
        colWidths: viewState.colWidths,
        expandAllGroups: viewState.expandAllGroups,
        showAllChildren: viewState.showAllChildren,
        hideActionsColumn: settings.dashboardHideActionsColumn
      });
    }
  }

  private maybeReportProgress(): void {
    if (!this.view) {
      return;
    }
    const now = Date.now();
    if (now - this.lastProgressUpdate < 300) {
      return;
    }
    this.lastProgressUpdate = now;
    void this.view.webview.postMessage({
      type: 'progress',
      current: this.progressCurrent,
      total: this.progressTotal,
      label: this.progressLabel
    });
  }

  public async applyTagFilter(tags: string[], persist = true, notifyWebview = true): Promise<void> {
    this.tagFilter = normalizeTagFilter(tags);
    if (persist) {
      await this.tagFilterStore.setFilter(this.tagFilter);
    }
    if (notifyWebview && this.view) {
      void this.view.webview.postMessage({ type: 'applyTagFilter', tags: this.tagFilter });
    }
  }

  public async applyFilter(value: string, persist = true): Promise<void> {
    if (persist) {
      await this.filterStore.setFilter(value);
    }
    if (this.view) {
      void this.view.webview.postMessage({ type: 'applyFilter', filter: value });
    }
  }

  public async focusFilter(): Promise<void> {
    await vscode.commands.executeCommand('workbench.view.extension.forgeflow-panel');
    await vscode.commands.executeCommand('workbench.action.openView', 'forgeflow.dashboard');
    if (!this.view) {
      this.pendingFocusFilter = true;
      return;
    }
    this.view.show?.(false);
    void this.view.webview.postMessage({ type: 'focusFilter' });
  }

  public syncFromCache(): void {
    const cached = this.cache.load();
    if (!cached) {
      return;
    }
    if (this.lastUpdated === cached.updatedAt) {
      return;
    }
    this.lastRows = cached.rows;
    this.lastUpdated = cached.updatedAt;
    if (!this.view) {
      return;
    }
    const filter = this.filterStore.getFilter();
    const viewState = this.viewStateStore.getState();
    const settings = getForgeFlowSettings();
    this.tagFilter = this.tagFilterStore.getFilter();
    this.view.webview.html = renderDashboardHtml(this.lastRows, this.view.webview, {
      updatedAt: this.lastUpdated,
      filter,
      activeTags: this.tagFilter,
      filterMinChars: settings.filtersDashboardMinChars,
      filterMatchMode: settings.filtersMatchMode,
      authSummary: this.authSummary,
      progressCurrent: this.progressCurrent,
      progressTotal: this.progressTotal,
      sortKey: viewState.sortKey,
      sortDir: viewState.sortDir,
      colWidths: viewState.colWidths,
      expandAllGroups: viewState.expandAllGroups,
      showAllChildren: viewState.showAllChildren,
      hideActionsColumn: settings.dashboardHideActionsColumn,
      showGroupChildren: settings.dashboardGroupDuplicateChildren
    });
  }

  public async setActionsColumnHidden(hidden: boolean): Promise<void> {
    const config = vscode.workspace.getConfiguration('forgeflow');
    await config.update('dashboard.hideActionsColumn', hidden, vscode.ConfigurationTarget.Workspace);
    if (this.view) {
      void this.view.webview.postMessage({ type: 'setActionsVisibility', hide: hidden });
    }
  }

  private async getAuthSummary(): Promise<string> {
    const entries: string[] = [];
    const gitHub = await this.getGitHubSummary();
    if (gitHub) {
      entries.push(gitHub);
    }
    const gitLabToken = await this.tokenStore.getGitLabToken();
    entries.push(`GL: ${gitLabToken ? 'token' : 'anon'}`);
    const azureToken = await this.tokenStore.getAzureDevOpsToken();
    entries.push(`AZ: ${azureToken ? 'token' : 'anon'}`);
    return `Auth: ${entries.join(' · ')}`;
  }

  private async getGitHubSummary(): Promise<string | undefined> {
    try {
      const session = await vscode.authentication.getSession('github', ['repo', 'read:user'], { createIfNone: false });
      if (session) {
        const scopes = session.scopes.length > 0 ? `(${session.scopes.join(', ')})` : '';
        return `GH: auth${scopes ? ' ' + scopes : ''}`;
      }
    } catch {
      // ignore auth errors
    }
    const token = await this.tokenStore.getGitHubToken();
    if (token) {
      return 'GH: token';
    }
    return 'GH: anon';
  }
}

function normalizeTagFilter(tags: string[]): string[] {
  const deduped = new Map<string, string>();
  tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .forEach((tag) => {
      const key = tag.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, tag);
      }
    });
  return Array.from(deduped.values());
}
