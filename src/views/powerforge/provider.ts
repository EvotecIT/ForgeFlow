import * as path from 'path';
import * as vscode from 'vscode';
import type { ProjectsStore } from '../../store/projectsStore';
import type { PowerForgeViewState } from './types';
import { renderView } from './render/layout';
import { collectSearchRoots, findLegacyBuildScripts, findPowerForgeConfigsInRoot, uniqueFsPaths } from './scan';
import { readPipelineSummary, savePipelineConfig, createPipelineTemplate } from './pipeline';
import { readDotNetPublishSummary, saveDotNetPublishConfig } from './dotnetPublish';

export class PowerForgeViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'forgeflow.powerforge';
  private view?: vscode.WebviewView;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly projectsStore: ProjectsStore
  ) {}

  public resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.title = 'PowerForge Manager';
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };
    view.webview.onDidReceiveMessage(async (message) => {
      await this.handleMessage(message);
    });
    void this.refresh();
  }

  public async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }
    const state = await this.buildState();
    this.view.description = 'Workspace';
    this.view.webview.html = renderView(state);
  }

  private async buildState(): Promise<PowerForgeViewState> {
    const configs = [];
    const { roots, scope } = await collectSearchRoots(this.projectsStore);
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    const workspaceRoots = workspaceFolders.map((folder) => folder.uri.fsPath);
    const workspaceLabel = workspaceFolders.length === 0
      ? 'No workspace'
      : workspaceFolders.map((folder) => folder.name || path.basename(folder.uri.fsPath)).join(', ');

    const pipelinePaths: string[] = [];
    const dotnetPaths: string[] = [];
    for (const root of roots) {
      pipelinePaths.push(...await findPowerForgeConfigsInRoot(root, 'pipeline'));
      dotnetPaths.push(...await findPowerForgeConfigsInRoot(root, 'dotnetpublish'));
    }

    for (const filePath of uniqueFsPaths(pipelinePaths)) {
      const summary = await readPipelineSummary(filePath);
      configs.push(summary);
    }
    for (const filePath of uniqueFsPaths(dotnetPaths)) {
      const summary = await readDotNetPublishSummary(filePath);
      configs.push(summary);
    }

    const legacyBuildScripts = await findLegacyBuildScripts(roots);
    return {
      configs,
      legacyBuildScripts,
      scope,
      workspaceRoots,
      workspaceLabel,
      projectCount: this.projectsStore.list().length
    };
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object') {
      return;
    }
    const payload = message as { type?: string; path?: string; data?: Record<string, unknown> };
    if (!payload.type) {
      return;
    }
    switch (payload.type) {
      case 'refresh':
        await this.refresh();
        return;
      case 'openConfig':
        if (payload.path) {
          const document = await vscode.workspace.openTextDocument(vscode.Uri.file(payload.path));
          await vscode.window.showTextDocument(document, { preview: false });
        }
        return;
      case 'planPipeline':
        if (payload.path) {
          await vscode.commands.executeCommand('forgeflow.powerforge.plan', payload.path);
        }
        return;
      case 'runPipeline':
        if (payload.path) {
          await vscode.commands.executeCommand('forgeflow.powerforge.pipeline', payload.path);
        }
        return;
      case 'planDotnetPublish':
        if (payload.path) {
          await vscode.commands.executeCommand('forgeflow.powerforge.dotnetPublish.plan', payload.path);
        }
        return;
      case 'runDotnetPublish':
        if (payload.path) {
          await vscode.commands.executeCommand('forgeflow.powerforge.dotnetPublish', payload.path);
        }
        return;
      case 'validateDotnetPublish':
        if (payload.path) {
          await vscode.commands.executeCommand('forgeflow.powerforge.dotnetPublish.validate', payload.path);
        }
        return;
      case 'savePipeline':
        if (payload.path && payload.data) {
          await savePipelineConfig(payload.path, payload.data);
          await this.refresh();
        }
        return;
      case 'saveDotnetPublish':
        if (payload.path && payload.data) {
          await saveDotNetPublishConfig(payload.path, payload.data);
          await this.refresh();
        }
        return;
      case 'createPipelineTemplate':
        if (payload.path) {
          const created = await createPipelineTemplate(payload.path);
          if (created) {
            await this.refresh();
          }
        }
        return;
      default:
        return;
    }
  }
}
