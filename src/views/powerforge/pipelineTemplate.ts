import * as path from 'path';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { getForgeFlowSettings } from '../../util/config';
import { pathExists, readDirectory } from '../../util/fs';

export async function createPipelineTemplate(scriptPath: string): Promise<boolean> {
  const root = path.dirname(path.dirname(scriptPath));
  if (!root || root === path.dirname(root)) {
    return false;
  }
  const configPath = path.join(root, 'powerforge.json');
  if (await pathExists(configPath)) {
    vscode.window.showWarningMessage('ForgeFlow: powerforge.json already exists.');
    return false;
  }
  const generated = await generatePipelineFromLegacyScript(scriptPath, configPath, root);
  if (!generated) {
    return false;
  }
  if (!await pathExists(configPath)) {
    vscode.window.showErrorMessage('ForgeFlow: PowerForge template generation finished without creating powerforge.json.');
    return false;
  }
  vscode.window.showInformationMessage(`ForgeFlow: Created ${configPath}`);
  return true;
}

interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function generatePipelineFromLegacyScript(scriptPath: string, configPath: string, projectRoot: string): Promise<boolean> {
  const launcher = await resolvePowerForgeLauncher(projectRoot);
  const args = ['template', '--script', scriptPath, '--out', configPath, '--output', 'json', '--project-root', projectRoot];
  const result = await runProcess(launcher.command, [...launcher.args, ...args], projectRoot);
  if (result.code !== 0) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    const details = stderr || stdout;
    if (isTemplateUnsupported(details)) {
      vscode.window.showErrorMessage('ForgeFlow: PowerForge CLI does not support "template" yet. Please update PowerForge CLI.');
      return false;
    }
    vscode.window.showErrorMessage(`ForgeFlow: Failed to generate powerforge.json${details ? `: ${details}` : '.'}`);
    return false;
  }
  return true;
}

interface PowerForgeLauncher {
  command: string;
  args: string[];
}

async function resolvePowerForgeLauncher(projectRoot?: string): Promise<PowerForgeLauncher> {
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

function runProcess(command: string, args: string[], cwd?: string): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command, args, { cwd, windowsHide: true });
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      resolve({ code: 1, stdout, stderr: error.message });
    });
    child.on('close', (code) => {
      resolve({ code: typeof code === 'number' ? code : 1, stdout, stderr });
    });
  });
}

function isTemplateUnsupported(output: string): boolean {
  if (!output) {
    return false;
  }
  const lower = output.toLowerCase();
  if (lower.includes('unknown command') || lower.includes('unrecognized command') || lower.includes('invalid command')) {
    return lower.includes('template');
  }
  if (lower.includes('powerforge cli') && lower.includes('usage:')) {
    return !lower.includes('powerforge template');
  }
  return false;
}
