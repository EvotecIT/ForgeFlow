import * as path from 'path';
import * as vscode from 'vscode';
import { getForgeFlowSettings } from '../util/config';
import { pathExists, readDirectory } from '../util/fs';

export interface PowerForgeLauncher {
  command: string;
  args: string[];
}

export async function resolvePowerForgeLauncher(projectRoot?: string): Promise<PowerForgeLauncher> {
  const settings = getForgeFlowSettings();
  const configured = settings.powerforgeCliPath?.trim();
  if (configured) {
    if (await pathExists(configured)) {
      return { command: configured, args: [] };
    }
    vscode.window.showWarningMessage(`ForgeFlow: PowerForge CLI path not found: ${configured}`);
  }

  if (projectRoot) {
    const artifact = await findPowerForgeBinary(projectRoot);
    if (artifact) {
      return { command: artifact, args: [] };
    }
    const cliProject = path.join(projectRoot, 'PowerForge.Cli', 'PowerForge.Cli.csproj');
    if (await pathExists(cliProject)) {
      return { command: 'dotnet', args: ['run', '--project', cliProject, '--'] };
    }
  }

  return { command: process.platform === 'win32' ? 'powerforge.exe' : 'powerforge', args: [] };
}

async function findPowerForgeBinary(projectRoot: string): Promise<string | undefined> {
  const base = path.join(projectRoot, 'Artifacts', 'PowerForge');
  if (!await pathExists(base)) {
    return undefined;
  }
  const targetName = process.platform === 'win32' ? 'powerforge.exe' : 'powerforge';
  return findFileRecursive(base, targetName, 4);
}

async function findFileRecursive(root: string, fileName: string, depth: number): Promise<string | undefined> {
  if (depth < 0) {
    return undefined;
  }
  const entries = await readDirectory(root);
  for (const [name, type] of entries) {
    const fullPath = path.join(root, name);
    if (type === vscode.FileType.File && name.toLowerCase() === fileName.toLowerCase()) {
      return fullPath;
    }
    if (type === vscode.FileType.Directory) {
      const found = await findFileRecursive(fullPath, fileName, depth - 1);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}
