import * as path from 'path';
import * as vscode from 'vscode';
import { readFileText } from '../../util/fs';
import type { PowerForgeConfigSummary } from './types';
import { safeJsonParse } from './utils';

export async function readDotNetPublishSummary(filePath: string): Promise<PowerForgeConfigSummary> {
  const text = await readFileText(filePath);
  const parsed = text ? safeJsonParse(text) : undefined;
  const dotnet = parsed?.DotNet ?? {};
  const projectRoot = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))?.uri.fsPath;
  return {
    kind: 'dotnetpublish',
    path: filePath,
    projectRoot,
    title: `DotNet Publish: ${path.basename(filePath)}`,
    dotnet: {
      projectRoot: dotnet.ProjectRoot,
      solutionPath: dotnet.SolutionPath,
      configuration: dotnet.Configuration,
      runtimes: Array.isArray(dotnet.Runtimes) ? dotnet.Runtimes : []
    }
  };
}

export async function saveDotNetPublishConfig(filePath: string, data: Record<string, unknown>): Promise<void> {
  const text = await readFileText(filePath);
  const parsed = text ? safeJsonParse(text) : undefined;
  if (!parsed) {
    vscode.window.showWarningMessage('ForgeFlow: Failed to parse PowerForge dotnet publish JSON.');
    return;
  }
  const payload = data as Record<string, unknown>;
  parsed.DotNet = parsed.DotNet ?? {};
  const root = String(payload['dotnetProjectRoot'] ?? '').trim();
  if (root) {
    parsed.DotNet.ProjectRoot = root;
  }
  const solution = String(payload['dotnetSolutionPath'] ?? '').trim();
  if (solution) {
    parsed.DotNet.SolutionPath = solution;
  }
  const configuration = String(payload['dotnetConfiguration'] ?? '').trim();
  if (configuration) {
    parsed.DotNet.Configuration = configuration;
  }
  const runtimes = String(payload['dotnetRuntimes'] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (runtimes.length > 0) {
    parsed.DotNet.Runtimes = runtimes;
  }
  await writeJsonFile(filePath, parsed);
  vscode.window.setStatusBarMessage('ForgeFlow: PowerForge dotnet publish config saved.', 3000);
}

async function writeJsonFile(filePath: string, data: Record<string, any>): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(json, 'utf8'));
}
