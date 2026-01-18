# ForgeFlow - Unified Explorer, Projects, and Git Workflow for VS Code

ForgeFlow is a VS Code extension that replaces the built-in Explorer and project manager with a unified workflow, adds PowerShell execution profiles, and provides a dashboard panel for project health and activity. It is designed to be the VS Code front-end for a future C# engine named **PowerForge**.

🧭 Quick Links

- [Configuration](docs/configuration.md)
- [Architecture](docs/architecture.md)
- [Onboarding](docs/onboarding.md)
- [Development](docs/development.md)
- [Changelog](CHANGELOG.md)

🛠️ Build Status

[![CI](https://github.com/EvotecIT/ForgeFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/EvotecIT/ForgeFlow/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/EvotecIT/ForgeFlow/branch/master/graph/badge.svg)](https://codecov.io/gh/EvotecIT/ForgeFlow)

📦 Project Information

[![top language](https://img.shields.io/github/languages/top/EvotecIT/ForgeFlow.svg)](https://github.com/EvotecIT/ForgeFlow)
[![license](https://img.shields.io/github/license/EvotecIT/ForgeFlow.svg)](https://github.com/EvotecIT/ForgeFlow)

Coverage reports are generated in CI as artifacts and can be uploaded to Codecov.

## What it's all about

ForgeFlow keeps project discovery, git hygiene, PowerShell automation, and a lightweight dashboard in one place so you can work from a single view instead of bouncing between multiple panels.

## Features

- [x] **ForgeFlow: Files** — Explorer replacement with Favorites and Workspace
- [x] **ForgeFlow: Projects** — discovery, pinned items, entry points, tags, browse
- [x] **PowerShell profiles** — integrated, external, and elevated (Windows)
- [x] **Run by file (opt-in)** — .cs via csproj/sln and .cs script runs (dotnet 10+)
- [x] **Run history + presets** — run last/history, recent runs per project, and pinned presets
- [x] **Tasks integration** — tasks.json surfaced as entry points
- [x] **ForgeFlow: Dashboard** — repo-level snapshot of activity + package metadata
- [x] **Health scoring** — README/license/CI/tests/dependency freshness indicators
- [x] **ForgeFlow: Git** — branch hygiene (gone/merged/no-upstream/stale) for a selected repo
- [x] **Live filters + presets** — min chars, fuzzy/substring, saved presets, workspace/global scope
- [x] **Shared state** — projects, tags, favorites, and caches shared across windows
- [x] **Layout toggle** — compact sidebar vs expanded panel
- [x] **PowerForge-ready** — typed interfaces and disabled commands, no engine logic yet
- [x] **No telemetry**

## Quick Start

1. `npm install`
2. `npm run compile`
3. Press `F5` to launch the Extension Development Host

## Commands

- ForgeFlow: Run
- ForgeFlow: Run Last / Run History / Save Run Preset
- ForgeFlow: Reset External PowerShell Session
- ForgeFlow: Export Diagnostics (JSON)
- ForgeFlow: Run (Choose Profile)
- ForgeFlow: Run Integrated / External / Run as Admin (External)
- ForgeFlow: Run Recent Entry / Save Recent Entry as Preset / Remove Recent Entry
- ForgeFlow: Clear Recent Runs for Project
- ForgeFlow: Run Recent for Project
- ForgeFlow: Run Recent (Pick Project)
- ForgeFlow: Save Recent Run as Preset (Project)
- ForgeFlow: Save Multiple Recent Runs as Presets (Project)
- ForgeFlow: Open in Browser / Open in Browser (Choose)
- ForgeFlow: Open in Default App
- ForgeFlow: Open in Visual Studio (Windows, .sln)
- ForgeFlow: Open in Terminal / Run Project / Git Clean Project
- ForgeFlow: Run Project Preset / Delete Project Preset
- ForgeFlow: Open to the Side / Rename / Delete / New File / New Folder
- ForgeFlow: Open Dashboard / Refresh Dashboard
- ForgeFlow: Configure Dashboard Tokens
- ForgeFlow: Save/Apply/Delete Filter Presets (Files/Projects/Git/Dashboard)
- ForgeFlow: Toggle Filter Scope (Workspace/Global)
- ForgeFlow: Set Favorites View Mode
- ForgeFlow: Git: Refresh / Select Project / Prune Remotes / Delete Merged or Gone Branches
- ForgeFlow: Configure Project Identity
- ForgeFlow: Configure Project Scan Roots
- ForgeFlow: Switch Project (current/new/add to workspace)
- ForgeFlow: Open in New Window / Add to Workspace
- ForgeFlow: Set Project Run Target / Working Directory
- ForgeFlow: Set Project Tags / Clear Project Tags / Rename Project Tag
- ForgeFlow: Set Project Sort Mode
- ForgeFlow: Set Project Sort Direction
- ForgeFlow: Git: Set Branch Sort Mode / Direction / Filter
- ForgeFlow: Git: Prune Remotes (All Projects)
- ForgeFlow: Git: Delete Merged/Gone Branches (All Projects)
- ForgeFlow: Git: Configure Project Overrides / Clean Project
- ForgeFlow: Git: Preview Clean Project
- ForgeFlow: Toggle Layout (Compact / Expanded)

## Configuration

See `docs/configuration.md` for all settings.

## Dashboard Tokens

ForgeFlow uses VS Code's GitHub authentication when available. For GitLab and Azure DevOps (and as a GitHub fallback), configure tokens via:

- **ForgeFlow: Configure Dashboard Tokens**

## Identity Scan Options

- `forgeflow.projects.identityScanDepth` controls how deep we look for psd1/csproj/Directory.Build.props.
- `forgeflow.projects.identityPreferredFolders` sets preferred folder names for ranking.

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
- `Ctrl+Shift+Alt+F` / `Cmd+Shift+Alt+F` → Focus ForgeFlow filter for the current view

## Notes

- Windows-only elevation is supported via external PowerShell. On non-Windows platforms, elevation is disabled.
- PowerForge integration is **not implemented**. See `docs/architecture.md` for the contract stub.

## License

MIT
