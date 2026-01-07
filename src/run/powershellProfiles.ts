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

export function resolveExecutable(profile: PowerShellProfile): string {
  if (profile.kind === 'custom') {
    return profile.executablePath ?? '';
  }
  if (profile.kind === 'windows-powershell') {
    return 'powershell.exe';
  }
  return 'pwsh';
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
