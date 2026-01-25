import * as path from 'path';
import * as vscode from 'vscode';
import type { Project } from '../models/project';
import type { ProjectsStore } from '../store/projectsStore';
import { extractProject, extractPath, resolveTargetPath } from './selection';
import { isWithin, normalizeFsPath } from './pathUtils';

export function findProjectByPath(projects: Project[], filePath: string): Project | undefined {
  const resolved = normalizeFsPath(path.resolve(filePath));
  return projects.find((project) => isWithin(normalizeFsPath(project.path), resolved));
}

export function resolveProjectTarget(target: unknown, store: ProjectsStore): Project | undefined {
  const project = extractProject(target);
  if (project) {
    return project;
  }
  const targetPath = resolveTargetPath(target);
  if (!targetPath) {
    return undefined;
  }
  return findProjectByPath(store.list(), targetPath);
}

export function resolveProjectFromTarget(target: unknown, projectsStore: ProjectsStore): Project | undefined {
  const direct = extractProject(target);
  if (direct) {
    return direct;
  }
  const targetPath = extractPath(target);
  if (!targetPath) {
    return undefined;
  }
  return findProjectByPath(projectsStore.list(), targetPath);
}

export async function pickProject(projects: Project[], placeHolder: string): Promise<Project | undefined> {
  if (projects.length === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No projects available.');
    return undefined;
  }
  const items = projects
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((project) => ({
      label: project.name,
      description: project.path,
      project
    }));
  const pick = await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true });
  return pick?.project;
}
