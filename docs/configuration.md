# ForgeFlow Configuration

All settings live under the `forgeflow` namespace.

## Projects
- `forgeflow.projects.scanRoots` (string[])
  - Roots to scan for projects.
  - Use **ForgeFlow: Configure Project Scan Roots** to pick folders via UI.
- `forgeflow.projects.scanMaxDepth` (number)
  - Maximum folder depth when scanning.
- `forgeflow.projects.scanIgnoreFolders` (string[])
  - Folder names to skip while scanning roots (case-insensitive).
  - Default: empty list (scan all folders).
  - Hidden worktree folders like `.worktrees` are scanned automatically.
- `forgeflow.projects.sortMode` ("recentOpened" | "recentModified" | "alphabetical" | "lastActive" | "gitCommit")
  - Sort behavior for non-favorite projects.
  - Use **ForgeFlow: Set Project Sort Mode** to change via UI.
- `forgeflow.projects.sortDirection` ("desc" | "asc")
  - Sort direction for project lists.
  - Use **ForgeFlow: Set Project Sort Direction** to change via UI.
- `forgeflow.projects.identityScanDepth` (number)
  - Maximum folder depth to search for psd1/csproj/Directory.Build.props during identity detection.
- `forgeflow.projects.identityPreferredFolders` (string[])
  - Preferred folder names used to rank identity files (default: module, modules, src, source, sources).
- `forgeflow.projects.modifiedScanDepth` (number)
  - Depth used when scanning for recent file modifications (default: 2).
- `forgeflow.projects.entryPointScanDepth` (number)
  - Depth used when locating additional entry points (default: 2).
- `forgeflow.projects.entryPointPreferredFolders` (string[])
  - Preferred folder names when searching for entry points (default: build, scripts, tools, module, src, sources).
- `forgeflow.projects.entryPointFileNames` (string[])
  - File names that should always be treated as entry points (default: build.ps1, publish.ps1, azure-pipelines.yml, etc.).
- `forgeflow.projects.entryPointMaxCount` (number)
  - Maximum number of auto-discovered entry points per project (default: 8).
- `forgeflow.projects.entryPointCacheMinutes` (number)
  - Minutes to cache entry point scan results (default: 5, 0 = no cache).
- `forgeflow.projects.gitCommitCacheMinutes` (number)
  - Minutes to cache git commit timestamps before re-checking (default: 30).
- `forgeflow.projects.pageSize` (number)
  - Maximum number of projects to show before paging (default: 200, 0 = show all).
- `forgeflow.projects.gitWatch` ("off" | "workspace" | "favorites" | "all")
  - Watch `.git/HEAD` and `.git/logs/HEAD` for changes to keep commit sorting fresh.
- `forgeflow.projects.gitWatchMaxRepos` (number)
  - Maximum number of git repos to watch (default: 150).
- `forgeflow.projects.gitWatchDebounceMs` (number)
  - Debounce time in ms for watch refresh events (default: 1000).
- `forgeflow.projects.gitResolveMode` ("closest" | "outermost")
  - Controls which `.git` is used when multiple exist in the ancestor chain.
  - Use `outermost` to prefer the top-level repo.

## PowerShell
- `forgeflow.powershell.profiles` (array)
  - Custom profiles. Built-in profiles are always available.
  - Use **ForgeFlow: Add PowerShell Profile** or **ForgeFlow: Manage PowerShell Profiles** to auto-fill.
- `forgeflow.powershell.defaultProfileId` (string)
  - Default profile when no override is set.

## Run
- `forgeflow.run.defaultTarget` ("integrated" | "external" | "externalAdmin")
- `forgeflow.run.integrated.reuseTerminal` (boolean)
- `forgeflow.run.integrated.reuseScope` ("profile" | "shared")
- `forgeflow.run.integrated.perProjectTerminal` (boolean)
- `forgeflow.run.external.keepOpen` (boolean)
  - Keep the external PowerShell window open after the script finishes.
- `forgeflow.run.external.logOutput` (boolean)
  - Send external PowerShell session output to a dedicated output channel.
- `forgeflow.run.external.reuseSession` (boolean)
  - Reuse a single external PowerShell session per profile (best effort).
- `forgeflow.run.external.alwaysRestart` (boolean)
  - Always restart the external session before running when reuse is enabled.
- `forgeflow.run.externalAdmin.keepOpen` (boolean)
  - Keep the elevated PowerShell window open after the script finishes.
- `forgeflow.run.history.maxItems` (number)
  - Maximum number of run history entries to keep.
- `forgeflow.run.history.perProjectMaxItems` (number)
  - Maximum number of recent runs shown per project.
- `forgeflow.run.history.perProjectSortMode` ("time" | "label" | "type")
  - Sorting for recent runs shown per project.
- `forgeflow.run.showProfileToast` (boolean)
  - Show which PowerShell profile was used (status bar).

## PowerForge
- `forgeflow.powerforge.cliPath` (string)
  - Path to the PowerForge CLI executable (`powerforge`/`powerforge.exe`). When empty, ForgeFlow tries the repo CLI project or PATH.

## Files
- `forgeflow.files.favorites.viewMode` ("workspace" | "all" | "pinned")
  - Controls which favorites are shown in the Files view.

### Run by file (opt-in)
- `forgeflow.run.byFile.enabled` (boolean)
  - Enable running non-PowerShell files based on file type.
- `forgeflow.run.byFile.csProjectCommand` (string)
  - Command template used for running .cs files via a project. Tokens: `{file}`, `{project}`, `{projectDir}` (tokens are auto-quoted).
- `forgeflow.run.byFile.csSolutionCommand` (string)
  - Command template used for running .cs files via a solution (.sln). Tokens: `{file}`, `{project}`, `{projectDir}` (tokens are auto-quoted).
- `forgeflow.run.byFile.csScriptEnabled` (boolean)
  - Allow running .cs files as scripts (dotnet 10+).
- `forgeflow.run.byFile.csScriptCommand` (string)
  - Command template for .cs script runs. Tokens: `{file}`, `{project}`, `{projectDir}` (tokens are auto-quoted).
- `forgeflow.run.byFile.reuseTerminal` (boolean)
  - Reuse the terminal for run-by-file commands.

## Filters
- `forgeflow.filters.scope` ("workspace" | "global")
  - Controls whether filter values are stored per-workspace or shared globally.
- `forgeflow.filters.projects.minChars` (number)
  - Minimum characters before project filtering activates.
- `forgeflow.filters.files.minChars` (number)
  - Minimum characters before files filtering activates.
- `forgeflow.filters.git.minChars` (number)
  - Minimum characters before git filtering activates.
- `forgeflow.filters.dashboard.minChars` (number)
  - Minimum characters before dashboard filtering activates.
- `forgeflow.filters.files.maxDepth` (number)
  - Maximum depth to scan for file filter matches (0 = current folder only).
- `forgeflow.filters.matchMode` ("substring" | "fuzzy")
  - Match mode used by filters.
  - Filters support `+include` and `-exclude` tokens plus quoted phrases (e.g., `"api gateway" -legacy`).

## Editor tools
- `forgeflow.toggleQuotes.chars` (array, language-overridable)
  - Quote characters to cycle through. Supports strings (`"`, `'`, `` ` ``), pairs (`["<", ">"]`), or objects (`{ "begin": "<", "end": ">" }`).
- `forgeflow.unicodeSubstitutions.rules` (array)
  - Linting rules for correcting invalid unicode. Each rule needs `invalid`, `valid`, `message` (strings).
- `forgeflow.unicodeSubstitutions.enableDefaultRules` (boolean | object)
  - Enable/disable default rules globally or per-language.
- `forgeflow.unicodeSubstitutions.enableFormatting` (boolean | object)
  - Enable/disable formatting fixes globally or per-language.
- `forgeflow.unicodeSubstitutions.enabledLanguageIds` (string[])
  - Language IDs to lint (default: `["*"]`).

## Browser
- `forgeflow.browser.preferred` ("default" | "edge" | "chrome" | "chromium" | "firefox" | "firefox-dev" | "custom")
  - Preferred browser for **ForgeFlow: Open in Browser**.
- `forgeflow.browser.fileExtensions` (string[])
  - File extensions that trigger the `Alt+B` shortcut.
- `forgeflow.browser.customPath` (string)
  - Full path to a custom browser executable when preferred is set to `custom`.

## Dashboard
- `forgeflow.dashboard.hideArchived` (boolean)
  - Hide archived repositories from the dashboard.
- `forgeflow.dashboard.health.enabled` (boolean)
  - Enable local health scoring (README, license, CI, tests, dependency freshness).
- `forgeflow.dashboard.health.depStaleDays` (number)
  - Days before dependency lock/props files are considered stale.
- GitHub releases are used for `released` when no package release is available.

### Dashboard Tokens
Token values are stored in VS Code SecretStorage. Configure them via **ForgeFlow: Configure Dashboard Tokens**.
- GitHub Personal Access Token (optional fallback when VS Code auth is unavailable)
- GitLab Personal Access Token
- Azure DevOps Personal Access Token

## Git Hygiene
- `forgeflow.git.staleDays` (number)
  - Age in days before a branch is considered stale (default: 30).
- `forgeflow.git.defaultBranch` (string)
  - Default branch used for merge checks when origin/HEAD is unavailable.
- `forgeflow.git.showCleanBranches` (boolean)
  - Show clean branches in the git hygiene view.
- `forgeflow.git.branchSortMode` ("name" | "lastCommit" | "age" | "status")
  - Sort order for branches (default: age).
- `forgeflow.git.branchSortDirection` ("asc" | "desc")
  - Sort direction for branch lists.
- `forgeflow.git.branchFilter` ("all" | "actionable" | "gone" | "merged" | "stale" | "noUpstream" | "aheadBehind")
  - Filter branch groups shown in the Git view.
- `forgeflow.git.showProjectSummary` (boolean)
  - Show git hygiene summary badges in the Projects view (default: true).

### Git Per-Project Overrides
Use **ForgeFlow: Git: Configure Project Overrides** to set per-project overrides for:
- Stale days
- Default branch name

Overrides are stored in workspace state (per workspace).

### Git Clean Preview
Use **ForgeFlow: Git: Preview Clean Project** to see which branches would be removed before cleaning.

## Notes
Favorites and pinned items are stored in global state. Workspace-level overrides can be added later via workspace state if needed.
Filters are stored per workspace by default. Set `forgeflow.filters.scope` to `global` (or use **ForgeFlow: Toggle Filter Scope**) to share filters across windows.
Run targets and preferred working directories are stored in workspace state per project. Use **ForgeFlow: Set Project Run Target** and **ForgeFlow: Set Project Run Working Directory** to configure them.
