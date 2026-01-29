import * as path from 'path';
import * as vscode from 'vscode';
import { getForgeFlowSettings } from '../../util/config';
import { openFileInBrowser, openFileInDefaultApp, openInVisualStudio } from '../../util/open';
import { ensureCustomBrowserPath, isBrowserFile, pickBrowserTarget } from '../browserUtils';
import { resolveTargetPath } from '../selection';

export function registerBrowserCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
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
    })
  );
}
