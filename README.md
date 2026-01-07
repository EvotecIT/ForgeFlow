# ForgeFlow

ForgeFlow is a long-term foundation extension that replaces the built-in Explorer and project manager with a unified workflow, adds PowerShell execution profiles, and provides a dashboard panel for project health and activity. It is designed to be the VS Code front-end for a future C# engine named **PowerForge**.

## Highlights
- **ForgeFlow: Files** — Explorer replacement with Favorites and Workspace
- **ForgeFlow: Projects** — project discovery, pinned items, entry points, and browse
- **PowerShell execution profiles** — integrated, external, and elevated (Windows)
- **ForgeFlow: Dashboard** — repo-level snapshot of activity and package metadata
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
- ForgeFlow: Open Dashboard / Refresh Dashboard
- ForgeFlow: Configure Project Identity

## Configuration
See `docs/configuration.md` for all settings.

## Notes
- Windows-only elevation is supported via external PowerShell. On non-Windows platforms, elevation is disabled.
- PowerForge integration is **not implemented**. See `docs/architecture.md` for the contract stub.

## License
MIT
