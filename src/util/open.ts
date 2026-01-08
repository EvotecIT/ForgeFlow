import { spawn } from 'child_process';
import * as vscode from 'vscode';

export type BrowserTarget = 'default' | 'edge' | 'chrome' | 'chromium' | 'firefox' | 'firefox-dev';

interface SpawnCommand {
  command: string;
  args: string[];
}

export async function openFileInDefaultApp(filePath: string): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.file(filePath));
}

export async function openFileInBrowser(filePath: string, browser: BrowserTarget = 'default'): Promise<void> {
  const fileUrl = vscode.Uri.file(filePath).toString(true);
  await openUrlInBrowser(fileUrl, browser);
}

export async function openUrlInBrowser(url: string, browser: BrowserTarget = 'default'): Promise<void> {
  if (browser === 'default') {
    await vscode.env.openExternal(vscode.Uri.parse(url));
    return;
  }
  const command = resolveBrowserCommand(url, browser);
  if (!command) {
    await vscode.env.openExternal(vscode.Uri.parse(url));
    return;
  }
  await spawnDetached(command);
}

export async function openInVisualStudio(filePath: string): Promise<void> {
  if (process.platform !== 'win32') {
    await vscode.env.openExternal(vscode.Uri.file(filePath));
    return;
  }
  const command: SpawnCommand = {
    command: 'cmd',
    args: ['/c', 'start', '', filePath]
  };
  await spawnDetached(command);
}

function resolveBrowserCommand(url: string, browser: BrowserTarget): SpawnCommand | undefined {
  if (process.platform === 'win32') {
    return resolveWindowsBrowser(url, browser);
  }
  if (process.platform === 'darwin') {
    return resolveMacBrowser(url, browser);
  }
  return resolveLinuxBrowser(url, browser);
}

function resolveWindowsBrowser(url: string, browser: BrowserTarget): SpawnCommand | undefined {
  const exe = browser === 'edge'
    ? 'msedge'
    : browser === 'chrome'
      ? 'chrome'
      : browser === 'chromium'
        ? 'chromium'
        : browser === 'firefox' || browser === 'firefox-dev'
          ? 'firefox'
          : undefined;
  if (!exe) {
    return undefined;
  }
  return {
    command: 'cmd',
    args: ['/c', 'start', '', exe, url]
  };
}

function resolveMacBrowser(url: string, browser: BrowserTarget): SpawnCommand | undefined {
  const app = browser === 'edge'
    ? 'Microsoft Edge'
    : browser === 'chrome'
      ? 'Google Chrome'
      : browser === 'chromium'
        ? 'Chromium'
        : browser === 'firefox'
          ? 'Firefox'
          : browser === 'firefox-dev'
            ? 'Firefox Developer Edition'
            : undefined;
  if (!app) {
    return undefined;
  }
  return {
    command: 'open',
    args: ['-a', app, url]
  };
}

function resolveLinuxBrowser(url: string, browser: BrowserTarget): SpawnCommand | undefined {
  const cmd = browser === 'chromium'
    ? 'chromium'
    : browser === 'chrome'
      ? 'google-chrome'
      : browser === 'edge'
        ? 'microsoft-edge'
        : browser === 'firefox' || browser === 'firefox-dev'
          ? 'firefox'
          : undefined;
  if (!cmd) {
    return undefined;
  }
  return {
    command: cmd,
    args: [url]
  };
}

function spawnDetached(command: SpawnCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, { detached: true, stdio: 'ignore' });
    child.on('error', reject);
    child.unref();
    resolve();
  });
}
