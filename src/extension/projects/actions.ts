import * as path from 'path';
import * as vscode from 'vscode';
import type { Project } from '../../models/project';
import type { ProjectsStore } from '../../store/projectsStore';
import type { TagsStore } from '../../store/tagsStore';
import { normalizeFsPath, normalizePathKey } from '../pathUtils';

export async function openProject(project: Project, store: ProjectsStore): Promise<void> {
  await store.updateLastOpened(project.id, Date.now());
  await store.updateLastActivity(project.id, Date.now());
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(project.path), false);
}

export async function openProjectInNewWindow(project: Project, store: ProjectsStore): Promise<void> {
  await store.updateLastOpened(project.id, Date.now());
  await store.updateLastActivity(project.id, Date.now());
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(project.path), true);
}

export async function addProjectToWorkspace(project: Project, store: ProjectsStore): Promise<void> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const resolved = normalizePathKey(project.path);
  if (folders.some((folder) => normalizePathKey(folder.uri.fsPath) === resolved)) {
    vscode.window.showWarningMessage('ForgeFlow: Project is already in the workspace.');
    return;
  }
  const success = vscode.workspace.updateWorkspaceFolders(folders.length, 0, {
    uri: vscode.Uri.file(project.path),
    name: project.name
  });
  if (!success) {
    vscode.window.showWarningMessage('ForgeFlow: Unable to add project to workspace.');
    return;
  }
  await store.updateLastOpened(project.id, Date.now());
  await store.updateLastActivity(project.id, Date.now());
}

export async function addProjectsToWorkspace(store: ProjectsStore): Promise<void> {
  const projects = store.list();
  if (projects.length === 0) {
    vscode.window.showInformationMessage('ForgeFlow: No projects available. Configure scan roots first.');
    return;
  }
  const folders = vscode.workspace.workspaceFolders ?? [];
  const normalizeWorkspacePath = (value: string): string => {
    const normalized = normalizeFsPath(path.resolve(value));
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  };
  const existing = new Set(
    folders.map((folder) => normalizeWorkspacePath(folder.uri.fsPath))
  );
  const candidates = projects
    .filter((project) => !existing.has(normalizeWorkspacePath(project.path)))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (candidates.length === 0) {
    vscode.window.showInformationMessage('ForgeFlow: All detected projects are already in the workspace.');
    return;
  }

  const picks = await vscode.window.showQuickPick(
    candidates.map((project) => ({
      label: project.name,
      description: project.path,
      project
    })),
    {
      canPickMany: true,
      matchOnDescription: true,
      placeHolder: 'Select projects to add to workspace'
    }
  );
  if (!picks || picks.length === 0) {
    return;
  }

  const additions: Array<{ uri: vscode.Uri; name: string }> = [];
  const now = Date.now();
  for (const pick of picks) {
    const project = pick.project;
    additions.push({ uri: vscode.Uri.file(project.path), name: project.name });
    await store.updateLastOpened(project.id, now);
    await store.updateLastActivity(project.id, now);
  }
  const success = vscode.workspace.updateWorkspaceFolders(folders.length, 0, ...additions);
  if (!success) {
    vscode.window.showWarningMessage('ForgeFlow: Unable to add selected projects to workspace.');
    return;
  }
  vscode.window.setStatusBarMessage(`ForgeFlow: Added ${additions.length} project(s) to workspace.`, 3000);
}

export async function switchProject(store: ProjectsStore, tagsStore: TagsStore): Promise<void> {
  const projects = store.list();
  if (projects.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: No projects available. Configure scan roots first.');
    return;
  }
  const items = projects.map((project) => buildProjectQuickPickItem(project, tagsStore));
  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a project to open',
    matchOnDescription: true,
    matchOnDetail: true
  });
  if (!pick) {
    return;
  }

  const actionPick = await vscode.window.showQuickPick<{ label: string; action: 'current' | 'new' | 'add' }>([
    { label: 'Open in current window', action: 'current' },
    { label: 'Open in new window', action: 'new' },
    { label: 'Add to workspace', action: 'add' }
  ], { placeHolder: 'How should the project be opened?' });
  if (!actionPick) {
    return;
  }

  await openProjectWithAction(store, pick.project, actionPick.action);
}

export async function searchProjectsQuickPick(store: ProjectsStore, tagsStore: TagsStore): Promise<void> {
  const projects = store.list();
  if (projects.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: No projects available. Configure scan roots first.');
    return;
  }
  const openNewButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('window'),
    tooltip: 'Open in new window'
  };
  const addWorkspaceButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('add'),
    tooltip: 'Add to workspace'
  };
  const items = projects.map((project) => ({
    ...buildProjectQuickPickItem(project, tagsStore),
    buttons: [openNewButton, addWorkspaceButton]
  }));

  await new Promise<void>((resolve) => {
    const quickPick = vscode.window.createQuickPick<(vscode.QuickPickItem & { project: Project })>();
    quickPick.title = 'Search projects';
    quickPick.placeholder = 'Type to filter projects';
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.items = items;
    quickPick.onDidTriggerItemButton(async (event) => {
      const action = event.button === openNewButton ? 'new' : 'add';
      await openProjectWithAction(store, event.item.project, action);
      quickPick.hide();
    });
    quickPick.onDidAccept(async () => {
      const [selection] = quickPick.selectedItems;
      if (selection) {
        await openProjectWithAction(store, selection.project, 'current');
      }
      quickPick.hide();
    });
    quickPick.onDidHide(() => {
      quickPick.dispose();
      resolve();
    });
    quickPick.show();
  });
}

async function openProjectWithAction(
  store: ProjectsStore,
  project: Project,
  action: 'current' | 'new' | 'add'
): Promise<void> {
  await store.updateLastOpened(project.id, Date.now());
  await store.updateLastActivity(project.id, Date.now());

  if (action === 'add') {
    const existing = vscode.workspace.workspaceFolders ?? [];
    const alreadyOpen = existing.some((folder) => normalizePathKey(folder.uri.fsPath) === normalizePathKey(project.path));
    if (alreadyOpen) {
      vscode.window.showInformationMessage('ForgeFlow: Project is already in the workspace.');
      return;
    }
    if (existing.length === 0) {
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(project.path), false);
      return;
    }
    vscode.workspace.updateWorkspaceFolders(existing.length, null, {
      uri: vscode.Uri.file(project.path),
      name: project.name
    });
    return;
  }

  const forceNewWindow = action === 'new';
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(project.path), forceNewWindow);
}

function buildProjectQuickPickItem(project: Project, tagsStore: TagsStore): vscode.QuickPickItem & { project: Project } {
  const tags = tagsStore.getTags(project.id);
  return {
    label: project.name,
    description: project.path,
    detail: tags.length > 0 ? `Tags: ${tags.join(', ')}` : undefined,
    project
  };
}
