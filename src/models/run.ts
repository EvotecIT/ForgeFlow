export type PowerShellProfileKind = 'windows-powershell' | 'pwsh' | 'pwsh-preview' | 'custom';

export interface PowerShellProfile {
  id: string;
  label: string;
  kind: PowerShellProfileKind;
  executablePath?: string;
}

export type RunTarget = 'integrated' | 'external' | 'externalAdmin';

export interface RunRequest {
  filePath: string;
  workingDirectory?: string;
  projectId?: string;
  profileId?: string;
  target?: RunTarget;
}
