import * as path from 'path';
import * as vscode from 'vscode';
import type { PathNode } from '../views/filesView';
import type { Project, ProjectEntryPoint } from '../models/project';
import type { RunHistoryEntry, RunPreset } from '../models/run';
import type {
  ProjectNodeWithEntry,
  ProjectNodeWithHistory,
  ProjectNodeWithPath,
  ProjectNodeWithPreset,
  ProjectNodeWithProject
} from '../views/projectsView';
import { statPath } from '../util/fs';

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
  const selection = filesView.selection.length > 0 ? filesView.selection : filesPanelView.selection;
  const selectedPaths = selection
    .map((item) => extractPath(item))
    .filter((value): value is string => Boolean(value));
  if (selectedPaths.length > 0) {
    return [...new Set(selectedPaths)];
  }
  const targetPath = resolveTargetPath(target);
  return targetPath ? [targetPath] : [];
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
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 1) {
    return folders[0]?.uri.fsPath;
  }
  if (folders.length > 1) {
    const pick = await vscode.window.showQuickPick(
      folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
      { placeHolder: 'Select target folder' }
    );
    return pick?.folder.uri.fsPath;
  }
  vscode.window.showWarningMessage('ForgeFlow: No workspace folder available.');
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
