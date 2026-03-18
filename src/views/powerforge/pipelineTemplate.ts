import * as path from 'path';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { resolvePowerForgeLauncher } from '../../powerforge/launcher';
import { pathExists } from '../../util/fs';

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
