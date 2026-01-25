import * as vscode from 'vscode';
import type { FilesViewProvider } from '../views/filesView';
import type { ProjectsViewProvider } from '../views/projectsView';
import type { GitViewProvider } from '../views/gitView';
import type { DashboardViewProvider } from '../views/dashboardView';
import type { FilterPresetScope } from '../store/filterPresetStore';
import type { FilterPresetStore } from '../store/filterPresetStore';
import type { DashboardFilterStore } from '../dashboard/filterStore';
import type { TagFilterStore } from '../store/tagFilterStore';

export function formatScopeLabel(scope: 'workspace' | 'global'): string {
  return scope === 'global' ? 'Global' : 'Workspace';
}

export function buildFilterMessage(options: {
  filterText: string;
  minChars: number;
  focusCommand: string;
  clearCommand?: string;
  scopeLabel: string;
  extraText?: string;
  extraClearCommand?: string;
}): string {
  const trimmed = options.filterText.trim();
  const hasFilter = trimmed.length > 0;
  let filterLabel = hasFilter ? trimmed : '(none)';
  if (hasFilter && options.minChars > 0 && trimmed.length < options.minChars) {
    filterLabel += ` (inactive until ${options.minChars} chars)`;
  }
  const parts = [
    `Filter: ${filterLabel}`,
    `Scope: ${options.scopeLabel}`,
    'Edit: Focus Filter'
  ];
  if (hasFilter && options.clearCommand) {
    parts.push('Clear: Clear Filter');
  }
  if (options.extraText) {
    parts.push(options.extraText);
    if (options.extraClearCommand) {
      parts.push('Clear Tags');
    }
  }
  return parts.join(' | ');
}

export function setTreeViewMessage(views: Array<vscode.TreeView<unknown>>, message: string | undefined): void {
  for (const view of views) {
    view.message = message;
  }
}

export async function openLiveFilterInput(options: {
  title: string;
  value: string;
  minChars: number;
  onChange: (value: string) => void;
}): Promise<void> {
  await new Promise<void>((resolve) => {
    const input = vscode.window.createInputBox();
    input.title = options.title;
    input.value = options.value;
    input.prompt = options.minChars > 0
      ? `Type at least ${options.minChars} characters to activate filtering.`
      : 'Type to filter.';
    input.placeholder = 'Leave empty to clear filter';
    input.onDidChangeValue((value) => {
      options.onChange(value);
    });
    input.onDidAccept(() => {
      input.hide();
    });
    input.onDidHide(() => {
      input.dispose();
      resolve();
    });
    input.show();
  });
}

export async function saveFilterPreset(scope: FilterPresetScope, value: string, store: FilterPresetStore): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: `Name the ${scope} filter preset`,
    placeHolder: 'e.g. services or auth-errors'
  });
  if (!name) {
    return;
  }
  await store.savePreset(scope, name, value);
  vscode.window.setStatusBarMessage(`ForgeFlow: Saved ${scope} filter preset "${name}".`, 3000);
}

export async function pickFilterPreset(
  scope: FilterPresetScope,
  store: FilterPresetStore
): Promise<{ name: string; value: string } | undefined> {
  const presets = store.getPresets(scope);
  if (presets.length === 0) {
    vscode.window.showWarningMessage(`ForgeFlow: No ${scope} filter presets saved.`);
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(
    presets.map((preset) => ({
      label: preset.name,
      description: preset.value || '∅'
    })),
    { placeHolder: `Select a ${scope} filter preset` }
  );
  if (!pick) {
    return undefined;
  }
  return presets.find((preset) => preset.name === pick.label);
}

export async function deleteFilterPreset(scope: FilterPresetScope, store: FilterPresetStore): Promise<void> {
  const presets = store.getPresets(scope);
  if (presets.length === 0) {
    vscode.window.showWarningMessage(`ForgeFlow: No ${scope} filter presets saved.`);
    return;
  }
  const pick = await vscode.window.showQuickPick(
    presets.map((preset) => ({
      label: preset.name,
      description: preset.value || '∅'
    })),
    { placeHolder: `Select a ${scope} filter preset to delete` }
  );
  if (!pick) {
    return;
  }
  await store.deletePreset(scope, pick.label);
  vscode.window.setStatusBarMessage(`ForgeFlow: Deleted ${scope} filter preset "${pick.label}".`, 3000);
}

export async function toggleFilterScope(
  filesProvider: FilesViewProvider,
  projectsProvider: ProjectsViewProvider,
  gitProvider: GitViewProvider,
  dashboardProvider: DashboardViewProvider,
  dashboardFilterStore: DashboardFilterStore,
  tagFilterStore: TagFilterStore
): Promise<void> {
  const config = vscode.workspace.getConfiguration('forgeflow');
  const current = config.get<'workspace' | 'global'>('filters.scope', 'workspace');
  const next = current === 'workspace' ? 'global' : 'workspace';
  const filesFilter = filesProvider.getFilter();
  const projectsFilter = projectsProvider.getFilter();
  const gitFilter = gitProvider.getFilter();
  const dashboardFilter = dashboardFilterStore.getFilter();
  const tagFilter = tagFilterStore.getFilter();

  await config.update('filters.scope', next, vscode.ConfigurationTarget.Global);

  filesProvider.setFilter(filesFilter);
  projectsProvider.setFilter(projectsFilter);
  gitProvider.setFilter(gitFilter);
  await dashboardProvider.applyFilter(dashboardFilter);
  await projectsProvider.setTagFilter(tagFilter);
  await dashboardProvider.applyTagFilter(tagFilter, false, true);
  vscode.window.setStatusBarMessage(`ForgeFlow filters: ${next} scope`, 2500);
}
