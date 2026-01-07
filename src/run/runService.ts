import { spawn } from 'child_process';
import * as vscode from 'vscode';
import type { FavoritesStore } from '../store/favoritesStore';
import type { ProjectsStore } from '../store/projectsStore';
import { getForgeFlowSettings } from '../util/config';
import type { PowerShellProfile, RunRequest, RunTarget } from '../models/run';
import { ForgeFlowLogger } from '../util/log';
import { buildAdminCommand, buildProcessCommand, buildTerminalCommand } from './commandBuilder';
import { builtInProfiles } from './powershellProfiles';
import { TerminalManager } from './terminalManager';

export class RunService {
  public constructor(
    private readonly logger: ForgeFlowLogger,
    private readonly favoritesStore: FavoritesStore,
    private readonly projectsStore: ProjectsStore,
    private readonly terminalManager: TerminalManager
  ) {}

  public async run(request: RunRequest): Promise<void> {
    const settings = getForgeFlowSettings();
    const profile = this.resolveProfile(request.profileId, request.filePath, request.projectId, settings.powershellProfiles, settings.defaultProfileId);
    if (!profile) {
      vscode.window.showErrorMessage('ForgeFlow: No valid PowerShell profile configured.');
      return;
    }

    if (profile.kind === 'custom' && !profile.executablePath) {
      vscode.window.showErrorMessage('ForgeFlow: Custom profile is missing executablePath.');
      return;
    }

    if (profile.kind === 'windows-powershell' && process.platform !== 'win32') {
      vscode.window.showWarningMessage('ForgeFlow: Windows PowerShell is only available on Windows.');
      return;
    }

    const target = request.target ?? settings.runDefaultTarget;
    if (target === 'integrated') {
      await this.runIntegrated(request, profile, settings.runIntegratedReuseTerminal, settings.runIntegratedPerProjectTerminal);
      return;
    }

    if (target === 'external') {
      await this.runExternal(request, profile);
      return;
    }

    await this.runExternalAdmin(request, profile);
  }

  private resolveProfile(
    explicitProfileId: string | undefined,
    filePath: string,
    projectId: string | undefined,
    profiles: PowerShellProfile[],
    defaultProfileId?: string
  ): PowerShellProfile | undefined {
    const allProfiles = [...builtInProfiles, ...profiles];
    const explicit = explicitProfileId ? allProfiles.find((p) => p.id === explicitProfileId) : undefined;
    if (explicit) {
      return explicit;
    }

    const favoriteOverride = this.favoritesStore.list().find((item) => item.path === filePath)?.profileOverrideId;
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

  private async runIntegrated(request: RunRequest, profile: PowerShellProfile, reuseTerminal: boolean, perProject: boolean): Promise<void> {
    const terminal = this.terminalManager.getTerminal(profile, {
      reuseTerminal,
      perProject,
      projectId: request.projectId,
      workingDirectory: request.workingDirectory
    });
    const command = buildTerminalCommand(request);
    terminal.show(true);
    terminal.sendText(command.commandLine, true);
    this.logger.info(`Run integrated: ${request.filePath}`);
  }

  private async runExternal(request: RunRequest, profile: PowerShellProfile): Promise<void> {
    const command = buildProcessCommand(request, profile);
    this.logger.info(`Run external: ${command.executable} ${command.args.join(' ')}`);
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd,
      stdio: 'inherit'
    });

    child.on('error', (error) => {
      this.logger.error(`Run failed: ${error.message}`);
      vscode.window.showErrorMessage(`ForgeFlow: Run failed - ${error.message}`);
    });
  }

  private async runExternalAdmin(request: RunRequest, profile: PowerShellProfile): Promise<void> {
    if (process.platform !== 'win32') {
      vscode.window.showWarningMessage('ForgeFlow: Elevated external runs are only supported on Windows.');
      return;
    }
    const command = buildAdminCommand(request, profile);
    this.logger.info(`Run external admin: ${command.executable} ${command.args.join(' ')}`);
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd,
      stdio: 'ignore',
      detached: true
    });

    child.unref();
    child.on('error', (error) => {
      this.logger.error(`Admin run failed: ${error.message}`);
      vscode.window.showErrorMessage(`ForgeFlow: Admin run failed - ${error.message}`);
    });
  }
}
