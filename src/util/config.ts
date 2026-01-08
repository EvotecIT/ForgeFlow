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
  projectModifiedScanDepth: number;
  powershellProfiles: PowerShellProfile[];
  defaultProfileId?: string;
  runDefaultTarget: RunTarget;
  runIntegratedReuseTerminal: boolean;
  runIntegratedPerProjectTerminal: boolean;
  runExternalKeepOpen: boolean;
  runExternalAdminKeepOpen: boolean;
  browserPreferred: 'default' | 'edge' | 'chrome' | 'chromium' | 'firefox' | 'firefox-dev';
  browserFileExtensions: string[];
  dashboardHideArchived: boolean;
  gitStaleDays: number;
  gitDefaultBranch: string;
  gitShowCleanBranches: boolean;
  gitBranchSortMode: GitBranchSortMode;
  gitBranchSortDirection: SortDirection;
  gitBranchFilter: GitBranchFilterMode;
  gitShowProjectSummary: boolean;
}

export type GitBranchSortMode = 'name' | 'lastCommit' | 'age' | 'status';
export type GitBranchFilterMode = 'all' | 'actionable' | 'gone' | 'merged' | 'stale' | 'noUpstream' | 'aheadBehind';

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
    projectModifiedScanDepth: config.get<number>('projects.modifiedScanDepth', 2),
    powershellProfiles: config.get<PowerShellProfile[]>('powershell.profiles', []),
    defaultProfileId: config.get<string>('powershell.defaultProfileId'),
    runDefaultTarget: config.get<RunTarget>('run.defaultTarget', 'integrated'),
    runIntegratedReuseTerminal: config.get<boolean>('run.integrated.reuseTerminal', true),
    runIntegratedPerProjectTerminal: config.get<boolean>('run.integrated.perProjectTerminal', true),
    runExternalKeepOpen: config.get<boolean>('run.external.keepOpen', true),
    runExternalAdminKeepOpen: config.get<boolean>('run.externalAdmin.keepOpen', true),
    browserPreferred: config.get<'default' | 'edge' | 'chrome' | 'chromium' | 'firefox' | 'firefox-dev'>('browser.preferred', 'default'),
    browserFileExtensions: config.get<string[]>('browser.fileExtensions', ['html', 'htm', 'md', 'svg']),
    dashboardHideArchived: config.get<boolean>('dashboard.hideArchived', false),
    gitStaleDays: config.get<number>('git.staleDays', 30),
    gitDefaultBranch: config.get<string>('git.defaultBranch', 'main'),
    gitShowCleanBranches: config.get<boolean>('git.showCleanBranches', false),
    gitBranchSortMode: config.get<GitBranchSortMode>('git.branchSortMode', 'age'),
    gitBranchSortDirection: config.get<SortDirection>('git.branchSortDirection', 'desc'),
    gitBranchFilter: config.get<GitBranchFilterMode>('git.branchFilter', 'actionable'),
    gitShowProjectSummary: config.get<boolean>('git.showProjectSummary', true)
  };
}
