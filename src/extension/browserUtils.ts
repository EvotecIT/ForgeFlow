import * as path from 'path';
import * as vscode from 'vscode';
import type { BrowserTarget } from '../util/open';

export async function pickExecutablePath(title: string): Promise<string | undefined> {
  const filters = process.platform === 'win32'
    ? { Executable: ['exe', 'cmd', 'bat'] }
    : undefined;
  const selection = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    title,
    openLabel: 'Select',
    filters
  });
  return selection?.[0]?.fsPath;
}

export async function pickBrowserTarget(): Promise<BrowserTarget | undefined> {
  const options: Array<{ label: string; value: BrowserTarget; description?: string }> = [
    { label: 'Default Browser', value: 'default' },
    { label: 'Microsoft Edge', value: 'edge', description: 'Windows/macOS/Linux (if installed)' },
    { label: 'Google Chrome', value: 'chrome' },
    { label: 'Chromium', value: 'chromium' },
    { label: 'Firefox', value: 'firefox' },
    { label: 'Firefox Developer Edition', value: 'firefox-dev', description: 'macOS name differs' },
    { label: 'Custom Browser Path', value: 'custom' }
  ];
  const pick = await vscode.window.showQuickPick(options, { placeHolder: 'Open in browser' });
  return pick?.value;
}

export async function ensureCustomBrowserPath(): Promise<boolean> {
  const config = vscode.workspace.getConfiguration('forgeflow');
  const existing = config.get<string>('browser.customPath');
  if (existing && existing.trim().length > 0) {
    return true;
  }
  const picked = await pickExecutablePath('Select browser executable');
  if (!picked) {
    return false;
  }
  await config.update('browser.customPath', picked, vscode.ConfigurationTarget.Global);
  return true;
}

export function isBrowserFile(filePath: string, extensions: string[]): boolean {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  if (!ext) {
    return false;
  }
  return extensions.some((value) => value.replace('.', '').toLowerCase() === ext);
}
