import * as vscode from 'vscode';
import type { PowerShellProfile } from '../models/run';
import { resolveExecutable } from './powershellProfiles';

export interface TerminalOptions {
  reuseTerminal: boolean;
  perProject: boolean;
  projectId?: string;
  workingDirectory?: string;
}

export class TerminalManager implements vscode.Disposable {
  private readonly terminals = new Map<string, vscode.Terminal>();

  public getTerminal(profile: PowerShellProfile, options: TerminalOptions): vscode.Terminal {
    const key = this.getKey(profile, options);
    const existing = options.reuseTerminal ? this.terminals.get(key) : undefined;
    if (existing) {
      return existing;
    }

    const shellPath = resolveExecutable(profile);
    const shellArgs: string[] = ['-NoLogo', '-NoProfile'];
    if (process.platform === 'win32') {
      shellArgs.push('-ExecutionPolicy', 'Bypass');
    }

    const terminal = vscode.window.createTerminal({
      name: options.projectId ? `ForgeFlow: ${options.projectId}` : 'ForgeFlow',
      shellPath,
      shellArgs,
      cwd: options.workingDirectory
    });

    if (options.reuseTerminal) {
      this.terminals.set(key, terminal);
    }

    return terminal;
  }

  public dispose(): void {
    for (const terminal of this.terminals.values()) {
      terminal.dispose();
    }
    this.terminals.clear();
  }

  private getKey(profile: PowerShellProfile, options: TerminalOptions): string {
    if (options.perProject && options.projectId) {
      return `${profile.id}:${options.projectId}`;
    }
    return profile.id;
  }
}
