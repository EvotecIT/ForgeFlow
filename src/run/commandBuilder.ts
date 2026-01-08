import type { PowerShellProfile, RunRequest } from '../models/run';
import { resolveExecutable } from './powershellProfiles';

export interface ProcessCommand {
  executable: string;
  args: string[];
  cwd?: string;
}

export interface TerminalCommand {
  commandLine: string;
}

export function quotePowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildProcessCommand(request: RunRequest, profile: PowerShellProfile, keepOpen = false): ProcessCommand {
  const executable = resolveExecutable(profile);
  const args: string[] = ['-NoProfile'];
  if (keepOpen) {
    args.push('-NoExit');
  }
  if (process.platform === 'win32') {
    args.push('-ExecutionPolicy', 'Bypass');
  }
  args.push('-File', request.filePath);
  return {
    executable,
    args,
    cwd: request.workingDirectory
  };
}

export function buildTerminalCommand(request: RunRequest): TerminalCommand {
  const parts: string[] = [];
  if (request.workingDirectory) {
    parts.push(`Set-Location -LiteralPath ${quotePowerShellLiteral(request.workingDirectory)}`);
  }
  parts.push(`& ${quotePowerShellLiteral(request.filePath)}`);
  return { commandLine: parts.join('; ') };
}

export function buildAdminCommand(request: RunRequest, profile: PowerShellProfile, keepOpen = false): ProcessCommand {
  const executable = 'powershell.exe';
  const targetExe = resolveExecutable(profile);
  const targetArgs = buildProcessCommand(request, profile, keepOpen).args;
  const argList = targetArgs.map((arg) => quotePowerShellLiteral(arg)).join(', ');
  const parts: string[] = [
    `Start-Process -FilePath ${quotePowerShellLiteral(targetExe)}`,
    `-ArgumentList @(${argList})`,
    '-Verb RunAs'
  ];
  if (request.workingDirectory) {
    parts.push(`-WorkingDirectory ${quotePowerShellLiteral(request.workingDirectory)}`);
  }
  const script = parts.join(' ');
  return {
    executable,
    args: ['-NoProfile', '-Command', script],
    cwd: request.workingDirectory
  };
}
