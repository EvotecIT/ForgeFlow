import * as path from 'path';
import * as vscode from 'vscode';
import type { Project } from '../../models/project';
import type { ProjectsViewProvider } from '../../views/projectsView';
import type { ProjectsStore } from '../../store/projectsStore';
import { openInVisualStudio } from '../../util/open';
import { extractPath, extractProject } from '../selection';
import { findProjectByPath, pickProject } from '../projectUtils';

export async function movePinnedItem(
  itemPath: string,
  direction: 'up' | 'down',
  store: ProjectsStore,
  provider: ProjectsViewProvider
): Promise<void> {
  const project = findProjectByPath(store.list(), itemPath);
  if (!project) {
    return;
  }
  const pinned = [...project.pinnedItems];
  const index = pinned.indexOf(itemPath);
  if (index === -1) {
    return;
  }
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= pinned.length) {
    return;
  }
  pinned.splice(index, 1);
  pinned.splice(targetIndex, 0, itemPath);
  await store.updatePinnedItems(project.id, pinned);
  await provider.refresh();
}

interface EntryPointPick extends vscode.QuickPickItem {
  path: string;
}

export async function manageEntryPoints(
  target: unknown,
  store: ProjectsStore,
  provider: ProjectsViewProvider
): Promise<void> {
  const projects = store.list();
  const targetPath = extractPath(target);
  const project = extractProject(target)
    ?? (targetPath ? findProjectByPath(projects, targetPath) : undefined)
    ?? await pickProject(projects, 'Select project to manage entry points');
  if (!project) {
    return;
  }

  const overrides = project.entryPointOverrides ?? [];
  const picks = overrides.map((entryPath) => createEntryPointPick(project.path, entryPath));
  const quickPick = vscode.window.createQuickPick<EntryPointPick>();
  quickPick.title = `Manage Entry Points — ${project.name}`;
  quickPick.placeholder = 'Select entry points to keep (use + to add more)';
  quickPick.canSelectMany = true;
  quickPick.items = picks;
  quickPick.selectedItems = picks;
  const addButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('add'),
    tooltip: 'Add entry point'
  };
  quickPick.buttons = [addButton];

  const disposables: vscode.Disposable[] = [];
  const done = new Promise<void>((resolve) => {
    disposables.push(
      quickPick.onDidTriggerButton(async (button) => {
        if (button !== addButton) {
          return;
        }
        const picked = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: true,
          defaultUri: vscode.Uri.file(project.path),
          title: `Add entry points for ${project.name}`
        });
        if (!picked || picked.length === 0) {
          return;
        }
        const existing = new Set(quickPick.items.map((item) => item.path));
        const nextItems = [...quickPick.items];
        const nextSelected = new Set(quickPick.selectedItems.map((item) => item.path));
        for (const uri of picked) {
          const entryPath = uri.fsPath;
          if (existing.has(entryPath)) {
            nextSelected.add(entryPath);
            continue;
          }
          const item = createEntryPointPick(project.path, entryPath);
          nextItems.push(item);
          nextSelected.add(entryPath);
        }
        quickPick.items = nextItems;
        quickPick.selectedItems = nextItems.filter((item) => nextSelected.has(item.path));
      }),
      quickPick.onDidAccept(async () => {
        const selected = quickPick.selectedItems.map((item) => item.path);
        await store.updateEntryPointOverrides(project.id, selected);
        provider.invalidateEntryPointCache(project.id);
        await provider.refresh();
        quickPick.hide();
      }),
      quickPick.onDidHide(() => {
        resolve();
      })
    );
  });

  quickPick.show();
  await done;
  disposables.forEach((disposable) => disposable.dispose());
}

export async function openProjectInVisualStudio(project: Project, projectsProvider: ProjectsViewProvider): Promise<void> {
  const groups = await projectsProvider.getEntryPointGroups(project);
  const entries = [...groups.entryPoints, ...groups.buildScripts];
  const solutions = entries.filter((entry) => path.extname(entry.path).toLowerCase() === '.sln');
  if (solutions.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: No .sln file found for this project.');
    return;
  }
  const first = solutions[0];
  if (!first) {
    return;
  }
  let target = first;
  if (solutions.length > 1) {
    const pick = await vscode.window.showQuickPick(
      solutions.map((entry) => ({
        label: entry.label,
        description: entry.path,
        entry
      })),
      { placeHolder: `Select solution for ${project.name}` }
    );
    if (!pick) {
      return;
    }
    target = pick.entry;
  }
  await openInVisualStudio(target.path);
}

function createEntryPointPick(projectPath: string, entryPath: string): EntryPointPick {
  const relative = path.relative(projectPath, entryPath);
  const isRelative = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  return {
    label: path.basename(entryPath),
    description: isRelative ? relative : entryPath,
    detail: isRelative ? entryPath : undefined,
    path: entryPath
  };
}
