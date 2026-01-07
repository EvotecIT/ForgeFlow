# ForgeFlow Configuration

All settings live under the `forgeflow` namespace.

## Projects
- `forgeflow.projects.scanRoots` (string[])
  - Roots to scan for projects.
  - Use **ForgeFlow: Configure Project Scan Roots** to pick folders via UI.
- `forgeflow.projects.scanMaxDepth` (number)
  - Maximum folder depth when scanning.
- `forgeflow.projects.sortMode` ("recentOpened" | "recentModified" | "alphabetical")
  - Sort behavior for non-favorite projects.
  - Use **ForgeFlow: Set Project Sort Mode** to change via UI.

## PowerShell
- `forgeflow.powershell.profiles` (array)
  - Custom profiles. Built-in profiles are always available.
- `forgeflow.powershell.defaultProfileId` (string)
  - Default profile when no override is set.

## Run
- `forgeflow.run.defaultTarget` ("integrated" | "external" | "externalAdmin")
- `forgeflow.run.integrated.reuseTerminal` (boolean)
- `forgeflow.run.integrated.perProjectTerminal` (boolean)

## Dashboard
- `forgeflow.dashboard.hideArchived` (boolean)
  - Hide archived repositories from the dashboard.

## Notes
Favorites and pinned items are stored in global state. Workspace-level overrides can be added later via workspace state if needed.
