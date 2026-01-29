import * as path from 'path';
import * as vscode from 'vscode';
import { pathExists } from '../../util/fs';
import type { ProjectsStore } from '../../store/projectsStore';
import { EXCLUDE_PATTERN, POWERFORGE_DOTNETPUBLISH_CONFIGS, POWERFORGE_PIPELINE_CONFIGS } from './constants';
import type { PowerForgeConfigKind } from './types';

export function uniqueFsPaths(paths: string[]): string[] {
  const map = new Map<string, string>();
  for (const value of paths) {
    map.set(value, value);
  }
  return [...map.values()];
}

export async function collectSearchRoots(_projectsStore: ProjectsStore): Promise<{ roots: string[]; scope: 'workspace' | 'projects' }> {
  void _projectsStore;
  const roots = new Map<string, string>();
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  for (const folder of workspaceFolders) {
    roots.set(folder.uri.fsPath, folder.uri.fsPath);
  }
  return { roots: [...roots.values()], scope: 'workspace' };
}

export async function findPowerForgeConfigsInRoot(root: string, kind: PowerForgeConfigKind): Promise<string[]> {
  const names = kind === 'pipeline' ? POWERFORGE_PIPELINE_CONFIGS : POWERFORGE_DOTNETPUBLISH_CONFIGS;
  const results: string[] = [];
  for (const name of names) {
    const candidate = path.join(root, name);
    if (await pathExists(candidate)) {
      results.push(candidate);
    }
  }
  return results;
}

export async function findLegacyBuildScripts(roots: string[]): Promise<string[]> {
  const results: string[] = [];
  for (const root of roots) {
    const scriptPath = path.join(root, 'Build', 'Build-Module.ps1');
    if (await pathExists(scriptPath)) {
      results.push(scriptPath);
    }
  }
  if (results.length > 0) {
    return uniqueFsPaths(results);
  }
  const uris = await vscode.workspace.findFiles('**/Build/Build-Module.ps1', EXCLUDE_PATTERN);
  return uniqueFsPaths(uris.map((uri) => uri.fsPath));
}
