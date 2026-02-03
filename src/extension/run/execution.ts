import * as path from 'path';
import * as vscode from 'vscode';
import type { Project, ProjectEntryPoint } from '../../models/project';
import type { RunHistoryEntry, RunTarget } from '../../models/run';
import { renderCommandTemplate, quoteShellArg } from '../../run/runByFile';
import type { RunService } from '../../run/runService';
import { baseName } from '../../util/path';
import { getForgeFlowSettings } from '../../util/config';
import { readDirectory, statPath } from '../../util/fs';
import type { FavoritesStore } from '../../store/favoritesStore';
import type { ProjectsStore } from '../../store/projectsStore';
import type { RunHistoryStore } from '../../store/runHistoryStore';
import type { ProjectsViewProvider } from '../../views/projectsView';
import { findProjectByPath } from '../projectUtils';
import { normalizeFsPath } from '../pathUtils';
import { buildRunHistoryId, getRunHistoryMaxItems, resolveProfileIdForHistory } from './utils';
import { runShellCommand } from './terminal';
import { runTaskByName } from './tasks';

export async function runProjectEntryPoint(
  project: Project,
  projectsProvider: ProjectsViewProvider,
  runService: RunService,
  projectsStore: ProjectsStore,
  favoritesStore: FavoritesStore,
  runHistoryStore: RunHistoryStore
): Promise<void> {
  const groups = await projectsProvider.getEntryPointGroups(project);
  const entries = [...groups.entryPoints, ...groups.buildScripts];
  const runnable = entries.filter((entry) => {
    const ext = path.extname(entry.path).toLowerCase();
    return entry.kind === 'task' || ext === '.ps1' || ext === '.cs';
  });
  if (runnable.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: No runnable entry points found (.ps1, .cs, or tasks).');
    return;
  }
  const pick = await vscode.window.showQuickPick(
    runnable.map((entry) => ({
      label: entry.label,
      description: entry.kind === 'task' ? entry.task?.type ?? 'task' : entry.path,
      entry
    })),
    { placeHolder: `Run entry point for ${project.name}` }
  );
  if (!pick) {
    return;
  }
  if (pick.entry.kind === 'task') {
    await runTaskEntryPoint(pick.entry, project, runHistoryStore);
    return;
  }
  await runPath(pick.entry.path, runService, projectsStore, favoritesStore, runHistoryStore, undefined);
}

export async function runPath(
  inputPath: string | undefined,
  runService: RunService,
  projectsStore: ProjectsStore,
  favoritesStore: FavoritesStore,
  runHistoryStore: RunHistoryStore,
  target: RunTarget | undefined,
  profileId?: string,
  keepOpenMode?: 'never' | 'onError' | 'always'
): Promise<void> {
  const filePathRaw = inputPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
  const filePath = filePathRaw ? normalizeFsPath(filePathRaw) : undefined;
  if (!filePath) {
    vscode.window.showWarningMessage('ForgeFlow: No file selected to run.');
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  if (extension !== '.ps1') {
    const settings = getForgeFlowSettings();
    if (settings.runByFileEnabled) {
      const handled = await runByFile(filePath, projectsStore, settings, runHistoryStore);
      if (handled) {
        return;
      }
    }
    vscode.window.showWarningMessage('ForgeFlow: Only .ps1 scripts can be run (enable run-by-file to run other types).');
    return;
  }

  const project = findProjectByPath(projectsStore.list(), filePath);
  const projectPath = project ? normalizeFsPath(project.path) : undefined;
  const preferredWorkingDirectory = project?.preferredRunWorkingDirectory;
  const workingDirectory = await resolveWorkingDirectory(filePath, projectPath, preferredWorkingDirectory);
  if (project) {
    await projectsStore.updateLastActivity(project.id, Date.now());
  }
  const resolvedTarget = target ?? project?.preferredRunTarget;
  await runService.run({
    filePath,
    workingDirectory,
    projectId: project?.id,
    profileId,
    target: resolvedTarget,
    keepOpenMode
  });

  await recordPowerShellRunHistory({
    filePath,
    workingDirectory,
    project,
    favoritesStore,
    projectsStore,
    runHistoryStore,
    target: resolvedTarget,
    profileId
  });
}

export async function recordPowerShellRunHistory(options: {
  filePath: string;
  workingDirectory?: string;
  project?: Project;
  favoritesStore: FavoritesStore;
  projectsStore: ProjectsStore;
  runHistoryStore: RunHistoryStore;
  target?: RunTarget;
  profileId?: string;
}): Promise<void> {
  const resolvedProfileId = resolveProfileIdForHistory(
    options.filePath,
    options.project,
    options.profileId,
    options.favoritesStore
  );
  const entry: RunHistoryEntry = {
    id: buildRunHistoryId(),
    kind: 'powershell',
    label: baseName(options.filePath),
    timestamp: Date.now(),
    filePath: options.filePath,
    workingDirectory: options.workingDirectory,
    projectId: options.project?.id,
    profileId: resolvedProfileId,
    target: options.target ?? getForgeFlowSettings().runDefaultTarget
  };
  await options.runHistoryStore.add(entry, getRunHistoryMaxItems());
}

export async function recordCommandRunHistory(
  runHistoryStore: RunHistoryStore,
  options: { filePath: string; command: string; workingDirectory?: string; projectId?: string; label: string }
): Promise<void> {
  const entry: RunHistoryEntry = {
    id: buildRunHistoryId(),
    kind: 'command',
    label: options.label,
    timestamp: Date.now(),
    filePath: options.filePath,
    command: options.command,
    workingDirectory: options.workingDirectory,
    projectId: options.projectId
  };
  await runHistoryStore.add(entry, getRunHistoryMaxItems());
}

export async function runByFile(
  filePath: string,
  projectsStore: ProjectsStore,
  settings: ReturnType<typeof getForgeFlowSettings>,
  runHistoryStore: RunHistoryStore
): Promise<boolean> {
  const extension = path.extname(filePath).toLowerCase();
  if (extension !== '.cs') {
    return false;
  }

  const project = findProjectByPath(projectsStore.list(), filePath);
  if (project) {
    await projectsStore.updateLastActivity(project.id, Date.now());
  }
  const resolution = await resolveDotnetProjectFile(filePath, project?.path);
  if (resolution?.projectFile) {
    const command = renderCommandTemplate(settings.runByFileCsProjectCommand, {
      file: filePath,
      project: resolution.projectFile,
      projectDir: path.dirname(resolution.projectFile)
    });
    runShellCommand(command, path.dirname(resolution.projectFile), settings.runByFileReuseTerminal);
    await recordCommandRunHistory(runHistoryStore, {
      filePath,
      command,
      workingDirectory: path.dirname(resolution.projectFile),
      projectId: project?.id,
      label: `${path.basename(filePath)} (csproj)`
    });
    return true;
  }
  if (resolution?.solutionFile) {
    const command = renderCommandTemplate(settings.runByFileCsSolutionCommand, {
      file: filePath,
      project: resolution.solutionFile,
      projectDir: path.dirname(resolution.solutionFile)
    });
    runShellCommand(command, path.dirname(resolution.solutionFile), settings.runByFileReuseTerminal);
    await recordCommandRunHistory(runHistoryStore, {
      filePath,
      command,
      workingDirectory: path.dirname(resolution.solutionFile),
      projectId: project?.id,
      label: `${path.basename(filePath)} (sln)`
    });
    return true;
  }

  if (settings.runByFileCsScriptEnabled) {
    const command = renderCommandTemplate(settings.runByFileCsScriptCommand, {
      file: filePath,
      project: '',
      projectDir: path.dirname(filePath)
    });
    runShellCommand(command, path.dirname(filePath), settings.runByFileReuseTerminal);
    await recordCommandRunHistory(runHistoryStore, {
      filePath,
      command,
      workingDirectory: path.dirname(filePath),
      projectId: project?.id,
      label: `${path.basename(filePath)} (script)`
    });
    return true;
  }

  vscode.window.showWarningMessage('ForgeFlow: No .csproj or .sln found. Enable .cs script runs or open a project.');
  return true;
}

export async function resolveDotnetProjectFile(
  filePath: string,
  projectRoot?: string
): Promise<{ projectFile?: string; solutionFile?: string } | undefined> {
  const workspaceRoot = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))?.uri.fsPath;
  const root = projectRoot ?? workspaceRoot;
  if (!root) {
    return undefined;
  }
  let current = path.dirname(filePath);
  let foundSolution: string | undefined;
  while (true) {
    const entries = await readDirectory(current);
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File) {
        continue;
      }
      if (name.toLowerCase().endsWith('.csproj')) {
        return { projectFile: path.join(current, name) };
      }
      if (!foundSolution && name.toLowerCase().endsWith('.sln')) {
        foundSolution = path.join(current, name);
      }
    }
    if (normalizeFsPath(current) === normalizeFsPath(root)) {
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return foundSolution ? { solutionFile: foundSolution } : undefined;
}

export async function resolveWorkingDirectory(
  filePath: string,
  projectPath?: string,
  preferredPath?: string
): Promise<string | undefined> {
  const candidates = [preferredPath, projectPath, path.dirname(filePath)].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const stat = await statPath(candidate);
    if (stat?.type === vscode.FileType.Directory) {
      return candidate;
    }
  }
  return undefined;
}

export async function runTaskEntryPoint(
  entry: ProjectEntryPoint,
  project: Project,
  runHistoryStore: RunHistoryStore
): Promise<void> {
  const taskName = entry.task?.name ?? entry.label;
  await runTaskByName(taskName, project);
  const historyEntry: RunHistoryEntry = {
    id: buildRunHistoryId(),
    kind: 'task',
    label: entry.label,
    timestamp: Date.now(),
    projectId: project.id,
    taskName,
    taskSource: entry.task?.source
  };
  await runHistoryStore.add(historyEntry, getRunHistoryMaxItems());
}

export function buildShellCommandLine(command: string, args: string[]): string {
  const needsQuote = /\s/.test(command);
  const commandPart = needsQuote
    ? (process.platform === 'win32' ? `& ${quoteShellArg(command)}` : quoteShellArg(command))
    : command;
  const parts = [commandPart, ...args.map((arg) => quoteShellArg(arg))];
  return parts.join(' ');
}
