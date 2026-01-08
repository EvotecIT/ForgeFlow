import * as vscode from 'vscode';
import type { DashboardService } from '../dashboard/dashboardService';
import { renderDashboardHtml } from '../dashboard/webviewHtml';
import { ForgeFlowLogger } from '../util/log';

export class DashboardViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  public constructor(
    private readonly dashboardService: DashboardService,
    private readonly logger: ForgeFlowLogger
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.onDidReceiveMessage(async (message: { type?: string; url?: string; path?: string }) => {
      if (message.type === 'refresh') {
        await this.refresh();
      }
      if (message.type === 'openUrl' && message.url) {
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
      }
      if (message.type === 'openProject' && message.path) {
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(message.path), false);
      }
    });

    void this.refresh();
  }

  public async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }
    this.view.webview.html = renderDashboardHtml([], this.view.webview, { loading: true });
    try {
      const rows = await this.dashboardService.buildRows();
      this.view.webview.html = renderDashboardHtml(rows, this.view.webview);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Dashboard refresh failed: ${message}`);
      this.view.webview.html = renderDashboardHtml([], this.view.webview, { message: 'Dashboard refresh failed.' });
    }
  }
}
