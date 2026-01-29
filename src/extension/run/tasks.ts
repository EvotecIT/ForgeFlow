import * as vscode from 'vscode';
import type { Project } from '../../models/project';
import { normalizeFsPath } from '../pathUtils';

export async function runTaskByName(taskName: string, project: Project): Promise<void> {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(project.path));
  const tasks = await vscode.tasks.fetchTasks();
  const matches = tasks.filter((task) => {
    if (task.name.toLowerCase() !== taskName.toLowerCase()) {
      return false;
    }
    if (!folder || typeof task.scope !== 'object' || !task.scope) {
      return true;
    }
    if ('uri' in task.scope) {
      return normalizeFsPath(task.scope.uri.fsPath) === normalizeFsPath(folder.uri.fsPath);
    }
    return true;
  });
  if (matches.length === 0) {
    vscode.window.showWarningMessage(`ForgeFlow: Task "${taskName}" not found for ${project.name}.`);
    return;
  }
  const first = matches[0];
  if (!first) {
    return;
  }
  let targetTask = first;
  if (matches.length > 1) {
    const pick = await vscode.window.showQuickPick(
      matches.map((task) => ({
        label: task.name,
        description: task.source,
        detail: task.definition?.type,
        task
      })),
      { placeHolder: `Select task "${taskName}" to run` }
    );
    if (!pick) {
      return;
    }
    targetTask = pick.task;
  }
  await vscode.tasks.executeTask(targetTask);
}
