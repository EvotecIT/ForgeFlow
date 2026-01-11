# ForgeFlow

ForgeFlow is a long-term foundation extension that replaces the built-in Explorer and project manager with a unified workflow, adds PowerShell execution profiles, and provides a dashboard panel for project health and activity. It is designed to be the VS Code front-end for a future C# engine named **PowerForge**.

## Highlights
- **ForgeFlow: Files** — Explorer replacement with Favorites and Workspace
- **ForgeFlow: Projects** — project discovery, pinned items, entry points, and browse
- **PowerShell execution profiles** — integrated, external, and elevated (Windows)
- **ForgeFlow: Dashboard** — repo-level snapshot of activity and package metadata
- **ForgeFlow: Git** — branch hygiene (gone/merged/no-upstream/stale) for a selected repo
- **PowerForge-ready** — typed interfaces and disabled commands, no engine logic yet
- **No telemetry**

## Quick Start
1. `npm install`
2. `npm run compile`
3. Press `F5` to launch the Extension Development Host

## Commands
- ForgeFlow: Run
- ForgeFlow: Run (Choose Profile)
- ForgeFlow: Run Integrated / External / Run as Admin (External)
- ForgeFlow: Open in Browser / Open in Browser (Choose)
- ForgeFlow: Open in Default App
- ForgeFlow: Open in Visual Studio (Windows, .sln)
- ForgeFlow: Open to the Side / Rename / Delete / New File / New Folder
- ForgeFlow: Open Dashboard / Refresh Dashboard
- ForgeFlow: Configure Dashboard Tokens
- ForgeFlow: Git: Refresh / Select Project / Prune Remotes / Delete Merged or Gone Branches
- ForgeFlow: Configure Project Identity
- ForgeFlow: Configure Project Scan Roots
- ForgeFlow: Set Project Sort Mode
- ForgeFlow: Set Project Sort Direction
- ForgeFlow: Git: Set Branch Sort Mode / Direction / Filter
- ForgeFlow: Git: Prune Remotes (All Projects)
- ForgeFlow: Git: Delete Merged/Gone Branches (All Projects)
- ForgeFlow: Git: Configure Project Overrides / Clean Project
- ForgeFlow: Git: Preview Clean Project

## Dashboard Options
- `forgeflow.dashboard.hideArchived` to hide archived repos from the table.

## Dashboard Tokens
ForgeFlow uses VS Code's GitHub authentication when available. For GitLab and Azure DevOps (and as a GitHub fallback), configure tokens via:
- **ForgeFlow: Configure Dashboard Tokens**

## Identity Scan Options
- `forgeflow.projects.identityScanDepth` controls how deep we look for psd1/csproj/Directory.Build.props.
- `forgeflow.projects.identityPreferredFolders` sets preferred folder names for ranking.

## Configuration
See `docs/configuration.md` for all settings.

## Install in VS Code Insiders (live usage)
WSL → Windows Insiders one-liner:
1) `npm run install:insiders`
2) Reload window.

Windows PowerShell one-liner:
1) `npm run install:insiders:ps`
2) Reload window.

Automatic daily install (Windows):
1) `npm run install:insiders:auto`
2) Reload window after the first run.

Defaults: runs on logon and daily at 09:00. To customize:
- Logon only: `powershell -ExecutionPolicy Bypass -File scripts/auto-install-insiders.ps1 -DisableDaily`
- Daily only (custom time): `powershell -ExecutionPolicy Bypass -File scripts/auto-install-insiders.ps1 -DisableLogon -DailyAt 18:30`
- Remove: `npm run install:insiders:auto:remove`

Manual steps (if you prefer):
1) `npm run compile`
2) `npm run package`
3) Install the VSIX into Insiders:
   - Command line: `code-insiders --install-extension forgeflow-0.1.0.vsix --force`
   - Or Extensions view → “…” → **Install from VSIX…**
4) Reload window.

Tip: re-run step 2 + 3 after changes (use `--force` to overwrite).

## Dev link install (no VSIX rebuild)
This creates a symlink/junction from your repo into the VS Code extensions folder so Insiders loads ForgeFlow directly.

Windows (Insiders):
1) `npm run compile`
2) `npm run dev:install:insiders`
3) Reload window

macOS/Linux (Insiders):
1) `npm run compile`
2) `./scripts/dev-install.sh`
3) Reload window

Re-run `npm run compile` after changes, then reload VS Code.

## Shortcuts
- `Alt+B` → Open current file in browser (extensions configurable via `forgeflow.browser.fileExtensions`)
- `Shift+Alt+B` → Choose browser

## Notes
- Windows-only elevation is supported via external PowerShell. On non-Windows platforms, elevation is disabled.
- PowerForge integration is **not implemented**. See `docs/architecture.md` for the contract stub.

## License
MIT
