import * as vscode from 'vscode';
import type { Project } from '../../models/project';
import type { RunHistoryEntry } from '../../models/run';
import type { RunHistoryStore } from '../../store/runHistoryStore';
import { getForgeFlowSettings } from '../../util/config';
import { formatHistoryDescription, getRunHistoryMaxItems } from './utils';

interface RunHistoryQuickPickItem extends vscode.QuickPickItem {
  entry: RunHistoryEntry;
}

export function listProjectHistoryEntries(project: Project, runHistoryStore: RunHistoryStore): RunHistoryEntry[] {
  return runHistoryStore.listForProject(
    project.id,
    getRunHistoryMaxItems(),
    getForgeFlowSettings().runHistoryPerProjectSortMode
  );
}

export function showNoProjectHistoryWarning(project: Project): void {
  vscode.window.showWarningMessage(`ForgeFlow: No recent runs for ${project.name}.`);
}

export async function pickRunHistoryEntry(
  entries: RunHistoryEntry[],
  placeHolder: string
): Promise<RunHistoryEntry | undefined> {
  const pick = await vscode.window.showQuickPick(toRunHistoryQuickPickItems(entries), { placeHolder });
  return pick?.entry;
}

export async function pickRunHistoryEntries(
  entries: RunHistoryEntry[],
  placeHolder: string
): Promise<RunHistoryEntry[] | undefined> {
  const picks = await vscode.window.showQuickPick(toRunHistoryQuickPickItems(entries), {
    placeHolder,
    canPickMany: true
  });
  if (!picks || picks.length === 0) {
    return undefined;
  }
  return picks.map((item) => item.entry);
}

function toRunHistoryQuickPickItems(entries: RunHistoryEntry[]): RunHistoryQuickPickItem[] {
  return entries.map((entry) => ({
    label: entry.label,
    description: formatHistoryDescription(entry),
    detail: entry.filePath ?? entry.command ?? '',
    entry
  }));
}
