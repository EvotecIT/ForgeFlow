import * as path from 'path';
import * as vscode from 'vscode';
import type { ProjectEntryPoint } from '../models/project';
import { readDirectory } from '../util/fs';

const readmeNames = new Set(['README.md', 'README.txt', 'README']);

export async function detectEntryPoints(projectPath: string): Promise<ProjectEntryPoint[]> {
  const entries = await readDirectory(projectPath);
  const entryPoints: ProjectEntryPoint[] = [];

  for (const [name, type] of entries) {
    if (type !== vscode.FileType.File) {
      continue;
    }
    if (name.endsWith('.sln')) {
      entryPoints.push({
        label: name,
        path: path.join(projectPath, name),
        kind: 'sln'
      });
      continue;
    }
    if (name.endsWith('.csproj')) {
      entryPoints.push({
        label: name,
        path: path.join(projectPath, name),
        kind: 'csproj'
      });
      continue;
    }
    if (name === 'package.json') {
      entryPoints.push({
        label: 'package.json',
        path: path.join(projectPath, name),
        kind: 'node'
      });
      continue;
    }
    if (name.endsWith('.psm1') || name.endsWith('.psd1') || name.endsWith('.ps1')) {
      entryPoints.push({
        label: name,
        path: path.join(projectPath, name),
        kind: 'powershell'
      });
      continue;
    }
    if (readmeNames.has(name)) {
      entryPoints.push({
        label: name,
        path: path.join(projectPath, name),
        kind: 'readme'
      });
    }
  }

  if (entryPoints.length === 0) {
    entryPoints.push({
      label: 'Open Folder',
      path: projectPath,
      kind: 'other'
    });
  }

  return entryPoints;
}
