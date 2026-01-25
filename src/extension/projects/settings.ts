import * as vscode from 'vscode';
import type { ProjectsViewProvider } from '../../views/projectsView';
import type { ProjectSortMode, SortDirection } from '../../util/config';
import { getForgeFlowSettings } from '../../util/config';
import { openLiveFilterInput } from '../filters';

export async function configureScanRoots(provider: ProjectsViewProvider): Promise<void> {
  const selection = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: true,
    openLabel: 'Select Project Roots'
  });

  if (!selection) {
    return;
  }

  const roots = selection.map((uri) => uri.fsPath);
  const config = vscode.workspace.getConfiguration('forgeflow');
  await config.update('projects.scanRoots', roots, vscode.ConfigurationTarget.Global);
  await provider.refresh();
  vscode.window.showInformationMessage(`ForgeFlow: ${roots.length} project root(s) configured.`);
}

export async function configureOrRefreshScanRoots(provider: ProjectsViewProvider): Promise<void> {
  const settings = getForgeFlowSettings();
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  const hasConfiguredRoots = settings.projectScanRoots.length > 0;
  const hasWorkspaceRoots = workspaceFolders.length > 0;

  const options: Array<{ label: string; value: 'configure' | 'refresh' | 'settings' }> = [];
  if (!hasConfiguredRoots || !hasWorkspaceRoots) {
    options.push({ label: 'Configure scan roots', value: 'configure' });
  }
  options.push({ label: 'Refresh projects', value: 'refresh' });
  options.push({ label: 'Open settings (JSON)', value: 'settings' });

  if (options.length === 1 || (!hasConfiguredRoots && !hasWorkspaceRoots)) {
    await configureScanRoots(provider);
    return;
  }

  const pick = await vscode.window.showQuickPick(options, { placeHolder: 'Projects: Next action' });
  if (!pick) {
    return;
  }

  if (pick.value === 'configure') {
    await configureScanRoots(provider);
    return;
  }
  if (pick.value === 'settings') {
    await vscode.commands.executeCommand('workbench.action.openSettingsJson');
    return;
  }
  await provider.refresh(true);
}

export async function configureSortMode(provider: ProjectsViewProvider): Promise<void> {
  const settings = getForgeFlowSettings();
  const baseOptions = [
    { label: 'Recent Opened', value: 'recentOpened' },
    { label: 'Recent Modified', value: 'recentModified' },
    { label: 'Alphabetical', value: 'alphabetical' },
    { label: 'Last Active', value: 'lastActive' },
    { label: 'Git Commit Time', value: 'gitCommit' }
  ] as const;
  const options: Array<{ label: string; value: ProjectSortMode; picked?: boolean }> = baseOptions.map((option) => ({
    ...option,
    picked: option.value === settings.projectSortMode
  }));
  const pick = await vscode.window.showQuickPick(options, { placeHolder: 'Select project sort mode' });
  if (!pick) {
    return;
  }
  const config = vscode.workspace.getConfiguration('forgeflow');
  await config.update('projects.sortMode', pick.value, vscode.ConfigurationTarget.Global);
  await provider.refresh();
}

export async function configureSortDirection(provider: ProjectsViewProvider): Promise<void> {
  const settings = getForgeFlowSettings();
  const baseOptions = [
    { label: 'Newest first', value: 'desc' },
    { label: 'Oldest first', value: 'asc' }
  ] as const;
  const options: Array<{ label: string; value: SortDirection; picked?: boolean }> = baseOptions.map((option) => ({
    ...option,
    picked: option.value === settings.projectSortDirection
  }));
  const pick = await vscode.window.showQuickPick(options, { placeHolder: 'Select sort direction' });
  if (!pick) {
    return;
  }
  const config = vscode.workspace.getConfiguration('forgeflow');
  await config.update('projects.sortDirection', pick.value, vscode.ConfigurationTarget.Global);
  await provider.refresh();
}

export async function toggleSortDirection(provider: ProjectsViewProvider): Promise<void> {
  const config = vscode.workspace.getConfiguration('forgeflow');
  const current = config.get<SortDirection>('projects.sortDirection', 'desc');
  const next: SortDirection = current === 'asc' ? 'desc' : 'asc';
  await config.update('projects.sortDirection', next, vscode.ConfigurationTarget.Global);
  await provider.refresh();
  const label = next === 'desc' ? 'Newest first' : 'Oldest first';
  vscode.window.setStatusBarMessage(`ForgeFlow: Sort direction → ${label}`, 2000);
}

export async function configureProjectFilter(provider: ProjectsViewProvider): Promise<void> {
  await openLiveFilterInput({
    title: 'Filter projects',
    value: provider.getFilter(),
    minChars: getForgeFlowSettings().filtersProjectsMinChars,
    onChange: (value) => provider.setFilter(value)
  });
}
