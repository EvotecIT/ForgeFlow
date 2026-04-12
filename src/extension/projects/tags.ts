import * as vscode from 'vscode';
import type { ProjectsViewProvider } from '../../views/projectsView';
import type { DashboardViewProvider } from '../../views/dashboardView';
import type { ProjectsStore } from '../../store/projectsStore';
import type { TagsStore } from '../../store/tagsStore';
import type { TagFilterStore } from '../../store/tagFilterStore';
import { normalizeTagCsv } from '../../util/tags';
import { resolveProjectTarget } from '../projectUtils';

export async function setProjectTags(
  target: unknown,
  projectsStore: ProjectsStore,
  tagsStore: TagsStore,
  projectsProvider: ProjectsViewProvider,
  dashboardProvider: DashboardViewProvider
): Promise<void> {
  const project = resolveProjectOrWarn(target, projectsStore);
  if (!project) {
    return;
  }
  const existing = tagsStore.getTags(project.id);
  const allTags = listAllTags(tagsStore);
  const value = existing.join(', ');
  const placeHolder = allTags.length > 0 ? `Existing tags: ${allTags.join(', ')}` : 'tag1, tag2';
  const input = await vscode.window.showInputBox({
    prompt: `Tags for ${project.name} (comma-separated)`,
    value,
    placeHolder
  });
  if (input === undefined) {
    return;
  }
  const tags = normalizeTagCsv(input);
  await tagsStore.setTags(project.id, tags);
  await refreshTagViews(projectsProvider, dashboardProvider);
}

export async function clearProjectTags(
  target: unknown,
  projectsStore: ProjectsStore,
  tagsStore: TagsStore,
  projectsProvider: ProjectsViewProvider,
  dashboardProvider: DashboardViewProvider
): Promise<void> {
  const project = resolveProjectOrWarn(target, projectsStore);
  if (!project) {
    return;
  }
  await tagsStore.setTags(project.id, []);
  await refreshTagViews(projectsProvider, dashboardProvider);
}

export async function renameProjectTag(
  tagsStore: TagsStore,
  projectsProvider: ProjectsViewProvider,
  dashboardProvider: DashboardViewProvider
): Promise<void> {
  const allTags = listAllTags(tagsStore);
  if (allTags.length === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No tags to rename.');
    return;
  }
  const pick = await vscode.window.showQuickPick(allTags.map((tag) => ({ label: tag })), {
    placeHolder: 'Select a tag to rename'
  });
  if (!pick) {
    return;
  }
  const next = await vscode.window.showInputBox({
    prompt: `Rename tag "${pick.label}" to`,
    value: pick.label
  });
  if (!next || pick.label === next) {
    return;
  }
  await tagsStore.renameTag(pick.label, next);
  await refreshTagViews(projectsProvider, dashboardProvider);
}

export function listAllTags(tagsStore: TagsStore): string[] {
  const map = tagsStore.getAll();
  const deduped = new Map<string, string>();
  Object.values(map).forEach((entry) => {
    entry.tags.forEach((tag) => {
      const key = tag.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, tag);
      }
    });
  });
  return Array.from(deduped.values()).sort((a, b) => a.localeCompare(b));
}

export async function pickTagForFilter(tagsStore: TagsStore): Promise<string | undefined> {
  const tags = listAllTags(tagsStore);
  if (tags.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: No tags available to filter.');
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(tags, { placeHolder: 'Select a tag to toggle' });
  return pick ?? undefined;
}

export async function saveTagPreset(tagFilterStore: TagFilterStore, projectsProvider: ProjectsViewProvider): Promise<void> {
  const tags = projectsProvider.getTagFilter();
  if (tags.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: No active tag filters to save.');
    return;
  }
  const name = await vscode.window.showInputBox({
    prompt: 'Name the tag preset',
    placeHolder: 'e.g. client-work or ci-pipelines'
  });
  if (!name) {
    return;
  }
  await tagFilterStore.savePreset(name, tags);
  vscode.window.setStatusBarMessage(`ForgeFlow: Saved tag preset "${name}".`, 3000);
}

export async function applyTagPreset(tagFilterStore: TagFilterStore): Promise<{ name: string; tags: string[] } | undefined> {
  const presets = tagFilterStore.getPresets();
  if (presets.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: No tag presets saved.');
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(
    presets.map((preset) => ({
      label: preset.name,
      description: preset.tags.join(', ')
    })),
    { placeHolder: 'Select a tag preset' }
  );
  if (!pick) {
    return undefined;
  }
  const preset = presets.find((entry) => entry.name === pick.label);
  return preset;
}

export async function deleteTagPreset(tagFilterStore: TagFilterStore): Promise<void> {
  const presets = tagFilterStore.getPresets();
  if (presets.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: No tag presets saved.');
    return;
  }
  const pick = await vscode.window.showQuickPick(
    presets.map((preset) => ({
      label: preset.name,
      description: preset.tags.join(', ')
    })),
    { placeHolder: 'Select a tag preset to delete' }
  );
  if (!pick) {
    return;
  }
  await tagFilterStore.deletePreset(pick.label);
  vscode.window.setStatusBarMessage(`ForgeFlow: Deleted tag preset "${pick.label}".`, 3000);
}

function resolveProjectOrWarn(target: unknown, projectsStore: ProjectsStore) {
  const project = resolveProjectTarget(target, projectsStore);
  if (!project) {
    vscode.window.showWarningMessage('ForgeFlow: No project selected.');
    return undefined;
  }
  return project;
}

async function refreshTagViews(
  projectsProvider: ProjectsViewProvider,
  dashboardProvider: DashboardViewProvider
): Promise<void> {
  await projectsProvider.refresh();
  await dashboardProvider.refresh();
}
