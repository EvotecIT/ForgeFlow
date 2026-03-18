import * as vscode from 'vscode';
import type { PowerShellProfile } from '../models/run';
import { resolveExecutable } from './powershellProfiles';
import { buildReusableTerminalKey } from './terminalKeys';

export interface TerminalOptions {
  reuseTerminal: boolean;
  reuseScope: 'profile' | 'shared';
  perProject: boolean;
  projectId?: string;
  workingDirectory?: string;
  shellPath?: string;
}

export class TerminalManager implements vscode.Disposable {
  private readonly terminals = new Map<string, vscode.Terminal>();
  private readonly closeSubscription: vscode.Disposable;

  public constructor() {
    this.closeSubscription = vscode.window.onDidCloseTerminal((terminal) => {
      for (const [key, value] of this.terminals.entries()) {
        if (value === terminal) {
          this.terminals.delete(key);
        }
      }
    });
  }

  public getTerminal(profile: PowerShellProfile, options: TerminalOptions): vscode.Terminal {
    const key = this.getKey(profile, options);
    const existing = options.reuseTerminal ? this.terminals.get(key) : undefined;
    if (existing) {
      return existing;
    }

    const shellPath = options.shellPath ?? resolveExecutable(profile);
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
    this.closeSubscription.dispose();
    for (const terminal of this.terminals.values()) {
      terminal.dispose();
    }
    this.terminals.clear();
  }

  private getKey(profile: PowerShellProfile, options: TerminalOptions): string {
    return buildReusableTerminalKey(profile.id, options);
  }
}
