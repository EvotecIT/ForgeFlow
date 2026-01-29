import * as path from 'path';
import * as vscode from 'vscode';
import type { Project, ProjectType } from '../models/project';
import { stableIdFromPath } from '../util/ids';
import { readDirectory, statPath } from '../util/fs';

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

export class ProjectScanner {
  public async scan(roots: string[], maxDepth: number, existing: Project[]): Promise<Project[]> {
    const results: Project[] = [];
    const existingMap = new Map(existing.map((project) => [project.id, project]));
    const existingByPath = new Map(existing.map((project) => [normalizeScanPath(project.path), project]));

    for (const root of roots) {
      const found = await this.scanRoot(root, maxDepth, existingByPath);
      for (const project of found) {
        const previous = existingMap.get(project.id);
        results.push({
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
        });
      }
    }

    return results;
  }

  private async scanRoot(
    root: string,
    maxDepth: number,
    existingByPath: Map<string, Project>
  ): Promise<Project[]> {
    const projects: Project[] = [];
    const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];

    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) {
        continue;
      }
      const { dir, depth } = next;
      const entries = await readDirectory(dir);
      const marker = await this.detectMarker(dir, entries);
      if (marker) {
        const project = await this.createProject(dir, marker, existingByPath);
        projects.push(project);
        continue;
      }

      if (depth >= maxDepth) {
        continue;
      }

      for (const [name, type] of entries) {
        if (type !== vscode.FileType.Directory) {
          continue;
        }
        if (name === 'node_modules' || name.startsWith('.')) {
          continue;
        }
        queue.push({ dir: path.join(dir, name), depth: depth + 1 });
      }
    }

    return projects;
  }

  private async detectMarker(dir: string, entries: [string, vscode.FileType][]): Promise<MarkerMatch | undefined> {
    let marker: MarkerMatch | undefined;
    for (const [name, type] of entries) {
      const isDirectory = type === vscode.FileType.Directory;
      const isFile = type === vscode.FileType.File;
      if (name === '.git' && (isDirectory || isFile)) {
        marker = chooseMarker(marker, { type: 'git', markerPath: path.join(dir, '.git') });
        continue;
      }
      if (name.endsWith('.sln') && isFile) {
        marker = chooseMarker(marker, { type: 'sln', markerPath: path.join(dir, name) });
        continue;
      }
      if (name.endsWith('.csproj') && isFile) {
        marker = chooseMarker(marker, { type: 'csproj', markerPath: path.join(dir, name) });
        continue;
      }
      if ((name.endsWith('.psd1') || name.endsWith('.psm1')) && isFile) {
        marker = chooseMarker(marker, { type: 'powershell', markerPath: path.join(dir, name) });
        continue;
      }
      if (name === 'package.json' && isFile) {
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

function chooseMarker(current: MarkerMatch | undefined, next: MarkerMatch): MarkerMatch {
  if (!current) {
    return next;
  }
  return markerPriority[next.type] > markerPriority[current.type] ? next : current;
}

function normalizeScanPath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
