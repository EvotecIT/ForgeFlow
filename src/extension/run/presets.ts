import * as vscode from 'vscode';
import type { Project } from '../../models/project';
import type { RunHistoryEntry, RunPreset } from '../../models/run';
import type { RunService } from '../../run/runService';
import type { ProjectsStore } from '../../store/projectsStore';
import type { RunHistoryStore } from '../../store/runHistoryStore';
import { buildPresetFromEntry } from '../../run/runPresets';
import { getForgeFlowSettings } from '../../util/config';
import { pickProject } from '../projectUtils';
import { formatPresetDescription, getRunHistoryMaxItems, buildPresetId, buildRunHistoryId } from './utils';
import {
  listProjectHistoryEntries,
  pickRunHistoryEntries,
  pickRunHistoryEntry,
  showNoProjectHistoryWarning
} from './historyPicker';
import { runShellCommand } from './terminal';
import { runTaskByName } from './tasks';

export async function saveProjectHistoryAsPreset(
  project: Project,
  runHistoryStore: RunHistoryStore,
  projectsStore: ProjectsStore
): Promise<void> {
  const entries = listProjectHistoryEntries(project, runHistoryStore);
  if (entries.length === 0) {
    showNoProjectHistoryWarning(project);
    return;
  }
  const entry = await pickRunHistoryEntry(entries, `Save recent run as preset for ${project.name}`);
  if (!entry) {
    return;
  }
  await saveRunPresetFromEntry(entry, projectsStore);
}

export async function saveProjectHistoryAsPresets(
  project: Project,
  runHistoryStore: RunHistoryStore,
  projectsStore: ProjectsStore
): Promise<void> {
  const entries = listProjectHistoryEntries(project, runHistoryStore);
  if (entries.length === 0) {
    showNoProjectHistoryWarning(project);
    return;
  }
  const picks = await pickRunHistoryEntries(entries, `Select recent runs to save as presets for ${project.name}`);
  if (!picks) {
    return;
  }
  let saved = 0;
  for (const entry of picks) {
    await saveRunPresetFromEntry(entry, projectsStore);
    saved += 1;
  }
  vscode.window.setStatusBarMessage(`ForgeFlow: Saved ${saved} preset${saved === 1 ? '' : 's'}.`, 3000);
}

export async function saveRunPresetFromHistory(
  runHistoryStore: RunHistoryStore,
  projectsStore: ProjectsStore
): Promise<void> {
  const entries = runHistoryStore.list();
  if (entries.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: Run history is empty.');
    return;
  }
  const entry = await pickRunHistoryEntry(entries, 'Select a run to save as preset');
  if (!entry) {
    return;
  }
  await saveRunPresetFromEntry(entry, projectsStore);
}

export async function saveRunPresetFromEntry(entry: RunHistoryEntry, projectsStore: ProjectsStore): Promise<void> {
  const project = entry.projectId
    ? projectsStore.list().find((item) => item.id === entry.projectId)
    : undefined;
  const targetProject = project ?? await pickProject(projectsStore.list(), 'Select a project for this preset');
  if (!targetProject) {
    return;
  }
  const name = await vscode.window.showInputBox({
    prompt: `Preset name for ${targetProject.name}`,
    value: entry.label
  });
  if (!name) {
    return;
  }
  const preset: RunPreset = buildPresetFromEntry(entry, name, buildPresetId());
  const existing = targetProject.runPresets ?? [];
  const index = existing.findIndex((item) => item.label.toLowerCase() === name.toLowerCase());
  const next = [...existing];
  if (index >= 0) {
    next[index] = preset;
  } else {
    next.push(preset);
  }
  await projectsStore.updateRunPresets(targetProject.id, next);
  vscode.window.setStatusBarMessage(`ForgeFlow: Saved preset "${name}".`, 3000);
}

export async function runProjectPreset(
  project: Project,
  runService: RunService,
  runHistoryStore: RunHistoryStore
): Promise<void> {
  const presets = project.runPresets ?? [];
  if (presets.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: No run presets saved for this project.');
    return;
  }
  const pick = await vscode.window.showQuickPick(
    presets.map((preset) => ({
      label: preset.label,
      description: formatPresetDescription(preset),
      detail: preset.filePath ?? preset.command ?? preset.taskName ?? '',
      preset
    })),
    { placeHolder: `Run preset for ${project.name}` }
  );
  if (!pick) {
    return;
  }
  const preset = pick.preset;
  await runPresetItem(preset, project, runService, runHistoryStore);
}

export async function deleteProjectPreset(project: Project, projectsStore: ProjectsStore): Promise<void> {
  const presets = project.runPresets ?? [];
  if (presets.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: No run presets saved for this project.');
    return;
  }
  const pick = await vscode.window.showQuickPick(
    presets.map((preset) => ({
      label: preset.label,
      description: formatPresetDescription(preset),
      preset
    })),
    { placeHolder: `Delete preset for ${project.name}` }
  );
  if (!pick) {
    return;
  }
  const next = presets.filter((preset) => preset.id !== pick.preset.id);
  await projectsStore.updateRunPresets(project.id, next);
  vscode.window.setStatusBarMessage(`ForgeFlow: Deleted preset "${pick.preset.label}".`, 3000);
}

export async function runPresetItem(
  preset: RunPreset,
  project: Project,
  runService: RunService,
  runHistoryStore: RunHistoryStore
): Promise<void> {
  if (preset.kind === 'powershell' && preset.filePath) {
    await runService.run({
      filePath: preset.filePath,
      workingDirectory: preset.workingDirectory,
      projectId: project.id,
      profileId: preset.profileId,
      target: preset.target
    });
    await recordPresetHistory(runHistoryStore, preset, project.id);
    return;
  }
  if (preset.kind === 'command' && preset.command) {
    runShellCommand(preset.command, preset.workingDirectory, getForgeFlowSettings().runByFileReuseTerminal);
    await recordPresetHistory(runHistoryStore, preset, project.id);
    return;
  }
  if (preset.kind === 'task' && preset.taskName) {
    await runTaskByName(preset.taskName, project);
    await recordPresetHistory(runHistoryStore, preset, project.id);
    return;
  }
  vscode.window.showWarningMessage('ForgeFlow: Preset is missing required data.');
}

export async function deletePresetItem(project: Project, preset: RunPreset, projectsStore: ProjectsStore): Promise<void> {
  const presets = project.runPresets ?? [];
  const next = presets.filter((item) => item.id !== preset.id);
  if (next.length === presets.length) {
    return;
  }
  await projectsStore.updateRunPresets(project.id, next);
  vscode.window.setStatusBarMessage(`ForgeFlow: Deleted preset "${preset.label}".`, 3000);
}

export async function recordPresetHistory(
  runHistoryStore: RunHistoryStore,
  preset: RunPreset,
  projectId?: string
): Promise<void> {
  const entry: RunHistoryEntry = {
    id: buildRunHistoryId(),
    kind: preset.kind,
    label: preset.label,
    timestamp: Date.now(),
    filePath: preset.filePath,
    command: preset.command,
    workingDirectory: preset.workingDirectory,
    projectId,
    profileId: preset.profileId,
    target: preset.target,
    taskName: preset.taskName,
    taskSource: preset.taskSource
  };
  await runHistoryStore.add(entry, getRunHistoryMaxItems());
}
