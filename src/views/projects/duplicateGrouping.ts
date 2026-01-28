import * as path from 'path';
import * as vscode from 'vscode';
import type { Project } from '../../models/project';
import { statPath } from '../../util/fs';
import type { DuplicateInfo } from './types';

interface GitMeta {
  readonly isWorktree: boolean;
  readonly hasGitDir: boolean;
}

export interface GroupedDuplicate {
  readonly key: string;
  readonly projects: Project[];
  readonly mainProject: Project;
  readonly worktrees: Project[];
  readonly duplicates: Project[];
}

export type GroupedProjectEntry =
  | { kind: 'single'; project: Project }
  | { kind: 'group'; duplicate: GroupedDuplicate };

export async function groupProjectsWithWorktrees(
  projects: Project[],
  duplicateInfo?: Map<string, DuplicateInfo>
): Promise<GroupedProjectEntry[]> {
  if (!duplicateInfo || duplicateInfo.size === 0) {
    return projects.map((project) => ({ kind: 'single', project }));
  }

  const groupsByKey = new Map<string, Project[]>();
  for (const project of projects) {
    const key = duplicateInfo.get(project.id)?.key;
    if (!key) {
      continue;
    }
    const list = groupsByKey.get(key) ?? [];
    list.push(project);
    groupsByKey.set(key, list);
  }

  const duplicateGroups = new Map<string, GroupedDuplicate>();
  for (const [key, groupProjects] of groupsByKey) {
    if (groupProjects.length < 2) {
      continue;
    }
    const grouped = await buildGroupedDuplicate(key, groupProjects);
    duplicateGroups.set(key, grouped);
  }

  const emittedKeys = new Set<string>();
  const entries: GroupedProjectEntry[] = [];
  for (const project of projects) {
    const key = duplicateInfo.get(project.id)?.key;
    if (!key || !duplicateGroups.has(key)) {
      entries.push({ kind: 'single', project });
      continue;
    }
    if (emittedKeys.has(key)) {
      continue;
    }
    emittedKeys.add(key);
    const grouped = duplicateGroups.get(key);
    if (!grouped) {
      entries.push({ kind: 'single', project });
      continue;
    }
    entries.push({ kind: 'group', duplicate: grouped });
  }

  return entries;
}

async function buildGroupedDuplicate(key: string, projects: Project[]): Promise<GroupedDuplicate> {
  const gitMetaEntries = await Promise.all(projects.map(async (project) => ({ project, meta: await readGitMeta(project.path) })));
  const sorted = [...gitMetaEntries].sort((a, b) => a.project.path.localeCompare(b.project.path));
  const mainEntry = chooseMainEntry(sorted);
  const mainProject = mainEntry.project;
  const worktrees = sorted
    .filter((entry) => entry.project.id !== mainProject.id && entry.meta.isWorktree)
    .map((entry) => entry.project);
  const duplicates = sorted
    .filter((entry) => entry.project.id !== mainProject.id && !entry.meta.isWorktree)
    .map((entry) => entry.project);
  return {
    key,
    projects: sorted.map((entry) => entry.project),
    mainProject,
    worktrees,
    duplicates
  };
}

function chooseMainEntry(entries: Array<{ project: Project; meta: GitMeta }>): { project: Project; meta: GitMeta } {
  const nonWorktrees = entries.filter((entry) => !entry.meta.isWorktree);
  if (nonWorktrees.length > 0) {
    const withGitDir = nonWorktrees.filter((entry) => entry.meta.hasGitDir);
    const pool = withGitDir.length > 0 ? withGitDir : nonWorktrees;
    return shortestPathEntry(pool);
  }
  return shortestPathEntry(entries);
}

function shortestPathEntry(entries: Array<{ project: Project; meta: GitMeta }>): { project: Project; meta: GitMeta } {
  const sorted = [...entries].sort((a, b) => {
    const len = a.project.path.length - b.project.path.length;
    if (len !== 0) {
      return len;
    }
    return a.project.path.localeCompare(b.project.path);
  });
  const first = sorted[0];
  if (!first) {
    throw new Error('ForgeFlow: expected at least one duplicate entry.');
  }
  return first;
}

async function readGitMeta(projectPath: string): Promise<GitMeta> {
  const gitPath = path.join(projectPath, '.git');
  const stat = await statPath(gitPath);
  if (!stat) {
    return { isWorktree: false, hasGitDir: false };
  }
  if (stat.type === vscode.FileType.Directory) {
    return { isWorktree: false, hasGitDir: true };
  }
  if (stat.type !== vscode.FileType.File) {
    return { isWorktree: false, hasGitDir: false };
  }
  try {
    const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(gitPath));
    const text = Buffer.from(raw).toString('utf8');
    const gitDirLine = text
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .find((line) => line.toLowerCase().startsWith('gitdir:'));
    if (!gitDirLine) {
      return { isWorktree: false, hasGitDir: false };
    }
    const gitDirValue = gitDirLine.slice('gitdir:'.length).trim();
    const normalized = gitDirValue.replace(/\\/g, '/').toLowerCase();
    const isWorktree = normalized.includes('/worktrees/');
    return { isWorktree, hasGitDir: false };
  } catch {
    return { isWorktree: false, hasGitDir: false };
  }
}
