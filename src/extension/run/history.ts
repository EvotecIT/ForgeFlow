import * as vscode from 'vscode';
import type { Project } from '../../models/project';
import type { RunHistoryEntry } from '../../models/run';
import type { RunService } from '../../run/runService';
import type { ProjectsStore } from '../../store/projectsStore';
import type { RunHistoryStore } from '../../store/runHistoryStore';
import { getForgeFlowSettings } from '../../util/config';
import { buildRunHistoryId, formatHistoryDescription, getRunHistoryMaxItems } from './utils';
import { runShellCommand } from './terminal';
import { runTaskByName } from './tasks';

export async function runLastHistoryEntry(
  runHistoryStore: RunHistoryStore,
  runService: RunService,
  projectsStore: ProjectsStore
): Promise<void> {
  const entries = runHistoryStore.list();
  const entry = entries[0];
  if (!entry) {
    vscode.window.showWarningMessage('ForgeFlow: Run history is empty.');
    return;
  }
  await runHistoryEntry(entry, runHistoryStore, runService, projectsStore);
}

export async function runFromHistory(
  runHistoryStore: RunHistoryStore,
  runService: RunService,
  projectsStore: ProjectsStore
): Promise<void> {
  const entries = runHistoryStore.list();
  if (entries.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: Run history is empty.');
    return;
  }
  const pick = await vscode.window.showQuickPick(
    entries.map((entry) => ({
      label: entry.label,
      description: formatHistoryDescription(entry),
      detail: entry.filePath ?? entry.command ?? '',
      entry
    })),
    { placeHolder: 'Select a recent run' }
  );
  if (!pick) {
    return;
  }
  await runHistoryEntry(pick.entry, runHistoryStore, runService, projectsStore);
}

export async function runHistoryEntry(
  entry: RunHistoryEntry,
  runHistoryStore: RunHistoryStore,
  runService: RunService,
  projectsStore: ProjectsStore
): Promise<void> {
  if (entry.kind === 'powershell' && entry.filePath) {
    await runService.run({
      filePath: entry.filePath,
      workingDirectory: entry.workingDirectory,
      projectId: entry.projectId,
      profileId: entry.profileId,
      target: entry.target
    });
    await runHistoryStore.add({ ...entry, id: buildRunHistoryId(), timestamp: Date.now() }, getRunHistoryMaxItems());
    return;
  }
  if (entry.kind === 'command' && entry.command) {
    runShellCommand(entry.command, entry.workingDirectory, getForgeFlowSettings().runByFileReuseTerminal);
    await runHistoryStore.add({ ...entry, id: buildRunHistoryId(), timestamp: Date.now() }, getRunHistoryMaxItems());
    return;
  }
  if (entry.kind === 'task' && entry.taskName) {
    const project = entry.projectId
      ? projectsStore.list().find((item) => item.id === entry.projectId)
      : undefined;
    if (!project) {
      vscode.window.showWarningMessage('ForgeFlow: Task run requires a project.');
      return;
    }
    await runTaskByName(entry.taskName, project);
    await runHistoryStore.add({ ...entry, id: buildRunHistoryId(), timestamp: Date.now() }, getRunHistoryMaxItems());
    return;
  }
  vscode.window.showWarningMessage('ForgeFlow: Unable to run selected history entry.');
}

export async function confirmRunHistoryClick(entry: RunHistoryEntry, project?: Project): Promise<boolean> {
  const label = entry.label || 'Recent run';
  const locationHint = entry.filePath ?? entry.command ?? project?.path;
  const detail = locationHint ? `\n${locationHint}` : '';
  const message = `ForgeFlow: Run "${label}"?${detail}`;
  const runChoice = 'Run';
  const picked = await vscode.window.showInformationMessage(message, { modal: true }, runChoice);
  return picked === runChoice;
}

export async function runProjectHistory(
  project: Project,
  runHistoryStore: RunHistoryStore,
  runService: RunService,
  projectsStore: ProjectsStore
): Promise<void> {
  const entries = runHistoryStore.listForProject(
    project.id,
    getRunHistoryMaxItems(),
    getForgeFlowSettings().runHistoryPerProjectSortMode
  );
  if (entries.length === 0) {
    vscode.window.showWarningMessage(`ForgeFlow: No recent runs for ${project.name}.`);
    return;
  }
  const pick = await vscode.window.showQuickPick(
    entries.map((entry) => ({
      label: entry.label,
      description: formatHistoryDescription(entry),
      detail: entry.filePath ?? entry.command ?? '',
      entry
    })),
    { placeHolder: `Select a recent run for ${project.name}` }
  );
  if (!pick) {
    return;
  }
  await runHistoryEntry(pick.entry, runHistoryStore, runService, projectsStore);
}
