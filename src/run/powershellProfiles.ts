import * as fs from 'fs';
import * as path from 'path';
import type { PowerShellProfile, PowerShellProfileKind } from '../models/run';

export const builtInProfiles: PowerShellProfile[] = [
  {
    id: 'windows-powershell',
    label: 'Windows PowerShell 5.1',
    kind: 'windows-powershell'
  },
  {
    id: 'pwsh',
    label: 'PowerShell 7+',
    kind: 'pwsh'
  },
  {
    id: 'pwsh-preview',
    label: 'PowerShell 7 Preview',
    kind: 'pwsh-preview'
  }
];

export function getAllProfiles(custom: PowerShellProfile[]): PowerShellProfile[] {
  return [...builtInProfiles, ...custom];
}

export function resolveProfile(profileId: string | undefined, custom: PowerShellProfile[]): PowerShellProfile | undefined {
  if (!profileId) {
    return undefined;
  }
  return getAllProfiles(custom).find((profile) => profile.id === profileId);
}

export function resolveProfileLabel(profileId: string | undefined, custom: PowerShellProfile[]): string | undefined {
  return resolveProfile(profileId, custom)?.label;
}

export function resolveExecutable(profile: PowerShellProfile): string {
  if (profile.kind === 'custom') {
    return profile.executablePath ?? '';
  }
  if (profile.kind === 'windows-powershell') {
    return 'powershell.exe';
  }
  if (profile.kind === 'pwsh-preview') {
    return 'pwsh-preview';
  }
  return 'pwsh';
}

export function resolveExecutablePath(profile: PowerShellProfile): string | undefined {
  if (profile.kind === 'custom') {
    const custom = profile.executablePath;
    if (!custom) {
      return undefined;
    }
    if (isPathLike(custom)) {
      return fileExists(custom) ? custom : undefined;
    }
    return findExecutableOnPath(custom);
  }

  const command = resolveExecutable(profile);
  const onPath = findExecutableOnPath(command);
  if (onPath) {
    return onPath;
  }

  const candidates = getCommonLocations(profile.kind);
  for (const candidate of candidates) {
    if (fileExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function profileKindLabel(kind: PowerShellProfileKind): string {
  switch (kind) {
    case 'windows-powershell':
      return 'Windows PowerShell';
    case 'pwsh':
      return 'PowerShell 7+';
    case 'pwsh-preview':
      return 'PowerShell 7 Preview';
    case 'custom':
      return 'Custom';
    default:
      return 'Unknown';
  }
}

export function profileKindIcon(kind: PowerShellProfileKind): string {
  switch (kind) {
    case 'windows-powershell':
      return 'terminal-powershell';
    case 'pwsh':
      return 'terminal-powershell';
    case 'pwsh-preview':
      return 'beaker';
    case 'custom':
      return 'gear';
    default:
      return 'terminal';
  }
}

function findExecutableOnPath(command: string): string | undefined {
  const pathValue = process.env.PATH ?? '';
  if (!pathValue) {
    return undefined;
  }
  const entries = pathValue.split(path.delimiter).filter(Boolean);
  const extensions = getPathExtensions(command);
  for (const entry of entries) {
    for (const ext of extensions) {
      const candidate = path.join(entry, `${command}${ext}`);
      if (fileExists(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

function getPathExtensions(command: string): string[] {
  if (process.platform !== 'win32') {
    return [''];
  }
  if (path.extname(command)) {
    return [''];
  }
  const pathext = process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM';
  return pathext.split(';').filter(Boolean);
}

function getCommonLocations(kind: PowerShellProfileKind): string[] {
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
    switch (kind) {
      case 'windows-powershell':
        return [path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')];
      case 'pwsh':
        return [path.join(programFiles, 'PowerShell', '7', 'pwsh.exe')];
      case 'pwsh-preview':
        return [path.join(programFiles, 'PowerShell', '7-preview', 'pwsh.exe')];
      default:
        return [];
    }
  }
  if (kind === 'windows-powershell') {
    return [];
  }
  return ['/usr/bin/pwsh', '/usr/local/bin/pwsh', '/snap/bin/pwsh'];
}

function isPathLike(value: string): boolean {
  return value.includes('/') || value.includes('\\') || path.isAbsolute(value);
}

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}
