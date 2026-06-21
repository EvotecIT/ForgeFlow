import * as path from 'path';
import * as vscode from 'vscode';
import type { Project, ProjectType } from '../models/project';
import { stableIdFromPath } from '../util/ids';
import { isDirectory, statPath } from '../util/fs';
import { isPreferredSolutionFileName, isSolutionFileName } from '../util/solutionFiles';
import { walkDirectoriesBreadthFirst } from './walk';

interface MarkerMatch {
  type: ProjectType;
  markerPath: string;
}

const markerPriority: Record<ProjectType, number> = {
  git: 5,
  sln: 4,
  csproj: 3,
  powershell: 2,
  node: 1,
  unknown: 0
};

const defaultIgnoredScanFolders = new Set([
  '_cleanup',
  '_tmp',
  '_worktree_archives'
]);

const allowedHiddenScanFolders = new Set([
  '.worktrees',
  '.wt'
]);

const knownWorktreeContainerFolders = new Set([
  '.worktrees',
  '.wt',
  '_worktrees',
  '_wt'
]);

export class ProjectScanner {
  public async scan(
    roots: string[],
    maxDepth: number,
    existing: Project[],
    ignoredFolders: readonly string[] = [...defaultIgnoredScanFolders]
  ): Promise<Project[]> {
    const resultsById = new Map<string, Project>();
    const existingMap = new Map(existing.map((project) => [project.id, project]));
    const existingByPath = new Map(existing.map((project) => [normalizeScanPath(project.path), project]));
    const ignoredFolderSet = new Set([
      ...defaultIgnoredScanFolders,
      ...ignoredFolders.map((value) => value.trim().toLowerCase()).filter(Boolean)
    ]);

    for (const root of roots) {
      const found = await this.scanRoot(root, maxDepth, existingByPath, ignoredFolderSet);
      for (const project of found) {
        const previous = existingMap.get(project.id);
        const next: Project = {
          ...project,
          lastOpened: previous?.lastOpened,
          lastModified: previous?.lastModified ?? project.lastModified,
          lastGitCommit: previous?.lastGitCommit,
          pinnedItems: previous?.pinnedItems ?? [],
          entryPointOverrides: previous?.entryPointOverrides ?? [],
          preferredRunProfileId: previous?.preferredRunProfileId,
          preferredRunTarget: previous?.preferredRunTarget,
          preferredRunWorkingDirectory: previous?.preferredRunWorkingDirectory,
          runPresets: previous?.runPresets ?? [],
          identity: previous?.identity,
          tags: previous?.tags ?? project.tags
        };
        resultsById.set(next.id, next);
      }
    }

    return Array.from(resultsById.values());
  }

  private async scanRoot(
    root: string,
    maxDepth: number,
    existingByPath: Map<string, Project>,
    ignoredFolders: ReadonlySet<string>
  ): Promise<Project[]> {
    const projects: Project[] = [];
    await walkDirectoriesBreadthFirst(root, maxDepth, async ({ dir, depth, entries, enqueue }) => {
      const marker = await this.detectMarker(dir, entries);
      if (marker) {
        const directChildGitProjects = marker.type === 'git' && depth === 0
          ? await this.findDirectChildGitProjects(dir, entries, ignoredFolders)
          : [];
        const isContainerRoot = isProjectContainerRoot(marker, depth, directChildGitProjects.length);
        if (!isContainerRoot) {
          const project = await this.createProject(dir, marker, existingByPath);
          projects.push(project);
        }
        if (marker.type === 'git') {
          enqueueKnownWorktreeContainers(entries, ignoredFolders, enqueue);
          if (isContainerRoot) {
            for (const name of directChildGitProjects) {
              enqueue(name);
            }
          }
        }
        return;
      }

      for (const [name, type] of entries) {
        if (type !== vscode.FileType.Directory) {
          continue;
        }
        const nameLower = name.toLowerCase();
        if (nameLower === 'node_modules') {
          continue;
        }
        if (name.startsWith('.') && !allowedHiddenScanFolders.has(nameLower)) {
          continue;
        }
        if (ignoredFolders.has(nameLower)) {
          continue;
        }
        enqueue(name);
      }
    });

    return projects;
  }

  private async findDirectChildGitProjects(
    root: string,
    entries: [string, vscode.FileType][],
    ignoredFolders: ReadonlySet<string>
  ): Promise<string[]> {
    const projectNames: string[] = [];
    for (const [name, type] of entries) {
      if (!shouldProbeChildProject(name, type, ignoredFolders)) {
        continue;
      }
      if (await hasDirectGitDirectory(path.join(root, name))) {
        projectNames.push(name);
        if (projectNames.length >= 3) {
          return projectNames;
        }
      }
    }
    return projectNames;
  }

  private async detectMarker(dir: string, entries: [string, vscode.FileType][]): Promise<MarkerMatch | undefined> {
    let marker: MarkerMatch | undefined;
    for (const [name, type] of entries) {
      const nameLower = name.toLowerCase();
      const isDirectory = type === vscode.FileType.Directory;
      const isFile = type === vscode.FileType.File;
      if (nameLower === '.git' && (isDirectory || isFile)) {
        marker = chooseMarker(marker, { type: 'git', markerPath: path.join(dir, '.git') });
        continue;
      }
      if (isSolutionFileName(nameLower) && isFile) {
        marker = chooseMarker(marker, { type: 'sln', markerPath: path.join(dir, name) });
        continue;
      }
      if (nameLower.endsWith('.csproj') && isFile) {
        marker = chooseMarker(marker, { type: 'csproj', markerPath: path.join(dir, name) });
        continue;
      }
      if ((nameLower.endsWith('.psd1') || nameLower.endsWith('.psm1')) && isFile) {
        marker = chooseMarker(marker, { type: 'powershell', markerPath: path.join(dir, name) });
        continue;
      }
      if (nameLower === 'package.json' && isFile) {
        marker = chooseMarker(marker, { type: 'node', markerPath: path.join(dir, name) });
      }
    }

    return marker;
  }

  private async createProject(
    root: string,
    marker: MarkerMatch,
    existingByPath: Map<string, Project>
  ): Promise<Project> {
    const existing = existingByPath.get(normalizeScanPath(root));
    const id = existing?.id ?? stableIdFromPath(root);
    const name = path.basename(root);
    const stat = await statPath(marker.markerPath);

    return {
      id,
      name,
      path: root,
      type: marker.type,
      tags: [marker.type],
      lastModified: stat?.mtime,
      pinnedItems: [],
      entryPointOverrides: [],
      runPresets: []
    };
  }
}

function enqueueKnownWorktreeContainers(
  entries: [string, vscode.FileType][],
  ignoredFolders: ReadonlySet<string>,
  enqueue: (name: string) => void
): void {
  for (const [name, type] of entries) {
    if (type !== vscode.FileType.Directory) {
      continue;
    }
    const nameLower = name.toLowerCase();
    if (!knownWorktreeContainerFolders.has(nameLower)) {
      continue;
    }
    if (ignoredFolders.has(nameLower)) {
      continue;
    }
    enqueue(name);
  }
}

function isProjectContainerRoot(marker: MarkerMatch, depth: number, directChildProjectCount: number): boolean {
  return marker.type === 'git' && depth === 0 && directChildProjectCount >= 3;
}

async function hasDirectGitDirectory(root: string): Promise<boolean> {
  return isDirectory(await statPath(path.join(root, '.git')));
}

function shouldProbeChildProject(
  name: string,
  type: vscode.FileType,
  ignoredFolders: ReadonlySet<string>
): boolean {
  if (type !== vscode.FileType.Directory) {
    return false;
  }
  const nameLower = name.toLowerCase();
  if (nameLower === 'node_modules') {
    return false;
  }
  if (name.startsWith('.') && !allowedHiddenScanFolders.has(nameLower)) {
    return false;
  }
  return !ignoredFolders.has(nameLower);
}

function chooseMarker(current: MarkerMatch | undefined, next: MarkerMatch): MarkerMatch {
  if (!current) {
    return next;
  }
  const priorityDiff = markerPriority[next.type] - markerPriority[current.type];
  if (priorityDiff > 0) {
    return next;
  }
  if (priorityDiff === 0 && next.type === 'sln' && current.type === 'sln' && isPreferredSolutionFileName(next.markerPath, current.markerPath)) {
    return next;
  }
  return current;
}

function normalizeScanPath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
