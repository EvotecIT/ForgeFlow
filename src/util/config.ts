import * as vscode from 'vscode';
import type { PowerShellProfile, RunTarget } from '../models/run';

export type ProjectSortMode = 'recentOpened' | 'recentModified' | 'alphabetical' | 'lastActive' | 'gitCommit';
export type SortDirection = 'asc' | 'desc';

export interface ForgeFlowSettings {
  projectScanRoots: string[];
  projectScanMaxDepth: number;
  projectScanCacheMinutes: number;
  projectSortMode: ProjectSortMode;
  projectSortDirection: SortDirection;
  projectDuplicateGroupMainFirst: boolean;
  projectShowWorktreesGroup: boolean;
  projectWorktreesGroupMode: 'grouped' | 'flat';
  worktreesOpenAction: 'expand' | 'addToWorkspace' | 'open' | 'openInNewWindow';
  identityScanDepth: number;
  identityPreferredFolders: string[];
  projectModifiedScanDepth: number;
  projectModifiedIgnoreFolders: string[];
  projectModifiedIgnoreFileExtensions: string[];
  projectGitCommitCacheMinutes: number;
  projectPageSize: number;
  projectGitWatchMode: 'off' | 'workspace' | 'favorites' | 'all';
  projectGitWatchMaxRepos: number;
  projectGitWatchDebounceMs: number;
  projectGitResolveMode: 'closest' | 'outermost';
  projectEntryPointScanDepth: number;
  projectEntryPointPreferredFolders: string[];
  projectEntryPointFileNames: string[];
  projectEntryPointMaxCount: number;
  projectEntryPointCacheMinutes: number;
  powershellProfiles: PowerShellProfile[];
  defaultProfileId?: string;
  filesFavoritesViewMode: 'workspace' | 'all' | 'pinned';
  filesOpenOnSelection: boolean;
  filesWatchMode: 'off' | 'roots' | 'all';
  runDefaultTarget: RunTarget;
  runIntegratedReuseTerminal: boolean;
  runIntegratedReuseScope: 'profile' | 'shared';
  runIntegratedPerProjectTerminal: boolean;
  runExternalKeepOpen: boolean;
  runExternalLogOutput: boolean;
  runExternalReuseSession: boolean;
  runExternalAlwaysRestart: boolean;
  runExternalAdminKeepOpen: boolean;
  runByFileEnabled: boolean;
  runByFileCsScriptEnabled: boolean;
  runByFileCsScriptCommand: string;
  runByFileCsProjectCommand: string;
  runByFileCsSolutionCommand: string;
  runByFileReuseTerminal: boolean;
  runHistoryMaxItems: number;
  runHistoryPerProjectMaxItems: number;
  runHistoryPerProjectSortMode: 'time' | 'label' | 'type';
  runHistoryClickAction: 'run' | 'confirm';
  runShowProfileToast: boolean;
  filtersScope: 'workspace' | 'global';
  filtersProjectsMinChars: number;
  filtersFilesMinChars: number;
  filtersGitMinChars: number;
  filtersDashboardMinChars: number;
  filtersFilesMaxDepth: number;
  filtersMatchMode: 'substring' | 'fuzzy';
  browserPreferred: 'default' | 'edge' | 'chrome' | 'chromium' | 'firefox' | 'firefox-dev' | 'custom';
  browserFileExtensions: string[];
  browserCustomPath?: string;
  powerforgeCliPath?: string;
  dashboardHideArchived: boolean;
  dashboardAutoRefreshMinutes: number;
  dashboardAutoRefreshOnOpen: boolean;
  dashboardHealthEnabled: boolean;
  dashboardHealthDepStaleDays: number;
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
    projectScanCacheMinutes: config.get<number>('projects.scanCacheMinutes', 2),
    projectSortMode: config.get<ProjectSortMode>('projects.sortMode', 'recentOpened'),
    projectSortDirection: config.get<SortDirection>('projects.sortDirection', 'desc'),
    projectDuplicateGroupMainFirst: config.get<boolean>('projects.duplicateGroupMainFirst', true),
    projectShowWorktreesGroup: config.get<boolean>('projects.showWorktreesGroup', true),
    projectWorktreesGroupMode: config.get<'grouped' | 'flat'>('projects.worktreesGroupMode', 'grouped'),
    worktreesOpenAction: config.get<'expand' | 'addToWorkspace' | 'open' | 'openInNewWindow'>(
      'worktrees.openAction',
      'expand'
    ),
    identityScanDepth: config.get<number>('projects.identityScanDepth', 4),
    identityPreferredFolders: config.get<string[]>('projects.identityPreferredFolders', [
      'module',
      'modules',
      'src',
      'source',
      'sources'
    ]),
    projectModifiedScanDepth: config.get<number>('projects.modifiedScanDepth', 2),
    projectModifiedIgnoreFolders: config.get<string[]>('projects.modifiedIgnoreFolders', [
      '.git',
      '.github',
      '.vscode',
      'node_modules',
      'bin',
      'obj',
      'dist',
      'out',
      'artifacts',
      'artefacts',
      'packages',
      'coverage',
      'testresults',
      'logs'
    ]),
    projectModifiedIgnoreFileExtensions: config.get<string[]>('projects.modifiedIgnoreFileExtensions', [
      'log',
      'tmp',
      'cache',
      'bak'
    ]),
    projectGitCommitCacheMinutes: config.get<number>('projects.gitCommitCacheMinutes', 30),
    projectPageSize: config.get<number>('projects.pageSize', 200),
    projectGitWatchMode: config.get<'off' | 'workspace' | 'favorites' | 'all'>('projects.gitWatch', 'off'),
    projectGitWatchMaxRepos: config.get<number>('projects.gitWatchMaxRepos', 150),
    projectGitWatchDebounceMs: config.get<number>('projects.gitWatchDebounceMs', 1000),
    projectGitResolveMode: config.get<'closest' | 'outermost'>('projects.gitResolveMode', 'closest'),
    projectEntryPointScanDepth: config.get<number>('projects.entryPointScanDepth', 2),
    projectEntryPointPreferredFolders: config.get<string[]>('projects.entryPointPreferredFolders', [
      'build',
      'builds',
      'scripts',
      'script',
      'tools',
      'tool',
      'module',
      'modules',
      'src',
      'source',
      'sources'
    ]),
    projectEntryPointFileNames: config.get<string[]>('projects.entryPointFileNames', [
      'build.ps1',
      'build.cmd',
      'build.bat',
      'build.sh',
      'build.cake',
      'build.proj',
      'publish.ps1',
      'test.ps1',
      'ci.ps1',
      'deploy.ps1',
      'azure-pipelines.yml',
      'azure-pipelines.yaml'
    ]),
    projectEntryPointMaxCount: config.get<number>('projects.entryPointMaxCount', 8),
    projectEntryPointCacheMinutes: config.get<number>('projects.entryPointCacheMinutes', 5),
    powershellProfiles: config.get<PowerShellProfile[]>('powershell.profiles', []),
    defaultProfileId: config.get<string>('powershell.defaultProfileId'),
    filesFavoritesViewMode: config.get<'workspace' | 'all' | 'pinned'>('files.favorites.viewMode', 'workspace'),
    filesOpenOnSelection: config.get<boolean>('files.openOnSelection', true),
    filesWatchMode: config.get<'off' | 'roots' | 'all'>('files.watchMode', 'all'),
    runDefaultTarget: config.get<RunTarget>('run.defaultTarget', 'integrated'),
    runIntegratedReuseTerminal: config.get<boolean>('run.integrated.reuseTerminal', true),
    runIntegratedReuseScope: config.get<'profile' | 'shared'>('run.integrated.reuseScope', 'profile'),
    runIntegratedPerProjectTerminal: config.get<boolean>('run.integrated.perProjectTerminal', true),
    runExternalKeepOpen: config.get<boolean>('run.external.keepOpen', true),
    runExternalLogOutput: config.get<boolean>('run.external.logOutput', false),
    runExternalReuseSession: config.get<boolean>('run.external.reuseSession', false),
    runExternalAlwaysRestart: config.get<boolean>('run.external.alwaysRestart', false),
    runExternalAdminKeepOpen: config.get<boolean>('run.externalAdmin.keepOpen', true),
    runByFileEnabled: config.get<boolean>('run.byFile.enabled', false),
    runByFileCsScriptEnabled: config.get<boolean>('run.byFile.csScriptEnabled', false),
    runByFileCsScriptCommand: config.get<string>('run.byFile.csScriptCommand', 'dotnet run {file}'),
    runByFileCsProjectCommand: config.get<string>('run.byFile.csProjectCommand', 'dotnet run --project {project}'),
    runByFileCsSolutionCommand: config.get<string>('run.byFile.csSolutionCommand', 'dotnet run --project {project}'),
    runByFileReuseTerminal: config.get<boolean>('run.byFile.reuseTerminal', true),
    runHistoryMaxItems: config.get<number>('run.history.maxItems', 50),
    runHistoryPerProjectMaxItems: config.get<number>('run.history.perProjectMaxItems', 6),
    runHistoryPerProjectSortMode: config.get<'time' | 'label' | 'type'>('run.history.perProjectSortMode', 'time'),
    runHistoryClickAction: config.get<'run' | 'confirm'>('run.history.clickAction', 'confirm'),
    runShowProfileToast: config.get<boolean>('run.showProfileToast', true),
    filtersScope: config.get<'workspace' | 'global'>('filters.scope', 'workspace'),
    filtersProjectsMinChars: config.get<number>('filters.projects.minChars', 2),
    filtersFilesMinChars: config.get<number>('filters.files.minChars', 2),
    filtersGitMinChars: config.get<number>('filters.git.minChars', 2),
    filtersDashboardMinChars: config.get<number>('filters.dashboard.minChars', 2),
    filtersFilesMaxDepth: config.get<number>('filters.files.maxDepth', 2),
    filtersMatchMode: config.get<'substring' | 'fuzzy'>('filters.matchMode', 'substring'),
    browserPreferred: config.get<'default' | 'edge' | 'chrome' | 'chromium' | 'firefox' | 'firefox-dev' | 'custom'>('browser.preferred', 'default'),
    browserFileExtensions: config.get<string[]>('browser.fileExtensions', ['html', 'htm', 'md', 'svg']),
    browserCustomPath: config.get<string>('browser.customPath'),
    powerforgeCliPath: config.get<string>('powerforge.cliPath'),
    dashboardHideArchived: config.get<boolean>('dashboard.hideArchived', false),
    dashboardAutoRefreshMinutes: config.get<number>('dashboard.autoRefreshMinutes', 2),
    dashboardAutoRefreshOnOpen: config.get<boolean>('dashboard.autoRefreshOnOpen', true),
    dashboardHealthEnabled: config.get<boolean>('dashboard.health.enabled', true),
    dashboardHealthDepStaleDays: config.get<number>('dashboard.health.depStaleDays', 180),
    gitStaleDays: config.get<number>('git.staleDays', 30),
    gitDefaultBranch: config.get<string>('git.defaultBranch', 'main'),
    gitShowCleanBranches: config.get<boolean>('git.showCleanBranches', false),
    gitBranchSortMode: config.get<GitBranchSortMode>('git.branchSortMode', 'age'),
    gitBranchSortDirection: config.get<SortDirection>('git.branchSortDirection', 'desc'),
    gitBranchFilter: config.get<GitBranchFilterMode>('git.branchFilter', 'actionable'),
    gitShowProjectSummary: config.get<boolean>('git.showProjectSummary', true)
  };
}
