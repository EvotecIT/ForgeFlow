import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as vscode from 'vscode';
import type { FavoritesStore } from '../store/favoritesStore';
import type { ProjectsStore } from '../store/projectsStore';
import { getForgeFlowSettings } from '../util/config';
import type { PowerShellProfile, RunRequest } from '../models/run';
import type { ForgeFlowLogger } from '../util/log';
import { buildAdminCommand, buildInlinePowerShellArgs, buildProcessCommand, buildTerminalCommand } from './commandBuilder';
import { getAllProfiles, resolveExecutable, resolveExecutablePath } from './powershellProfiles';
import { buildReusableTerminalKey } from './terminalKeys';
import type { TerminalManager } from './terminalManager';

export class RunService implements vscode.Disposable {
  private readonly externalSessions = new Map<string, ChildProcessWithoutNullStreams>();
  private externalOutput?: vscode.OutputChannel;

  public constructor(
    private readonly logger: ForgeFlowLogger,
    private readonly favoritesStore: FavoritesStore,
    private readonly projectsStore: ProjectsStore,
    private readonly terminalManager: TerminalManager
  ) {}

  public async run(request: RunRequest): Promise<void> {
    const settings = getForgeFlowSettings();
    const resolved = await this.resolveProfileWithExecutable(
      request,
      settings.powershellProfiles,
      settings.defaultProfileId
    );
    if (!resolved) {
      return;
    }
    const { profile, executable, reasonOverride } = resolved;
    const project = request.projectId
      ? this.projectsStore.list().find((item) => item.id === request.projectId)
      : undefined;

    if (profile.kind === 'custom' && !profile.executablePath) {
      vscode.window.showErrorMessage('ForgeFlow: Custom profile is missing executablePath.');
      return;
    }

    if (profile.kind === 'windows-powershell' && process.platform !== 'win32') {
      vscode.window.showWarningMessage('ForgeFlow: Windows PowerShell is only available on Windows.');
      return;
    }

    const target = request.target ?? settings.runDefaultTarget;
    const targetLabel = target === 'integrated'
      ? 'Integrated'
      : target === 'external'
        ? 'External'
        : 'Admin (External)';
    const profileDetail = profile.kind === 'custom' && profile.executablePath
      ? `${profile.label} (${profile.executablePath})`
      : profile.label;
    if (settings.runShowProfileToast) {
      const reason = reasonOverride ?? this.resolveProfileReason(
        request.profileId,
        request.filePath,
        request.projectId,
        settings.powershellProfiles,
        settings.defaultProfileId
      );
      const reasonSuffix = reason ? ` — ${reason}` : '';
      vscode.window.setStatusBarMessage(`ForgeFlow: Run ${targetLabel} (${profileDetail})${reasonSuffix}.`, 3000);
    }
    if (target === 'integrated') {
      const keepOpen = request.keepOpenMode ?? project?.preferredRunKeepOpen ?? settings.runIntegratedKeepOpen;
      await this.runIntegrated(
        request,
        profile,
        executable,
        settings.runIntegratedReuseTerminal,
        settings.runIntegratedReuseScope,
        settings.runIntegratedPerProjectTerminal,
        keepOpen,
        settings.runIntegratedEchoCommand,
        settings.runIntegratedKeepOpenPrompt
      );
      return;
    }

    if (target === 'external') {
      await this.runExternal(
        request,
        profile,
        executable,
        settings.runExternalKeepOpen,
        settings.runExternalReuseSession,
        settings.runExternalLogOutput,
        settings.runExternalAlwaysRestart
      );
      return;
    }

    if (settings.runExternalReuseSession) {
      vscode.window.setStatusBarMessage('ForgeFlow: External session reuse is not supported for elevated runs.', 3000);
    }
    await this.runExternalAdmin(request, profile, executable, settings.runExternalAdminKeepOpen);
  }

  private resolveProfile(
    explicitProfileId: string | undefined,
    filePath: string,
    projectId: string | undefined,
    profiles: PowerShellProfile[],
    defaultProfileId?: string
  ): PowerShellProfile | undefined {
    const allProfiles = getAllProfiles(profiles);
    const explicit = explicitProfileId ? allProfiles.find((p) => p.id === explicitProfileId) : undefined;
    if (explicit) {
      return explicit;
    }

    const normalizedFilePath = normalizePathForCompare(filePath);
    const favoriteOverride = this.favoritesStore.list()
      .find((item) => normalizePathForCompare(item.path) === normalizedFilePath)?.profileOverrideId;
    if (favoriteOverride) {
      const favoriteProfile = allProfiles.find((p) => p.id === favoriteOverride);
      if (favoriteProfile) {
        return favoriteProfile;
      }
    }

    if (projectId) {
      const project = this.projectsStore.list().find((item) => item.id === projectId);
      if (project?.preferredRunProfileId) {
        const projectProfile = allProfiles.find((p) => p.id === project.preferredRunProfileId);
        if (projectProfile) {
          return projectProfile;
        }
      }
    }

    if (defaultProfileId) {
      const defaultProfile = allProfiles.find((p) => p.id === defaultProfileId);
      if (defaultProfile) {
        return defaultProfile;
      }
    }

    return allProfiles[0];
  }

  private resolveProfileReason(
    explicitProfileId: string | undefined,
    filePath: string,
    projectId: string | undefined,
    profiles: PowerShellProfile[],
    defaultProfileId?: string
  ): string | undefined {
    const allProfiles = getAllProfiles(profiles);
    if (explicitProfileId && allProfiles.some((p) => p.id === explicitProfileId)) {
      return 'explicit profile';
    }

    const normalizedFilePath = normalizePathForCompare(filePath);
    const favoriteOverride = this.favoritesStore.list()
      .find((item) => normalizePathForCompare(item.path) === normalizedFilePath)?.profileOverrideId;
    if (favoriteOverride && allProfiles.some((p) => p.id === favoriteOverride)) {
      return 'favorite override';
    }

    if (projectId) {
      const project = this.projectsStore.list().find((item) => item.id === projectId);
      if (project?.preferredRunProfileId && allProfiles.some((p) => p.id === project.preferredRunProfileId)) {
        return 'project override';
      }
    }

    if (defaultProfileId && allProfiles.some((p) => p.id === defaultProfileId)) {
      return 'default profile';
    }

    return allProfiles.length > 0 ? 'first available profile' : undefined;
  }

  private async resolveProfileWithExecutable(
    request: RunRequest,
    profiles: PowerShellProfile[],
    defaultProfileId?: string
  ): Promise<{ profile: PowerShellProfile; executable: string; reasonOverride?: string } | undefined> {
    const profile = this.resolveProfile(request.profileId, request.filePath, request.projectId, profiles, defaultProfileId);
    if (!profile) {
      vscode.window.showErrorMessage('ForgeFlow: No valid PowerShell profile configured.');
      return undefined;
    }

    const executable = resolveExecutablePath(profile);
    if (executable) {
      return { profile, executable };
    }

    const available = this.getAvailableProfiles(profiles).filter((entry) => entry.profile.id !== profile.id);
    const fallback = this.pickFallbackProfile(profile, available);
    const missingDetail = profile.kind === 'custom' && profile.executablePath
      ? ` (${profile.executablePath})`
      : '';
    const actions = [];
    if (fallback) {
      actions.push(`Use ${fallback.profile.label}`);
    }
    actions.push('Manage Profiles', 'Open Settings');
    const choice = await vscode.window.showWarningMessage(
      `ForgeFlow: PowerShell executable not found for profile "${profile.label}"${missingDetail}.`,
      ...actions
    );
    if (choice && fallback && choice === `Use ${fallback.profile.label}`) {
      return { profile: fallback.profile, executable: fallback.executable, reasonOverride: 'fallback profile' };
    }
    if (choice === 'Manage Profiles') {
      await vscode.commands.executeCommand('forgeflow.powershell.manageProfiles');
    } else if (choice === 'Open Settings') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'forgeflow.powershell');
    }
    return undefined;
  }

  private getAvailableProfiles(
    profiles: PowerShellProfile[]
  ): Array<{ profile: PowerShellProfile; executable: string }> {
    return getAllProfiles(profiles).flatMap((profile) => {
      const executable = resolveExecutablePath(profile);
      return executable ? [{ profile, executable }] : [];
    });
  }

  private pickFallbackProfile(
    primary: PowerShellProfile,
    available: Array<{ profile: PowerShellProfile; executable: string }>
  ): { profile: PowerShellProfile; executable: string } | undefined {
    if (available.length === 0) {
      return undefined;
    }
    if (primary.kind === 'pwsh-preview') {
      return available.find((entry) => entry.profile.kind === 'pwsh') ?? available[0];
    }
    if (primary.kind === 'pwsh') {
      return available.find((entry) => entry.profile.kind === 'windows-powershell') ?? available[0];
    }
    if (primary.kind === 'windows-powershell') {
      return available.find((entry) => entry.profile.kind === 'pwsh') ?? available[0];
    }
    return available[0];
  }

  private async runIntegrated(
    request: RunRequest,
    profile: PowerShellProfile,
    executable: string,
    reuseTerminal: boolean,
    reuseScope: 'profile' | 'shared',
    perProject: boolean,
    keepOpen: 'never' | 'onError' | 'always',
    echoCommand: boolean,
    keepOpenPrompt: boolean
  ): Promise<void> {
    if (!echoCommand) {
      await this.runIntegratedTask(request, profile, executable, reuseTerminal, reuseScope, perProject, keepOpen, keepOpenPrompt);
      return;
    }
    const terminal = this.terminalManager.getTerminal(profile, {
      reuseTerminal,
      reuseScope,
      perProject,
      projectId: request.projectId,
      workingDirectory: request.workingDirectory,
      shellPath: executable
    });
    const command = buildTerminalCommand(request, { keepOpen, executable, keepOpenPrompt });
    terminal.show(true);
    terminal.sendText(command.commandLine, true);
    this.logger.info(`Run integrated: ${request.filePath}`);
  }

  private async runIntegratedTask(
    request: RunRequest,
    profile: PowerShellProfile,
    executable: string,
    reuseTerminal: boolean,
    reuseScope: 'profile' | 'shared',
    perProject: boolean,
    keepOpen: 'never' | 'onError' | 'always',
    keepOpenPrompt: boolean
  ): Promise<void> {
    const taskKey = this.buildIntegratedTaskKey(profile, {
      reuseTerminal,
      reuseScope,
      perProject,
      projectId: request.projectId
    });
    const taskName = taskKey === 'shared' ? 'ForgeFlow: Run' : `ForgeFlow: Run (${taskKey})`;
    const definition = { type: 'forgeflow', task: 'integratedRun', key: taskKey };
    const args = buildInlinePowerShellArgs(request, keepOpen, executable, keepOpenPrompt);
    const execution = new vscode.ProcessExecution(executable, args, {
      cwd: request.workingDirectory
    });
    const task = new vscode.Task(definition, vscode.TaskScope.Workspace, taskName, 'ForgeFlow', execution);
    const panel = reuseTerminal
      ? (reuseScope === 'shared' ? vscode.TaskPanelKind.Shared : vscode.TaskPanelKind.Dedicated)
      : vscode.TaskPanelKind.New;
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel,
      focus: false,
      echo: false,
      clear: false,
      showReuseMessage: false
    };
    task.runOptions = { reevaluateOnRerun: true };
    await vscode.tasks.executeTask(task);
    this.logger.info(`Run integrated (task): ${request.filePath}`);
  }

  private buildIntegratedTaskKey(
    profile: PowerShellProfile,
    options: {
      reuseTerminal: boolean;
      reuseScope: 'profile' | 'shared';
      perProject: boolean;
      projectId?: string;
    }
  ): string {
    if (!options.reuseTerminal) {
      const stamp = Date.now().toString(36);
      const rand = Math.random().toString(36).slice(2, 8);
      return `run-${stamp}-${rand}`;
    }
    return buildReusableTerminalKey(profile.id, options);
  }

  private async runExternal(
    request: RunRequest,
    profile: PowerShellProfile,
    executable: string,
    keepOpen: boolean,
    reuseSession: boolean,
    logOutput: boolean,
    alwaysRestart: boolean
  ): Promise<void> {
    if (reuseSession) {
      const command = buildTerminalCommand(request);
      if (alwaysRestart) {
        this.resetExternalSession(profile.id);
        vscode.window.setStatusBarMessage('ForgeFlow: External session restarted.', 2000);
      }
      const session = this.getExternalSession(profile, logOutput, executable);
      if (session?.stdin && !session.killed && session.exitCode === null) {
        const sent = this.trySendExternalCommand(session, command.commandLine);
        if (sent) {
          this.logger.info(`Run external (reuse): ${request.filePath}`);
          return;
        }
        this.logger.warn('External session stale, restarting.');
        this.resetExternalSession(profile.id);
        const retry = this.getExternalSession(profile, logOutput, executable);
        if (retry?.stdin && !retry.killed && retry.exitCode === null) {
          const resent = this.trySendExternalCommand(retry, command.commandLine);
          if (resent) {
            vscode.window.setStatusBarMessage('ForgeFlow: External session restarted.', 2500);
            this.logger.info(`Run external (reuse): ${request.filePath}`);
            return;
          }
        }
      }
      this.logger.warn('External session reuse requested but no live session found, spawning new process.');
      vscode.window.setStatusBarMessage('ForgeFlow: External session not available, starting new window.', 2500);
    }

    const command = buildProcessCommand(request, profile, keepOpen, executable);
    this.logger.info(`Run external: ${command.executable} ${command.args.join(' ')}`);
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd,
      stdio: 'inherit'
    });

    child.on('error', (error) => {
      const context = this.formatRunContext(request, profile, 'external');
      this.logger.error(`Run failed (${context}): ${error.message}`);
      vscode.window.showErrorMessage(`ForgeFlow: Run failed (${context}) - ${error.message}`);
    });
  }

  private async runExternalAdmin(
    request: RunRequest,
    profile: PowerShellProfile,
    executable: string,
    keepOpen: boolean
  ): Promise<void> {
    if (process.platform !== 'win32') {
      vscode.window.showWarningMessage('ForgeFlow: Elevated external runs are only supported on Windows.');
      return;
    }
    const command = buildAdminCommand(request, profile, keepOpen, executable);
    this.logger.info(`Run external admin: ${command.executable} ${command.args.join(' ')}`);
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    const stderrChunks: string[] = [];
    child.stderr?.on('data', (chunk) => {
      stderrChunks.push(chunk.toString());
    });
    child.on('error', (error) => {
      const context = this.formatRunContext(request, profile, 'externalAdmin');
      this.logger.error(`Admin run failed (${context}): ${error.message}`);
      vscode.window.showErrorMessage(`ForgeFlow: Admin run failed (${context}) - ${error.message}`);
    });
    child.on('exit', (code) => {
      if (code === 0 || code === null) {
        return;
      }
      const context = this.formatRunContext(request, profile, 'externalAdmin');
      const stderr = stderrChunks.join('').trim();
      const message = stderr ? `${stderr}` : `exit code ${code}`;
      this.logger.error(`Admin run failed (${context}): ${message}`);
      vscode.window.showErrorMessage(`ForgeFlow: Admin run failed (${context}) - ${message}`);
    });
    child.unref();
  }

  private getExternalSession(
    profile: PowerShellProfile,
    logOutput: boolean,
    executableOverride?: string
  ): ChildProcessWithoutNullStreams | undefined {
    const key = profile.id;
    const existing = this.externalSessions.get(key);
    if (existing && existing.exitCode === null && !existing.killed) {
      return existing;
    }
    if (existing) {
      this.externalSessions.delete(key);
    }

    const executable = executableOverride ?? resolveExecutable(profile);
    const args: string[] = ['-NoLogo', '-NoProfile', '-NoExit'];
    if (process.platform === 'win32') {
      args.push('-ExecutionPolicy', 'Bypass');
    }
    const child = spawn(executable, args, {
      stdio: 'pipe',
      windowsHide: false
    });

    const outputChannel = this.getExternalOutputChannel(logOutput);
    child.stdout.on('data', (chunk) => {
      const message = chunk.toString().trimEnd();
      if (!message) {
        return;
      }
      if (outputChannel) {
        outputChannel.appendLine(`[${profile.label}] ${message}`);
      } else {
        this.logger.info(`[External:${profile.label}] ${message}`);
      }
    });
    child.stderr.on('data', (chunk) => {
      const message = chunk.toString().trimEnd();
      if (!message) {
        return;
      }
      if (outputChannel) {
        outputChannel.appendLine(`[${profile.label}] ${message}`);
      } else {
        this.logger.error(`[External:${profile.label}] ${message}`);
      }
    });
    child.on('exit', () => {
      this.externalSessions.delete(key);
    });
    child.on('error', (error) => {
      this.logger.error(`External session error: ${error.message}`);
      this.externalSessions.delete(key);
    });

    this.externalSessions.set(key, child);
    return child;
  }

  private getExternalOutputChannel(enabled: boolean): vscode.OutputChannel | undefined {
    if (!enabled) {
      return undefined;
    }
    if (!this.externalOutput) {
      this.externalOutput = vscode.window.createOutputChannel('ForgeFlow External PowerShell');
    }
    return this.externalOutput;
  }

  private trySendExternalCommand(session: ChildProcessWithoutNullStreams, commandLine: string): boolean {
    try {
      session.stdin.write(`${commandLine}\n`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`External session write failed: ${message}`);
      return false;
    }
  }

  private formatRunContext(request: RunRequest, profile: PowerShellProfile, target: 'external' | 'externalAdmin'): string {
    const parts = [
      target,
      `profile:${profile.label}`
    ];
    if (request.projectId) {
      parts.push(`project:${request.projectId}`);
    }
    if (request.workingDirectory) {
      parts.push(`cwd:${request.workingDirectory}`);
    }
    return parts.join(' ');
  }

  public resetExternalSession(profileId?: string): number {
    if (profileId) {
      const session = this.externalSessions.get(profileId);
      if (!session) {
        return 0;
      }
      this.closeExternalSession(session);
      this.externalSessions.delete(profileId);
      return 1;
    }
    let count = 0;
    for (const [key, session] of this.externalSessions.entries()) {
      this.closeExternalSession(session);
      this.externalSessions.delete(key);
      count += 1;
    }
    return count;
  }

  private closeExternalSession(session: ChildProcessWithoutNullStreams): void {
    try {
      session.stdin.write('exit\n');
    } catch (error) {
      this.logger.warn(`External session exit failed: ${String(error)}`);
    }
    try {
      session.kill();
    } catch (error) {
      this.logger.warn(`External session kill failed: ${String(error)}`);
    }
  }

  public dispose(): void {
    this.resetExternalSession();
    if (this.externalOutput) {
      this.externalOutput.dispose();
      this.externalOutput = undefined;
    }
  }
}

function normalizePathForCompare(value: string): string {
  if (process.platform !== 'win32') {
    return value;
  }
  const match = /^\/([a-zA-Z]:)(\/.*)/.exec(value);
  const normalized = match ? `${match[1]}${match[2]}` : value;
  return normalized.replace(/\//g, '\\').toLowerCase();
}
