import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export type BrowserTarget = 'default' | 'edge' | 'chrome' | 'chromium' | 'firefox' | 'firefox-dev';

interface SpawnCommand {
  command: string;
  args: string[];
}

interface VisualStudioInstance {
  instanceId?: string;
  displayName?: string;
  installationPath?: string;
  installationVersion?: string;
  isPrerelease?: boolean;
  productId?: string;
}

interface VisualStudioCandidate {
  instance: VisualStudioInstance;
  devenvPath: string;
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
  const candidates = resolveVisualStudioCandidates();
  const selected = await pickVisualStudioCandidate(candidates);
  if (selected) {
    try {
      await spawnDetached({ command: selected.devenvPath, args: [filePath] });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showWarningMessage(`ForgeFlow: Failed to launch Visual Studio (${message}). Falling back to default app.`);
    }
  }
  await vscode.env.openExternal(vscode.Uri.file(filePath));
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

function resolveVisualStudioCandidates(): VisualStudioCandidate[] {
  const vswhere = getVsWherePath();
  if (!vswhere) {
    return [];
  }
  const result = spawnSync(vswhere, ['-all', '-prerelease', '-format', 'json'], { encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout) {
    return [];
  }
  let instances: VisualStudioInstance[] = [];
  try {
    instances = JSON.parse(result.stdout) as VisualStudioInstance[];
  } catch {
    return [];
  }
  return instances
    .filter((instance) => Boolean(instance.installationPath))
    .map((instance) => ({
      instance,
      devenvPath: path.join(instance.installationPath ?? '', 'Common7', 'IDE', 'devenv.exe')
    }))
    .filter((candidate) => fs.existsSync(candidate.devenvPath));
}

async function pickVisualStudioCandidate(candidates: VisualStudioCandidate[]): Promise<VisualStudioCandidate | undefined> {
  if (candidates.length === 0) {
    return undefined;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  const items = candidates
    .slice()
    .sort((a, b) => compareVersionStrings(b.instance.installationVersion, a.instance.installationVersion))
    .map((candidate) => {
      const version = candidate.instance.installationVersion ?? 'unknown version';
      const prerelease = candidate.instance.isPrerelease ? 'Preview' : 'Release';
      const label = candidate.instance.displayName ?? candidate.instance.productId ?? 'Visual Studio';
      return {
        label: `${label} (${prerelease})`,
        description: version,
        detail: candidate.instance.installationPath,
        candidate
      };
    });
  const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Select Visual Studio instance' });
  return pick?.candidate;
}

function compareVersionStrings(a?: string, b?: string): number {
  if (!a && !b) {
    return 0;
  }
  if (!a) {
    return -1;
  }
  if (!b) {
    return 1;
  }
  const aParts = a.split('.').map((part) => Number(part));
  const bParts = b.split('.').map((part) => Number(part));
  const length = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < length; i += 1) {
    const left = aParts[i] ?? 0;
    const right = bParts[i] ?? 0;
    if (left !== right) {
      return left > right ? 1 : -1;
    }
  }
  return 0;
}

function getVsWherePath(): string | undefined {
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? process.env['ProgramFiles'];
  if (!programFilesX86) {
    return undefined;
  }
  const candidate = path.join(programFilesX86, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  return fs.existsSync(candidate) ? candidate : undefined;
}

function spawnDetached(command: SpawnCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, { detached: true, stdio: 'ignore' });
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onSpawn = () => {
      cleanup();
      child.unref();
      resolve();
    };
    const cleanup = () => {
      child.removeListener('error', onError);
      child.removeListener('spawn', onSpawn);
    };
    child.once('error', onError);
    child.once('spawn', onSpawn);
  });
}
