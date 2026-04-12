import * as path from 'path';
import * as vscode from 'vscode';
import type { PathNode } from '../views/filesView';
import type { Project, ProjectEntryPoint } from '../models/project';
import type { RunHistoryEntry, RunPreset } from '../models/run';
import type { ProjectsStore } from '../store/projectsStore';
import type {
  ProjectNodeWithEntry,
  ProjectNodeWithHistory,
  ProjectNodeWithPath,
  ProjectNodeWithPreset,
  ProjectNodeWithProject
} from '../views/projectsView';
import { statPath } from '../util/fs';
import { isWithin, normalizePathKey } from './pathUtils';
import { hasWorkspaceFolders, pickWorkspaceFolderPath } from './workspaceFolders';

export type FilesViewId = 'forgeflow.files' | 'forgeflow.files.panel';
export type ProjectViewId = 'forgeflow.projects' | 'forgeflow.projects.panel';

export function extractPath(target: unknown): string | undefined {
  if (typeof target === 'string') {
    return target;
  }
  if (isPathNode(target)) {
    return target.path;
  }
  if (target instanceof vscode.Uri) {
    return target.fsPath;
  }
  if (isProjectEntry(target)) {
    return target.entry.path;
  }
  return undefined;
}

export function getActiveEditorPath(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }
  const uri = editor.document.uri;
  return uri.scheme === 'file' ? uri.fsPath : undefined;
}

export function resolveTargetPath(target: unknown): string | undefined {
  return extractPath(target) ?? vscode.window.activeTextEditor?.document.uri.fsPath;
}

export function collectSelectedPaths(
  target: unknown,
  filesView: vscode.TreeView<unknown>,
  filesPanelView: vscode.TreeView<unknown>
): string[] {
  const preferredViewId = extractFilesViewId(target);
  const targetPath = extractPath(target);
  const targetKey = targetPath ? normalizePathForCompare(targetPath) : undefined;
  const selectionFromView = (view: vscode.TreeView<unknown>): readonly unknown[] | undefined => {
    return selectMatchingSelection(target, view.selection ?? [], (selection) => {
      if (selection.includes(target)) {
        return true;
      }
      if (!targetKey) {
        return false;
      }
      const selectedKeys = selection
        .map((item) => extractPath(item))
        .filter((value): value is string => Boolean(value))
        .map((value) => normalizePathForCompare(value));
      return selectedKeys.includes(targetKey);
    });
  };

  if (targetPath) {
    const selection = selectionFromView(filesView) ?? selectionFromView(filesPanelView);
    if (selection) {
      return dedupeSelectionPaths(selection);
    }
    return [targetPath];
  }

  if (preferredViewId) {
    const preferredView = preferredViewId === 'forgeflow.files' ? filesView : filesPanelView;
    if (preferredView.selection.length > 0) {
      return dedupeSelectionPaths(preferredView.selection);
    }
  }

  const preferredSelection = filesView.visible
    ? filesView.selection
    : (filesPanelView.visible ? filesPanelView.selection : undefined);
  if (preferredSelection && preferredSelection.length > 0) {
    return dedupeSelectionPaths(preferredSelection);
  }

  if (filesView.selection.length > 0) {
    return dedupeSelectionPaths(filesView.selection);
  }
  if (filesPanelView.selection.length > 0) {
    return dedupeSelectionPaths(filesPanelView.selection);
  }

  const fallbackPath = resolveTargetPath(target);
  return fallbackPath ? [fallbackPath] : [];
}

export function collectSelectedProjects(
  target: unknown,
  projectsStore: ProjectsStore,
  projectsView: vscode.TreeView<unknown>,
  projectsPanelView: vscode.TreeView<unknown>
): Project[] {
  const preferredViewId = extractProjectViewId(target);
  const targetProject = extractProject(target);
  const targetProjectId = targetProject?.id;
  const targetPath = extractPath(target);
  const targetPathProject = targetPath ? resolveProjectFromPath(projectsStore, targetPath) : undefined;
  const targetPathProjectId = targetPathProject?.id;

  const selectionFromView = (view: vscode.TreeView<unknown>): readonly unknown[] | undefined => {
    return selectMatchingSelection(target, view.selection ?? [], (selection) => {
      if (targetProjectId) {
        const selectedIds = projectIdsFromSelection(selection, projectsStore);
        return selectedIds.includes(targetProjectId);
      }
      if (targetPathProjectId) {
        const selectedIds = projectIdsFromSelection(selection, projectsStore);
        return selectedIds.includes(targetPathProjectId);
      }
      return selection.includes(target);
    });
  };

  if (targetProject) {
    const selection = selectionFromView(projectsView) ?? selectionFromView(projectsPanelView);
    if (selection) {
      return dedupeSelectionProjects(selection, projectsStore);
    }
    return [targetProject];
  }

  if (targetPathProject) {
    const selection = selectionFromView(projectsView) ?? selectionFromView(projectsPanelView);
    if (selection) {
      return dedupeSelectionProjects(selection, projectsStore);
    }
    return [targetPathProject];
  }

  if (preferredViewId) {
    const preferredView = preferredViewId === 'forgeflow.projects' ? projectsView : projectsPanelView;
    if (preferredView.selection.length > 0) {
      return dedupeSelectionProjects(preferredView.selection, projectsStore);
    }
  }

  const preferredSelection = projectsView.visible
    ? projectsView.selection
    : (projectsPanelView.visible ? projectsPanelView.selection : undefined);
  if (preferredSelection && preferredSelection.length > 0) {
    return dedupeSelectionProjects(preferredSelection, projectsStore);
  }

  if (projectsView.selection.length > 0) {
    return dedupeSelectionProjects(projectsView.selection, projectsStore);
  }
  if (projectsPanelView.selection.length > 0) {
    return dedupeSelectionProjects(projectsPanelView.selection, projectsStore);
  }

  return [];
}

function dedupeSelectionPaths(selection: readonly unknown[]): string[] {
  const selectedPaths = selection
    .map((item) => extractPath(item))
    .filter((value): value is string => Boolean(value));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of selectedPaths) {
    const key = normalizePathForCompare(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function selectMatchingSelection(
  target: unknown,
  selection: readonly unknown[],
  matchesTarget: (selection: readonly unknown[]) => boolean
): readonly unknown[] | undefined {
  if (selection.length === 0) {
    return undefined;
  }
  if (!target) {
    return selection;
  }
  return matchesTarget(selection) ? selection : undefined;
}

function dedupeSelectionProjects(selection: readonly unknown[], projectsStore: ProjectsStore): Project[] {
  const selected = selection
    .map((item) => {
      const direct = extractProject(item);
      if (direct) {
        return direct;
      }
      const candidatePath = extractPath(item);
      return candidatePath ? resolveProjectFromPath(projectsStore, candidatePath) : undefined;
    })
    .filter((value): value is Project => Boolean(value));
  const seen = new Set<string>();
  const result: Project[] = [];
  for (const project of selected) {
    if (seen.has(project.id)) {
      continue;
    }
    seen.add(project.id);
    result.push(project);
  }
  return result;
}

function projectIdsFromSelection(selection: readonly unknown[], projectsStore: ProjectsStore): string[] {
  return dedupeSelectionProjects(selection, projectsStore).map((project) => project.id);
}

function normalizePathForCompare(value: string): string {
  return normalizePathKey(value);
}

function resolveProjectFromPath(projectsStore: ProjectsStore, candidatePath: string): Project | undefined {
  const resolvedPath = normalizePathForCompare(candidatePath);
  return projectsStore.list().find((project) => {
    const projectPath = normalizePathForCompare(project.path);
    return isWithin(projectPath, resolvedPath);
  });
}

export async function resolveBaseDirectory(target: unknown): Promise<string | undefined> {
  const targetPath = resolveTargetPath(target);
  if (targetPath) {
    const stat = await statPath(targetPath);
    if (stat?.type === vscode.FileType.Directory) {
      return targetPath;
    }
    return path.dirname(targetPath);
  }
  const workspaceFolderPath = await pickWorkspaceFolderPath('Select target folder');
  if (workspaceFolderPath) {
    return workspaceFolderPath;
  }
  if (!hasWorkspaceFolders()) {
    vscode.window.showWarningMessage('ForgeFlow: No workspace folder available.');
  }
  return undefined;
}

export function extractProject(target: unknown): Project | undefined {
  if (isProjectNode(target)) {
    return target.project;
  }
  if (isProject(target)) {
    return target;
  }
  return undefined;
}

export function extractEntry(target: unknown): ProjectEntryPoint | undefined {
  if (isProjectEntry(target)) {
    return target.entry;
  }
  if (isEntryPoint(target)) {
    return target;
  }
  return undefined;
}

export function extractPreset(target: unknown): RunPreset | undefined {
  if (isProjectPreset(target)) {
    return target.preset;
  }
  if (isRunPreset(target)) {
    return target;
  }
  return undefined;
}

export function extractHistoryEntry(target: unknown): RunHistoryEntry | undefined {
  if (isProjectHistory(target)) {
    return target.entry;
  }
  if (isRunHistoryEntry(target)) {
    return target;
  }
  return undefined;
}

export function isProjectPreset(value: unknown): value is ProjectNodeWithPreset {
  if (!hasKey(value, 'preset') || !hasKey(value, 'project')) {
    return false;
  }
  return isRunPreset(value['preset']) && isProject(value['project']);
}

export function isProjectHistory(value: unknown): value is ProjectNodeWithHistory {
  if (!hasKey(value, 'entry') || !hasKey(value, 'project')) {
    return false;
  }
  return isRunHistoryEntry(value['entry']) && isProject(value['project']);
}

function hasKey(value: unknown, key: string): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && key in value;
}

function extractFilesViewId(target: unknown): FilesViewId | undefined {
  if (!hasKey(target, 'viewId')) {
    return undefined;
  }
  const viewId = target['viewId'];
  if (viewId === 'forgeflow.files' || viewId === 'forgeflow.files.panel') {
    return viewId;
  }
  return undefined;
}

function extractProjectViewId(target: unknown): ProjectViewId | undefined {
  if (!hasKey(target, 'viewId')) {
    return undefined;
  }
  const viewId = target['viewId'];
  if (viewId === 'forgeflow.projects' || viewId === 'forgeflow.projects.panel') {
    return viewId;
  }
  return undefined;
}

function isPathNode(value: unknown): value is PathNode | ProjectNodeWithPath {
  return hasKey(value, 'path') && typeof value['path'] === 'string';
}

function isProjectNode(value: unknown): value is ProjectNodeWithProject {
  if (!hasKey(value, 'project')) {
    return false;
  }
  return isProject(value['project']);
}

function isProjectEntry(value: unknown): value is ProjectNodeWithEntry {
  if (!hasKey(value, 'entry')) {
    return false;
  }
  return isEntryPoint(value['entry']);
}

function isProject(value: unknown): value is Project {
  return hasKey(value, 'id')
    && hasKey(value, 'path')
    && typeof value['id'] === 'string'
    && typeof value['path'] === 'string';
}

function isEntryPoint(value: unknown): value is ProjectEntryPoint {
  return hasKey(value, 'path')
    && hasKey(value, 'label')
    && typeof value['path'] === 'string'
    && typeof value['label'] === 'string';
}

function isRunPreset(value: unknown): value is RunPreset {
  return hasKey(value, 'id')
    && hasKey(value, 'label')
    && hasKey(value, 'kind')
    && typeof value['id'] === 'string'
    && typeof value['label'] === 'string';
}

function isRunHistoryEntry(value: unknown): value is RunHistoryEntry {
  return hasKey(value, 'id')
    && hasKey(value, 'label')
    && hasKey(value, 'kind')
    && typeof value['id'] === 'string'
    && typeof value['label'] === 'string';
}
