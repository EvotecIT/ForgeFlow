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

export type TerminalKeepOpenMode = 'never' | 'onError' | 'always';

export interface TerminalCommandOptions {
  keepOpen?: TerminalKeepOpenMode;
  executable?: string;
}

export function quotePowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildProcessCommand(
  request: RunRequest,
  profile: PowerShellProfile,
  keepOpen = false,
  executableOverride?: string
): ProcessCommand {
  const executable = executableOverride ?? resolveExecutable(profile);
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

export function buildTerminalCommand(request: RunRequest, options?: TerminalCommandOptions): TerminalCommand {
  const parts: string[] = [];
  if (request.workingDirectory) {
    parts.push(`Set-Location -LiteralPath ${quotePowerShellLiteral(request.workingDirectory)}`);
  }
  const keepOpen = options?.keepOpen ?? 'never';
  if (keepOpen === 'never' || !options?.executable) {
    parts.push(`& ${quotePowerShellLiteral(request.filePath)}`);
    return { commandLine: parts.join('; ') };
  }

  const childArgs: string[] = ['-NoProfile'];
  if (process.platform === 'win32') {
    childArgs.push('-ExecutionPolicy', 'Bypass');
  }
  const argLine = childArgs.map((arg) => quotePowerShellLiteral(arg)).join(' ');
  const exeLiteral = quotePowerShellLiteral(options.executable);
  const fileLiteral = quotePowerShellLiteral(request.filePath);
  parts.push(`& ${exeLiteral} ${argLine} -File ${fileLiteral}`);
  parts.push('$ffExit = $LASTEXITCODE');
  if (keepOpen === 'always') {
    parts.push("Write-Host ''");
    parts.push("Read-Host 'Press Enter to close' | Out-Null");
  } else if (keepOpen === 'onError') {
    parts.push("if ($ffExit -ne 0) { Write-Host ''; Write-Host ('Exit code: ' + $ffExit); Read-Host 'Press Enter to close' | Out-Null }");
  }
  return { commandLine: parts.join('; ') };
}

export function buildAdminCommand(
  request: RunRequest,
  profile: PowerShellProfile,
  keepOpen = false,
  targetExecutableOverride?: string
): ProcessCommand {
  const executable = 'powershell.exe';
  const targetExe = targetExecutableOverride ?? resolveExecutable(profile);
  const targetArgs = buildProcessCommand(request, profile, keepOpen, targetExe).args;
  const argList = targetArgs.map((arg) => quotePowerShellLiteral(arg)).join(', ');
  const startProcessParts: string[] = [
    `Start-Process -FilePath ${quotePowerShellLiteral(targetExe)}`,
    `-ArgumentList @(${argList})`,
    '-Verb RunAs',
    '-ErrorAction Stop'
  ];
  if (request.workingDirectory) {
    startProcessParts.push(`-WorkingDirectory ${quotePowerShellLiteral(request.workingDirectory)}`);
  }
  const startProcess = startProcessParts.join(' ');
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `try { ${startProcess} | Out-Null } catch { Write-Error $_.Exception.Message; exit 1 }`
  ].join('; ');
  return {
    executable,
    args: ['-NoProfile', '-Command', script],
    cwd: request.workingDirectory
  };
}
