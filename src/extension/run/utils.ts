import * as vscode from 'vscode';
import type { Project } from '../../models/project';
import type { RunHistoryEntry, RunPreset } from '../../models/run';
import { getAllProfiles } from '../../run/powershellProfiles';
import type { FavoritesStore } from '../../store/favoritesStore';
import { getForgeFlowSettings } from '../../util/config';

export function formatHistoryDescription(entry: RunHistoryEntry): string {
  if (entry.kind === 'powershell') {
    return `PowerShell${entry.target ? ` • ${entry.target}` : ''}`;
  }
  if (entry.kind === 'task') {
    return 'Task';
  }
  return 'Command';
}

export function formatPresetDescription(preset: RunPreset): string {
  if (preset.kind === 'powershell') {
    return `PowerShell${preset.target ? ` • ${preset.target}` : ''}`;
  }
  if (preset.kind === 'task') {
    return 'Task';
  }
  return 'Command';
}

export function buildRunHistoryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildPresetId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getRunHistoryMaxItems(): number {
  const config = vscode.workspace.getConfiguration('forgeflow');
  const value = config.get<number>('run.history.maxItems', 50);
  if (!Number.isFinite(value) || value <= 0) {
    return 50;
  }
  return Math.min(200, Math.max(1, Math.floor(value)));
}

export function resolveProfileIdForHistory(
  filePath: string,
  project: Project | undefined,
  explicitProfileId: string | undefined,
  favoritesStore: FavoritesStore
): string | undefined {
  if (explicitProfileId) {
    return explicitProfileId;
  }
  const favoriteOverride = favoritesStore.list().find((item) => item.path === filePath)?.profileOverrideId;
  if (favoriteOverride) {
    return favoriteOverride;
  }
  if (project?.preferredRunProfileId) {
    return project.preferredRunProfileId;
  }
  const settings = getForgeFlowSettings();
  if (settings.defaultProfileId) {
    return settings.defaultProfileId;
  }
  return getAllProfiles(settings.powershellProfiles)[0]?.id;
}
