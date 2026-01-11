import * as vscode from 'vscode';
import type { DashboardRow, DashboardService } from '../dashboard/dashboardService';
import { renderDashboardHtml } from '../dashboard/webviewHtml';
import type { ForgeFlowLogger } from '../util/log';
import type { DashboardCache } from '../dashboard/cache';
import type { DashboardFilterStore } from '../dashboard/filterStore';
import type { DashboardTokenStore } from '../dashboard/tokenStore';

export class DashboardViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private lastRows: DashboardRow[] = [];
  private lastUpdated?: number;
  private authSummary = '';
  private pendingFocusFilter = false;
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
    private readonly tokenStore: DashboardTokenStore
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true
    };

    void this.getAuthSummary().then((summary) => {
      this.authSummary = summary;
      if (this.view) {
        const filter = this.filterStore.getFilter();
        this.view.webview.html = renderDashboardHtml(this.lastRows, this.view.webview, {
          updatedAt: this.lastUpdated,
          filter,
          authSummary: this.authSummary
        });
      }
    });

    const cached = this.cache.load();
    if (cached?.rows?.length) {
      this.lastRows = cached.rows;
      this.lastUpdated = cached.updatedAt;
      const filter = this.filterStore.getFilter();
      webviewView.webview.html = renderDashboardHtml(this.lastRows, webviewView.webview, {
        updatedAt: this.lastUpdated,
        filter,
        authSummary: this.authSummary,
        progressCurrent: this.progressCurrent,
        progressTotal: this.progressTotal
      });
    }

    if (this.pendingFocusFilter) {
      this.pendingFocusFilter = false;
      void webviewView.webview.postMessage({ type: 'focusFilter' });
    }

    webviewView.webview.onDidReceiveMessage(async (message: { type?: string; url?: string; path?: string; filter?: string }) => {
      if (message.type === 'refresh') {
        await this.refresh();
      }
      if (message.type === 'cancelRefresh') {
        if (this.refreshController) {
          this.refreshController.abort();
          vscode.window.setStatusBarMessage('ForgeFlow: Dashboard refresh cancelled.', 3000);
          const filter = this.filterStore.getFilter();
          if (this.view) {
            this.view.webview.html = renderDashboardHtml(this.lastRows, this.view.webview, {
              updatedAt: this.lastUpdated,
              filter,
              authSummary: this.authSummary,
              progressCurrent: this.progressCurrent,
              progressTotal: this.progressTotal
            });
          }
        }
      }
      if (message.type === 'setFilter') {
        await this.filterStore.setFilter(message.filter ?? '');
      }
      if (message.type === 'openUrl' && message.url) {
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
      }
      if (message.type === 'openProject' && message.path) {
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(message.path), false);
      }
      if (message.type === 'revealInOs' && message.path) {
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(message.path));
      }
      if (message.type === 'copyPath' && message.path) {
        await vscode.env.clipboard.writeText(message.path);
        vscode.window.setStatusBarMessage('ForgeFlow: Path copied.', 2000);
      }
      if (message.type === 'copyRelativePath' && message.path) {
        await vscode.env.clipboard.writeText(message.path);
        vscode.window.setStatusBarMessage('ForgeFlow: Relative path copied.', 2000);
      }
    });

    void this.refresh();
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
    this.view.webview.html = renderDashboardHtml(this.lastRows, this.view.webview, {
      loading: true,
      updatedAt: this.lastUpdated,
      filter,
      authSummary: this.authSummary,
      progressCurrent: this.progressCurrent,
      progressTotal: this.progressTotal
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
      this.view.webview.html = renderDashboardHtml(rows, this.view.webview, {
        updatedAt: this.lastUpdated,
        filter,
        authSummary: this.authSummary,
        progressCurrent: this.progressCurrent,
        progressTotal: this.progressTotal
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
      this.view.webview.html = renderDashboardHtml(this.lastRows, this.view.webview, {
        message: 'Dashboard refresh failed.',
        updatedAt: this.lastUpdated,
        filter,
        authSummary: this.authSummary,
        progressCurrent: this.progressCurrent,
        progressTotal: this.progressTotal
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
