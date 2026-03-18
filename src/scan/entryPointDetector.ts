import * as path from 'path';
import * as vscode from 'vscode';
import type { ProjectEntryPoint } from '../models/project';
import { readDirectory, readFileText, statPath } from '../util/fs';
import { walkDirectoriesBreadthFirst } from './walk';

export interface EntryPointOptions {
  maxDepth: number;
  preferredFolders: string[];
  fileNames: string[];
  customPaths?: string[];
  maxCount: number;
}

export interface EntryPointGroups {
  entryPoints: ProjectEntryPoint[];
  buildScripts: ProjectEntryPoint[];
}

const readmeNames = new Set(['README.md', 'README.txt', 'README']);
const skipFolders = new Set(['.git', '.vs', '.vscode', 'node_modules', 'bin', 'obj', 'dist', 'out']);
const buildFolderHints = new Set(['build', 'builds', 'scripts', 'script', 'tools', 'tool']);

export async function detectEntryPoints(projectPath: string, options?: EntryPointOptions): Promise<ProjectEntryPoint[]> {
  const groups = await detectEntryPointGroups(projectPath, options);
  return groups.entryPoints;
}

export async function detectEntryPointGroups(projectPath: string, options?: EntryPointOptions): Promise<EntryPointGroups> {
  const entryPoints: ProjectEntryPoint[] = [];
  const buildScripts: ProjectEntryPoint[] = [];
  const seen = new Set<string>();
  const maxCount = Math.max(1, options?.maxCount ?? 8);
  const entryLimit = maxCount;
  const buildLimit = maxCount;

  const addEntry = (entry: ProjectEntryPoint, target: ProjectEntryPoint[], limit: number): void => {
    if (target.length >= limit) {
      return;
    }
    const key = entry.kind === 'task'
      ? `task:${entry.task?.name?.toLowerCase() ?? entry.label.toLowerCase()}`
      : path.resolve(entry.path);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    target.push(entry);
  };

  const fileNames = new Set((options?.fileNames ?? []).map((value) => value.toLowerCase()));
  const isBuildFile = (name: string): boolean => fileNames.has(name.toLowerCase());

  const customPaths = options?.customPaths ?? [];
  for (const customPath of customPaths) {
    if (entryPoints.length >= entryLimit && buildScripts.length >= buildLimit) {
      break;
    }
    const resolved = path.isAbsolute(customPath) ? customPath : path.join(projectPath, customPath);
    const stat = await statPath(resolved);
    if (!stat) {
      continue;
    }
    const label = labelForEntry(projectPath, resolved);
    if (isBuildFile(path.basename(resolved))) {
      addEntry({
        label,
        path: resolved,
        kind: 'build',
        source: 'custom'
      }, buildScripts, buildLimit);
      continue;
    }
    addEntry({
      label,
      path: resolved,
      kind: classifyEntryKind(resolved),
      source: 'custom'
    }, entryPoints, entryLimit);
  }

  const rootEntries = await readDirectory(projectPath);
  for (const [name, type] of rootEntries) {
    if (type !== vscode.FileType.File) {
      continue;
    }
    if (entryPoints.length >= entryLimit && buildScripts.length >= buildLimit) {
      break;
    }
    const entryPath = path.join(projectPath, name);
    if (name.endsWith('.sln')) {
      addEntry({
        label: name,
        path: entryPath,
        kind: 'sln',
        source: 'auto'
      }, entryPoints, entryLimit);
      continue;
    }
    if (name.endsWith('.csproj')) {
      addEntry({
        label: name,
        path: entryPath,
        kind: 'csproj',
        source: 'auto'
      }, entryPoints, entryLimit);
      continue;
    }
    if (name === 'package.json') {
      addEntry({
        label: 'package.json',
        path: entryPath,
        kind: 'node',
        source: 'auto'
      }, entryPoints, entryLimit);
      continue;
    }
    if (isBuildFile(name)) {
      addEntry({
        label: name,
        path: entryPath,
        kind: 'build',
        source: 'auto'
      }, buildScripts, buildLimit);
      continue;
    }
    if (isPowerShellEntry(name)) {
      addEntry({
        label: name,
        path: entryPath,
        kind: 'powershell',
        source: 'auto'
      }, entryPoints, entryLimit);
      continue;
    }
    if (readmeNames.has(name)) {
      addEntry({
        label: name,
        path: entryPath,
        kind: 'readme',
        source: 'auto'
      }, entryPoints, entryLimit);
    }
  }

  if (entryPoints.length < entryLimit || buildScripts.length < buildLimit) {
    const tasksFile = path.join(projectPath, '.vscode', 'tasks.json');
    const tasks = await readTasksFile(tasksFile);
    for (const task of tasks) {
      if (entryPoints.length >= entryLimit) {
        break;
      }
      addEntry({
        label: task.label,
        path: tasksFile,
        kind: 'task',
        source: 'auto',
        task: {
          name: task.label,
          type: task.type,
          group: task.group
        }
      }, entryPoints, entryLimit);
    }
  }

  if (entryPoints.length < entryLimit || buildScripts.length < buildLimit) {
    const preferredFolders = new Set((options?.preferredFolders ?? []).map((value) => value.toLowerCase()));
    const searchDirs = await collectSearchDirs(projectPath, options?.maxDepth ?? 0, preferredFolders);
    for (const dir of searchDirs) {
      if (entryPoints.length >= entryLimit && buildScripts.length >= buildLimit) {
        break;
      }
      const entries = await readDirectory(dir);
      const folderName = path.basename(dir).toLowerCase();
      const isBuildFolder = buildFolderHints.has(folderName);
      for (const [name, type] of entries) {
        if (entryPoints.length >= entryLimit && buildScripts.length >= buildLimit) {
          break;
        }
        if (type !== vscode.FileType.File) {
          continue;
        }
        const lowerName = name.toLowerCase();
        const entryPath = path.join(dir, name);
        if (isBuildFile(lowerName)) {
          addEntry({
            label: labelForEntry(projectPath, entryPath),
            path: entryPath,
            kind: 'build',
            source: 'auto'
          }, buildScripts, buildLimit);
          continue;
        }
        if (isPowerShellEntry(name) && isBuildFolder) {
          addEntry({
            label: labelForEntry(projectPath, entryPath),
            path: entryPath,
            kind: 'build',
            source: 'auto'
          }, buildScripts, buildLimit);
          continue;
        }
        if (isPowerShellEntry(name) && preferredFolders.has(folderName)) {
          addEntry({
            label: labelForEntry(projectPath, entryPath),
            path: entryPath,
            kind: 'powershell',
            source: 'auto'
          }, entryPoints, entryLimit);
        }
      }
    }
  }

  if (entryPoints.length === 0 && buildScripts.length === 0) {
    entryPoints.push({
      label: 'Open Folder',
      path: projectPath,
      kind: 'other',
      source: 'auto'
    });
  }

  return { entryPoints, buildScripts };
}

function labelForEntry(projectPath: string, entryPath: string): string {
  const relative = path.relative(projectPath, entryPath);
  return relative || path.basename(entryPath);
}

function isPowerShellEntry(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.ps1') || lower.endsWith('.psm1') || lower.endsWith('.psd1');
}

function classifyEntryKind(entryPath: string): ProjectEntryPoint['kind'] {
  const lower = entryPath.toLowerCase();
  if (lower.endsWith('.sln')) {
    return 'sln';
  }
  if (lower.endsWith('.csproj')) {
    return 'csproj';
  }
  if (lower.endsWith('package.json')) {
    return 'node';
  }
  if (isPowerShellEntry(entryPath)) {
    return 'powershell';
  }
  const base = path.basename(entryPath);
  if (readmeNames.has(base)) {
    return 'readme';
  }
  return 'other';
}

interface TaskDefinition {
  label?: string;
  taskName?: string;
  name?: string;
  type?: string;
  group?: string | { kind?: string };
}

async function readTasksFile(tasksPath: string): Promise<Array<{ label: string; type?: string; group?: string }>> {
  const text = await readFileText(tasksPath);
  if (!text) {
    return [];
  }
  try {
    const parsed = JSON.parse(sanitizeJson(text)) as { tasks?: TaskDefinition[] };
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    const results: Array<{ label: string; type?: string; group?: string }> = [];
    tasks.forEach((task) => {
      const label = (task.label ?? task.taskName ?? task.name ?? '').trim();
      if (!label) {
        return;
      }
      const group = typeof task.group === 'string'
        ? task.group
        : task.group?.kind;
      results.push({
        label,
        type: task.type,
        group
      });
    });
    return results;
  } catch {
    return [];
  }
}

function sanitizeJson(value: string): string {
  const withoutComments = value
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  return withoutComments.replace(/,\s*([}\]])/g, '$1');
}

async function collectSearchDirs(
  projectPath: string,
  maxDepth: number,
  preferredFolders: Set<string>
): Promise<string[]> {
  if (maxDepth <= 0) {
    return [];
  }
  const preferred: string[] = [];
  const others: string[] = [];
  const seen = new Set<string>();
  await walkDirectoriesBreadthFirst(projectPath, maxDepth, async ({ dir, depth, entries, enqueuePath }) => {
    if (depth >= maxDepth) {
      return;
    }
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.Directory) {
        continue;
      }
      const lower = name.toLowerCase();
      if (skipFolders.has(lower) || lower.startsWith('.')) {
        continue;
      }
      const childPath = path.join(dir, name);
      if (seen.has(childPath)) {
        continue;
      }
      seen.add(childPath);
      if (preferredFolders.has(lower)) {
        preferred.push(childPath);
      } else {
        others.push(childPath);
      }
      enqueuePath(childPath);
    }
  });

  return [...preferred, ...others];
}
