# ForgeFlow Architecture

## Goals
ForgeFlow replaces the Explorer and project manager UI while laying the groundwork for future PowerForge engine integration. The extension is modular, strictly typed, and built for long-term maintenance.

## Key Modules
- `src/extension.ts`
  - Wiring for views, commands, state, and services.
- `src/views/filesView.ts`
  - Explorer-like tree with Favorites and Workspace.
- `src/views/projectsView.ts`
  - Project discovery, pinned items, entry points, and browse.
- `src/run/`
  - PowerShell profile resolution, safe command building, and execution.
- `src/dashboard/`
  - Dashboard data aggregation and webview rendering.
- `src/store/`
  - Global state storage for favorites, projects, and identities.
- `src/powerforge/contracts.ts`
  - Typed stubs for the future engine.

## Data Flow
1. **ProjectsView** scans roots via `ProjectScanner`.
2. **ProjectsStore** persists project metadata and user-defined favorites.
3. **FilesView** renders favorites and workspace filesystem passthrough.
4. **RunService** resolves profiles and executes scripts safely.
5. **DashboardService** aggregates GitHub/PowerShell Gallery/NuGet + local git data.

## PowerForge Integration
ForgeFlow integrates with the PowerForge CLI for pipeline and dotnet publish workflows, and exposes a GUI to edit the JSON specs. The engine contract below remains the long-term plan for richer PowerForge APIs.

### EngineClient JSON Contract (Expected)
The engine will support commands that return JSON payloads.

**List Profiles**
```json
{
  "profiles": [
    {
      "id": "pwsh",
      "label": "PowerShell 7+",
      "executablePath": "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      "version": "7.4.0",
      "isPreview": false
    }
  ]
}
```

**Module Inventory**
```json
{
  "generatedAt": "2024-01-01T12:00:00Z",
  "items": [
    {
      "name": "Pester",
      "version": "5.5.0",
      "repository": "PSGallery",
      "installedScope": "currentUser",
      "powerShellEdition": "core"
    }
  ]
}
```

**Update All / Cleanup**
```json
{
  "success": true,
  "message": "Modules updated"
}
```

ForgeFlow does **not** implement these commands yet. It only exposes the command stubs and types for future wiring.
