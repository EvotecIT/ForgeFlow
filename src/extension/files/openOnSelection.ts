import * as vscode from 'vscode';
import { getForgeFlowSettings } from '../../util/config';
import { statPath } from '../../util/fs';
import { openPathPreview } from '../fsActions';
import { normalizeFsPath } from '../pathUtils';
import { extractPath, getActiveEditorPath } from '../selection';

export function registerOpenOnSelection(
  context: vscode.ExtensionContext,
  filesView: vscode.TreeView<unknown>,
  filesPanelView: vscode.TreeView<unknown>
): void {
  const timers = new Map<string, NodeJS.Timeout>();
  const delayMs = 150;

  const clearTimer = (viewId: string): void => {
    const timer = timers.get(viewId);
    if (timer) {
      clearTimeout(timer);
      timers.delete(viewId);
    }
  };

  const getViewById = (viewId: string): vscode.TreeView<unknown> | undefined => {
    switch (viewId) {
      case 'forgeflow.files':
        return filesView;
      case 'forgeflow.files.panel':
        return filesPanelView;
      default:
        return undefined;
    }
  };

  const scheduleOpen = (viewId: string, selection: readonly unknown[]): void => {
    clearTimer(viewId);
    if (!getForgeFlowSettings().filesOpenOnSelection || selection.length !== 1) {
      return;
    }
    const candidatePath = extractPath(selection[0]);
    if (!candidatePath) {
      return;
    }
    const timer = setTimeout(async () => {
      timers.delete(viewId);
      const view = getViewById(viewId);
      if (!view?.visible || view.selection.length !== 1) {
        return;
      }
      const activePath = extractPath(view.selection[0]);
      if (!activePath || normalizeFsPath(activePath) !== normalizeFsPath(candidatePath)) {
        return;
      }
      const stat = await statPath(candidatePath);
      if (stat?.type !== vscode.FileType.File) {
        return;
      }
      const activeEditorPath = getActiveEditorPath();
      if (activeEditorPath && normalizeFsPath(activeEditorPath) === normalizeFsPath(candidatePath)) {
        return;
      }
      await openPathPreview(candidatePath);
    }, delayMs);
    timers.set(viewId, timer);
  };

  context.subscriptions.push(
    filesView.onDidChangeSelection((event) => {
      scheduleOpen('forgeflow.files', event.selection);
    }),
    filesPanelView.onDidChangeSelection((event) => {
      scheduleOpen('forgeflow.files.panel', event.selection);
    }),
    {
      dispose: () => {
        for (const timer of timers.values()) {
          clearTimeout(timer);
        }
        timers.clear();
      }
    }
  );
}
