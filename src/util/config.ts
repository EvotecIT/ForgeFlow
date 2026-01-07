import * as vscode from 'vscode';
import type { PowerShellProfile, RunTarget } from '../models/run';

export type ProjectSortMode = 'recentOpened' | 'recentModified' | 'alphabetical';

export interface ForgeFlowSettings {
  projectScanRoots: string[];
  projectScanMaxDepth: number;
  projectSortMode: ProjectSortMode;
  powershellProfiles: PowerShellProfile[];
  defaultProfileId?: string;
  runDefaultTarget: RunTarget;
  runIntegratedReuseTerminal: boolean;
  runIntegratedPerProjectTerminal: boolean;
  dashboardHideArchived: boolean;
}

export function getForgeFlowSettings(): ForgeFlowSettings {
  const config = vscode.workspace.getConfiguration('forgeflow');
  return {
    projectScanRoots: config.get<string[]>('projects.scanRoots', []),
    projectScanMaxDepth: config.get<number>('projects.scanMaxDepth', 4),
    projectSortMode: config.get<ProjectSortMode>('projects.sortMode', 'recentOpened'),
    powershellProfiles: config.get<PowerShellProfile[]>('powershell.profiles', []),
    defaultProfileId: config.get<string>('powershell.defaultProfileId'),
    runDefaultTarget: config.get<RunTarget>('run.defaultTarget', 'integrated'),
    runIntegratedReuseTerminal: config.get<boolean>('run.integrated.reuseTerminal', true),
    runIntegratedPerProjectTerminal: config.get<boolean>('run.integrated.perProjectTerminal', true),
    dashboardHideArchived: config.get<boolean>('dashboard.hideArchived', false)
  };
}
