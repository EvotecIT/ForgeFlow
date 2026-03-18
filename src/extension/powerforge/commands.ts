import * as path from 'path';
import * as vscode from 'vscode';
import type { ProjectsStore } from '../../store/projectsStore';
import { statPath } from '../../util/fs';
import { quoteShellArg } from '../../run/runByFile';
import { resolvePowerForgeLauncher } from '../../powerforge/launcher';
import { findPowerForgeConfigsInRoot } from '../../views/powerforge/scan';
import type { PowerForgeConfigKind } from '../../views/powerforge/types';
import { resolveProjectFromTarget } from '../projectUtils';
import { resolveTargetPath } from '../selection';
import { buildShellCommandLine } from '../run/execution';
import { pickWorkspaceFolderPath } from '../workspaceFolders';

interface PowerForgeConfigSelection {
  configPath: string;
  projectRoot?: string;
}

let powerForgeTerminal: vscode.Terminal | undefined;

export function registerPowerForgeCommands(
  context: vscode.ExtensionContext,
  projectsStore: ProjectsStore,
  refreshViews: () => Promise<void>
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('forgeflow.powerforge.plan', async (target?: unknown) => {
      await runPowerForgePipeline('plan', target, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.powerforge.pipeline', async (target?: unknown) => {
      await runPowerForgePipeline('pipeline', target, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.powerforge.dotnetPublish', async (target?: unknown) => {
      await runPowerForgeDotNetPublish('publish', target, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.powerforge.dotnetPublish.plan', async (target?: unknown) => {
      await runPowerForgeDotNetPublish('plan', target, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.powerforge.dotnetPublish.validate', async (target?: unknown) => {
      await runPowerForgeDotNetPublish('validate', target, projectsStore);
    }),
    vscode.commands.registerCommand('forgeflow.powerforge.refresh', async () => {
      await refreshViews();
    })
  );
}

export function handlePowerForgeTerminalClosed(terminal: vscode.Terminal): void {
  if (terminal === powerForgeTerminal) {
    powerForgeTerminal = undefined;
  }
}

async function runPowerForgePipeline(
  mode: 'plan' | 'pipeline',
  target: unknown,
  projectsStore: ProjectsStore
): Promise<void> {
  const resolved = await resolvePowerForgeConfig('pipeline', target, projectsStore);
  if (!resolved) {
    return;
  }
  const { configPath, projectRoot } = resolved;
  const launcher = await resolvePowerForgeLauncher(projectRoot);
  const args = [
    mode,
    '--config',
    configPath,
    '--output',
    'json'
  ];
  if (projectRoot) {
    args.push('--project-root', projectRoot);
  }
  const commandLine = buildShellCommandLine(launcher.command, [...launcher.args, ...args]);
  await runPowerForgeCommand(commandLine, projectRoot ?? path.dirname(configPath));
}

async function runPowerForgeDotNetPublish(
  mode: 'publish' | 'plan' | 'validate',
  target: unknown,
  projectsStore: ProjectsStore
): Promise<void> {
  const resolved = await resolvePowerForgeConfig('dotnetpublish', target, projectsStore);
  if (!resolved) {
    return;
  }
  const { configPath, projectRoot } = resolved;
  const launcher = await resolvePowerForgeLauncher(projectRoot);
  const args = [
    'dotnet',
    'publish',
    '--config',
    configPath,
    '--output',
    'json'
  ];
  if (mode === 'plan') {
    args.push('--plan');
  } else if (mode === 'validate') {
    args.push('--validate');
  }
  if (projectRoot) {
    args.push('--project-root', projectRoot);
  }
  const commandLine = buildShellCommandLine(launcher.command, [...launcher.args, ...args]);
  await runPowerForgeCommand(commandLine, projectRoot ?? path.dirname(configPath));
}

function isPowerForgePipelineConfig(filePath: string): boolean {
  const name = path.basename(filePath).toLowerCase();
  return name === 'powerforge.json' || name === 'powerforge.pipeline.json';
}

function isPowerForgeDotNetPublishConfig(filePath: string): boolean {
  const name = path.basename(filePath).toLowerCase();
  return name === 'powerforge.dotnetpublish.json' || name === 'powerforge.dotnet.publish.json';
}

async function resolvePowerForgeConfig(
  kind: PowerForgeConfigKind,
  target: unknown,
  projectsStore: ProjectsStore
): Promise<PowerForgeConfigSelection | undefined> {
  const targetPath = resolveTargetPath(target);
  let projectRoot = resolveProjectFromTarget(target, projectsStore)?.path;
  if (targetPath) {
    const stat = await statPath(targetPath);
    if (stat?.type === vscode.FileType.Directory) {
      if (!projectRoot) {
        projectRoot = targetPath;
      }
    } else if (stat?.type === vscode.FileType.File) {
      if (kind === 'pipeline' && isPowerForgePipelineConfig(targetPath)) {
        return { configPath: targetPath, projectRoot: projectRoot ?? path.dirname(targetPath) };
      }
      if (kind === 'dotnetpublish' && isPowerForgeDotNetPublishConfig(targetPath)) {
        return { configPath: targetPath, projectRoot: projectRoot ?? path.dirname(targetPath) };
      }
      if (!projectRoot) {
        projectRoot = path.dirname(targetPath);
      }
    }
  }

  if (!projectRoot) {
    projectRoot = await pickWorkspaceFolderPath('Select workspace folder');
  }

  if (projectRoot) {
    const candidates = await findPowerForgeConfigsInRoot(projectRoot, kind);
    if (candidates.length === 1) {
      const only = candidates[0];
      if (only) {
        return { configPath: only, projectRoot };
      }
    }
    if (candidates.length > 1) {
      const pick = await vscode.window.showQuickPick(
        candidates.map((configPath) => ({
          label: path.basename(configPath),
          description: configPath,
          configPath
        })),
        { placeHolder: 'Select PowerForge config' }
      );
      return pick ? { configPath: pick.configPath, projectRoot } : undefined;
    }
  }

  const workspaceConfigs = await findPowerForgeConfigsInWorkspace(kind);
  if (workspaceConfigs.length === 0) {
    vscode.window.showWarningMessage('ForgeFlow: No PowerForge configuration found.');
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(
    workspaceConfigs.map((configPath) => ({
      label: path.basename(configPath),
      description: configPath,
      configPath
    })),
    { placeHolder: 'Select PowerForge config' }
  );
  if (!pick) {
    return undefined;
  }
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(pick.configPath));
  return { configPath: pick.configPath, projectRoot: folder?.uri.fsPath };
}

async function findPowerForgeConfigsInWorkspace(kind: PowerForgeConfigKind): Promise<string[]> {
  const patterns = kind === 'pipeline'
    ? ['**/powerforge.json', '**/powerforge.pipeline.json', '**/.powerforge/pipeline.json']
    : ['**/powerforge.dotnetpublish.json', '**/powerforge.dotnet.publish.json'];
  const exclude = '**/{node_modules,.git,Artifacts,Artefacts,bin,obj}/**';
  const uris = (
    await Promise.all(patterns.map((pattern) => vscode.workspace.findFiles(pattern, exclude)))
  ).flat();
  const unique = new Map<string, string>();
  for (const uri of uris) {
    unique.set(uri.fsPath, uri.fsPath);
  }
  return [...unique.values()];
}

async function runPowerForgeCommand(commandLine: string, workingDirectory: string | undefined): Promise<void> {
  const terminal = getPowerForgeTerminal(workingDirectory);
  terminal.show(true);
  if (workingDirectory) {
    terminal.sendText(`cd ${quoteShellArg(workingDirectory)}`, true);
  }
  terminal.sendText(commandLine, true);
}

function getPowerForgeTerminal(cwd?: string): vscode.Terminal {
  if (powerForgeTerminal) {
    return powerForgeTerminal;
  }
  powerForgeTerminal = vscode.window.createTerminal({
    name: 'ForgeFlow: PowerForge',
    cwd
  });
  return powerForgeTerminal;
}
