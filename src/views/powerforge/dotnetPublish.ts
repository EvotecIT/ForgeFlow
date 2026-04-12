import * as path from 'path';
import * as vscode from 'vscode';
import { readFileText } from '../../util/fs';
import type { PowerForgeConfigSummary } from './types';
import { writeJsonFile } from './io';
import { asString, ensureRecord, safeJsonParse, toStringArray } from './utils';

export async function readDotNetPublishSummary(filePath: string): Promise<PowerForgeConfigSummary> {
  const text = await readFileText(filePath);
  const parsed = text ? safeJsonParse(text) : undefined;
  const dotnet = ensureRecord(parsed?.['DotNet']);
  const projectRoot = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))?.uri.fsPath;
  return {
    kind: 'dotnetpublish',
    path: filePath,
    projectRoot,
    title: `DotNet Publish: ${path.basename(filePath)}`,
    dotnet: {
      projectRoot: asString(dotnet['ProjectRoot']),
      solutionPath: asString(dotnet['SolutionPath']),
      configuration: asString(dotnet['Configuration']),
      runtimes: toStringArray(dotnet['Runtimes'])
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
  const dotnet = ensureRecord(parsed['DotNet']);
  parsed['DotNet'] = dotnet;
  const root = String(payload['dotnetProjectRoot'] ?? '').trim();
  if (root) {
    dotnet['ProjectRoot'] = root;
  }
  const solution = String(payload['dotnetSolutionPath'] ?? '').trim();
  if (solution) {
    dotnet['SolutionPath'] = solution;
  }
  const configuration = String(payload['dotnetConfiguration'] ?? '').trim();
  if (configuration) {
    dotnet['Configuration'] = configuration;
  }
  const runtimes = String(payload['dotnetRuntimes'] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (runtimes.length > 0) {
    dotnet['Runtimes'] = runtimes;
  }
  await writeJsonFile(filePath, parsed);
  vscode.window.setStatusBarMessage('ForgeFlow: PowerForge dotnet publish config saved.', 3000);
}
