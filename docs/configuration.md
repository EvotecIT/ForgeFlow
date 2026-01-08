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

## Dashboard
- `forgeflow.dashboard.hideArchived` (boolean)
  - Hide archived repositories from the dashboard.

### Dashboard Tokens
Token values are stored in VS Code SecretStorage. Configure them via **ForgeFlow: Configure Dashboard Tokens**.
- GitHub Personal Access Token (optional fallback when VS Code auth is unavailable)
- GitLab Personal Access Token
- Azure DevOps Personal Access Token

## Notes
Favorites and pinned items are stored in global state. Workspace-level overrides can be added later via workspace state if needed.
