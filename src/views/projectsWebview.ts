import * as vscode from 'vscode';
import type { ProjectsViewProvider, ProjectsWebviewDetails, ProjectsWebviewSnapshot } from './projectsView';
import type { ProjectsStore } from '../store/projectsStore';
import type { DashboardViewProvider } from './dashboardView';
import { buildProjectsWebviewUpdate, renderProjectsWebviewHtml } from './projectsWebviewHtml';

interface ProjectActionMessage {
  type?: string;
  action?: string;
  projectId?: string;
  filter?: string;
  tags?: string[];
  extra?: string;
  path?: string;
}

export class ProjectsWebviewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private lastSnapshot?: ProjectsWebviewSnapshot;
  private detailsCache = new Map<string, ProjectsWebviewDetails>();
  private pendingFocusFilter = false;
  private hasRendered = false;

  public constructor(
    private readonly projectsProvider: ProjectsViewProvider,
    private readonly projectsStore: ProjectsStore,
    private readonly dashboardProvider: DashboardViewProvider
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.title = 'Projects Web — ForgeFlow';
    this.hasRendered = false;
    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.onDidReceiveMessage(async (message: ProjectActionMessage) => {
      await this.handleMessage(message);
    });

    void this.refresh();

    if (this.pendingFocusFilter) {
      this.pendingFocusFilter = false;
      void webviewView.webview.postMessage({ type: 'focusFilter' });
    }
  }

  public async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }
    this.lastSnapshot = this.projectsProvider.getWebviewSnapshot();
    this.detailsCache.clear();
    if (!this.hasRendered) {
      this.view.webview.html = renderProjectsWebviewHtml(this.lastSnapshot, this.view.webview);
      this.hasRendered = true;
      return;
    }
    const update = buildProjectsWebviewUpdate(this.lastSnapshot);
    void this.view.webview.postMessage({ type: 'sync', update });
  }

  public clearDetailsCache(): void {
    this.detailsCache.clear();
  }

  public async focusFilter(): Promise<void> {
    if (!this.view) {
      this.pendingFocusFilter = true;
      return;
    }
    this.view.show?.(false);
    void this.view.webview.postMessage({ type: 'focusFilter' });
  }

  private async handleMessage(message: ProjectActionMessage): Promise<void> {
    if (!message?.type) {
      return;
    }
    switch (message.type) {
      case 'setFilter': {
        const filter = typeof message.filter === 'string' ? message.filter : '';
        this.projectsProvider.setFilter(filter);
        break;
      }
      case 'setTagFilter': {
        const tags = Array.isArray(message.tags) ? message.tags.filter((tag) => typeof tag === 'string') : [];
        await this.projectsProvider.setTagFilter(tags);
        await this.dashboardProvider.applyTagFilter(tags, false, true);
        break;
      }
      case 'toggleFavoritesOnly': {
        await this.projectsProvider.toggleFavoritesOnly();
        await this.refresh();
        break;
      }
      case 'loadMore': {
        this.projectsProvider.loadMore();
        await this.refresh();
        break;
      }
      case 'refreshProjects': {
        await vscode.commands.executeCommand('forgeflow.projects.refresh');
        break;
      }
      case 'requestProjectDetails': {
        if (!message.projectId) {
          return;
        }
        const details = await this.getProjectDetails(message.projectId);
        if (details) {
          void this.view?.webview.postMessage({ type: 'projectDetails', details });
        }
        break;
      }
      case 'requestBrowse': {
        if (!message.projectId || !message.path) {
          return;
        }
        const entries = await this.projectsProvider.getWebviewBrowseEntries(message.projectId, message.path);
        if (entries) {
          void this.view?.webview.postMessage({
            type: 'browseEntries',
            projectId: message.projectId,
            path: message.path,
            entries
          });
        }
        break;
      }
      case 'projectAction': {
        await this.handleProjectAction(message);
        break;
      }
      default:
        break;
    }
  }

  private async handleProjectAction(message: ProjectActionMessage): Promise<void> {
    const projectId = message.projectId;
    const action = message.action;
    if (!projectId || !action) {
      return;
    }
    const project = this.projectsStore.list().find((item) => item.id === projectId);
    if (!project) {
      return;
    }

    switch (action) {
      case 'open-project':
        await vscode.commands.executeCommand('forgeflow.projects.open', project.path);
        return;
      case 'open-new-window':
        await vscode.commands.executeCommand('forgeflow.projects.openInNewWindow', project.path);
        return;
      case 'add-workspace':
        await vscode.commands.executeCommand('forgeflow.projects.addToWorkspace', project.path);
        return;
      case 'open-terminal':
        await vscode.commands.executeCommand('forgeflow.projects.openInTerminal', project.path);
        return;
      case 'run-project':
        await vscode.commands.executeCommand('forgeflow.projects.run', project.path);
        return;
      case 'git-clean':
        await vscode.commands.executeCommand('forgeflow.projects.gitClean', project.path);
        return;
      case 'open-vs':
        await vscode.commands.executeCommand('forgeflow.projects.openInVisualStudio', project.path);
        return;
      case 'set-tags':
        await vscode.commands.executeCommand('forgeflow.projects.setTags', project);
        return;
      case 'set-run-target':
        await vscode.commands.executeCommand('forgeflow.run.setProjectTarget', project);
        await this.refresh();
        return;
      case 'clear-run-target':
        await vscode.commands.executeCommand('forgeflow.run.clearProjectTarget', project);
        await this.refresh();
        return;
      case 'set-run-profile':
        await vscode.commands.executeCommand('forgeflow.run.setProjectProfile', project);
        await this.refresh();
        return;
      case 'clear-run-profile':
        await vscode.commands.executeCommand('forgeflow.run.clearProjectProfile', project);
        await this.refresh();
        return;
      case 'set-run-keep-open':
        await vscode.commands.executeCommand('forgeflow.run.setProjectKeepOpen', project);
        await this.refresh();
        return;
      case 'clear-run-keep-open':
        await vscode.commands.executeCommand('forgeflow.run.clearProjectKeepOpen', project);
        await this.refresh();
        return;
      case 'set-run-cwd':
        await vscode.commands.executeCommand('forgeflow.run.setProjectWorkingDirectory', project);
        await this.refresh();
        return;
      case 'clear-run-cwd':
        await vscode.commands.executeCommand('forgeflow.run.clearProjectWorkingDirectory', project);
        await this.refresh();
        return;
      case 'open-pinned': {
        const path = message.extra;
        if (path) {
          await vscode.commands.executeCommand('forgeflow.files.open', path);
        }
        return;
      }
      case 'unpin-item': {
        const path = message.extra;
        if (path) {
          await vscode.commands.executeCommand('forgeflow.projects.unpinItem', path);
          await this.refresh();
        }
        return;
      }
      case 'open-entry': {
        const entry = await this.resolveEntry(projectId, message.extra);
        if (entry) {
          await vscode.commands.executeCommand('forgeflow.projects.openEntryPoint', entry);
        }
        return;
      }
      case 'open-browse': {
        const path = message.extra;
        if (path) {
          await vscode.commands.executeCommand('forgeflow.files.open', path);
        }
        return;
      }
      case 'run-entry': {
        const entry = await this.resolveEntry(projectId, message.extra);
        if (entry) {
          if (entry.kind === 'task') {
            await vscode.commands.executeCommand('forgeflow.projects.runTask', entry, project);
            return;
          }
          await vscode.commands.executeCommand('forgeflow.run', entry.path);
        }
        return;
      }
      case 'run-preset': {
        const presetId = message.extra;
        const details = await this.getProjectDetails(projectId);
        const preset = details?.runPresets.find((item) => item.id === presetId);
        if (preset) {
          await vscode.commands.executeCommand('forgeflow.projects.runPresetItem', preset, project);
        }
        return;
      }
      case 'run-history': {
        const historyId = message.extra;
        const details = await this.getProjectDetails(projectId);
        const entry = details?.recentRuns.find((item) => item.id === historyId);
        if (entry) {
          await vscode.commands.executeCommand('forgeflow.projects.runHistoryItem', entry, project);
        }
        return;
      }
      default:
        return;
    }
  }

  private async getProjectDetails(projectId: string): Promise<ProjectsWebviewDetails | undefined> {
    const cached = this.detailsCache.get(projectId);
    if (cached) {
      return cached;
    }
    const details = await this.projectsProvider.getWebviewProjectDetails(projectId);
    if (details) {
      this.detailsCache.set(projectId, details);
    }
    return details;
  }

  private async resolveEntry(projectId: string, entryKey?: string) {
    if (!entryKey) {
      return undefined;
    }
    const details = await this.getProjectDetails(projectId);
    if (!details) {
      return undefined;
    }
    return details.entryPoints.find((entry) => entry.key === entryKey)
      ?? details.buildScripts.find((entry) => entry.key === entryKey);
  }
}
