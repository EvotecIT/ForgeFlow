# ForgeFlow Configuration

All settings live under the `forgeflow` namespace.

## Projects
- `forgeflow.projects.scanRoots` (string[])
  - Roots to scan for projects.
  - Use **ForgeFlow: Configure Project Scan Roots** to pick folders via UI.
- `forgeflow.projects.scanMaxDepth` (number)
  - Maximum folder depth when scanning.
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
- `forgeflow.projects.gitCommitCacheMinutes` (number)
  - Minutes to cache git commit timestamps before re-checking (default: 30).
- `forgeflow.projects.gitWatch` ("off" | "workspace" | "favorites" | "all")
  - Watch `.git/HEAD` and `.git/logs/HEAD` for changes to keep commit sorting fresh.
- `forgeflow.projects.gitWatchMaxRepos` (number)
  - Maximum number of git repos to watch (default: 150).
- `forgeflow.projects.gitWatchDebounceMs` (number)
  - Debounce time in ms for watch refresh events (default: 1000).

## PowerShell
- `forgeflow.powershell.profiles` (array)
  - Custom profiles. Built-in profiles are always available.
- `forgeflow.powershell.defaultProfileId` (string)
  - Default profile when no override is set.

## Run
- `forgeflow.run.defaultTarget` ("integrated" | "external" | "externalAdmin")
- `forgeflow.run.integrated.reuseTerminal` (boolean)
- `forgeflow.run.integrated.perProjectTerminal` (boolean)
- `forgeflow.run.external.keepOpen` (boolean)
  - Keep the external PowerShell window open after the script finishes.
- `forgeflow.run.externalAdmin.keepOpen` (boolean)
  - Keep the elevated PowerShell window open after the script finishes.

## Browser
- `forgeflow.browser.preferred` ("default" | "edge" | "chrome" | "chromium" | "firefox" | "firefox-dev")
  - Preferred browser for **ForgeFlow: Open in Browser**.
- `forgeflow.browser.fileExtensions` (string[])
  - File extensions that trigger the `Alt+B` shortcut.

## Dashboard
- `forgeflow.dashboard.hideArchived` (boolean)
  - Hide archived repositories from the dashboard.
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
