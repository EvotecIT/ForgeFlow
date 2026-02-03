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
  keepOpenMode?: 'never' | 'onError' | 'always';
}

export type RunHistoryKind = 'powershell' | 'command' | 'task';

export interface RunHistoryEntry {
  id: string;
  kind: RunHistoryKind;
  label: string;
  timestamp: number;
  filePath?: string;
  command?: string;
  workingDirectory?: string;
  projectId?: string;
  profileId?: string;
  target?: RunTarget;
  taskName?: string;
  taskSource?: string;
}

export interface RunPreset {
  id: string;
  label: string;
  kind: RunHistoryKind;
  filePath?: string;
  command?: string;
  workingDirectory?: string;
  profileId?: string;
  target?: RunTarget;
  taskName?: string;
  taskSource?: string;
}
