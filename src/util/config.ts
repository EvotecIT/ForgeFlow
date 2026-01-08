import * as vscode from 'vscode';
import type { PowerShellProfile, RunTarget } from '../models/run';

export type ProjectSortMode = 'recentOpened' | 'recentModified' | 'alphabetical' | 'lastActive' | 'gitCommit';
export type SortDirection = 'asc' | 'desc';

export interface ForgeFlowSettings {
  projectScanRoots: string[];
  projectScanMaxDepth: number;
  projectSortMode: ProjectSortMode;
  projectSortDirection: SortDirection;
  identityScanDepth: number;
  identityPreferredFolders: string[];
  powershellProfiles: PowerShellProfile[];
  defaultProfileId?: string;
  runDefaultTarget: RunTarget;
  runIntegratedReuseTerminal: boolean;
  runIntegratedPerProjectTerminal: boolean;
  runExternalKeepOpen: boolean;
  runExternalAdminKeepOpen: boolean;
  dashboardHideArchived: boolean;
}

export function getForgeFlowSettings(): ForgeFlowSettings {
  const config = vscode.workspace.getConfiguration('forgeflow');
  return {
    projectScanRoots: config.get<string[]>('projects.scanRoots', []),
    projectScanMaxDepth: config.get<number>('projects.scanMaxDepth', 4),
    projectSortMode: config.get<ProjectSortMode>('projects.sortMode', 'recentOpened'),
    projectSortDirection: config.get<SortDirection>('projects.sortDirection', 'desc'),
    identityScanDepth: config.get<number>('projects.identityScanDepth', 4),
    identityPreferredFolders: config.get<string[]>('projects.identityPreferredFolders', [
      'module',
      'modules',
      'src',
      'source',
      'sources'
    ]),
    powershellProfiles: config.get<PowerShellProfile[]>('powershell.profiles', []),
    defaultProfileId: config.get<string>('powershell.defaultProfileId'),
    runDefaultTarget: config.get<RunTarget>('run.defaultTarget', 'integrated'),
    runIntegratedReuseTerminal: config.get<boolean>('run.integrated.reuseTerminal', true),
    runIntegratedPerProjectTerminal: config.get<boolean>('run.integrated.perProjectTerminal', true),
    runExternalKeepOpen: config.get<boolean>('run.external.keepOpen', true),
    runExternalAdminKeepOpen: config.get<boolean>('run.externalAdmin.keepOpen', true),
    dashboardHideArchived: config.get<boolean>('dashboard.hideArchived', false)
  };
}
