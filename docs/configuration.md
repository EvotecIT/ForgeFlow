# ForgeFlow Configuration

All settings live under the `forgeflow` namespace.

## Projects
- `forgeflow.projects.scanRoots` (string[])
  - Roots to scan for projects.
- `forgeflow.projects.scanMaxDepth` (number)
  - Maximum folder depth when scanning.
- `forgeflow.projects.sortMode` ("recentOpened" | "recentModified" | "alphabetical")
  - Sort behavior for non-favorite projects.

## PowerShell
- `forgeflow.powershell.profiles` (array)
  - Custom profiles. Built-in profiles are always available.
- `forgeflow.powershell.defaultProfileId` (string)
  - Default profile when no override is set.

## Run
- `forgeflow.run.defaultTarget` ("integrated" | "external" | "externalAdmin")
- `forgeflow.run.integrated.reuseTerminal` (boolean)
- `forgeflow.run.integrated.perProjectTerminal` (boolean)

## Notes
Favorites and pinned items are stored in global state. Workspace-level overrides can be added later via workspace state if needed.
