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

## Views at a glance

| View | What it is | Best for |
| --- | --- | --- |
| **ForgeFlow: Files** | Explorer replacement with Favorites + Workspace | File operations, favorites, quick actions |
| **ForgeFlow: Projects** | Project discovery and workflows | Open/switch projects, tags, entry points, presets |
| **ForgeFlow: Git** | Git hygiene for a selected repo | Prune/clean branches, stale/gone/merged views |
| **ForgeFlow: Dashboard** | Repo health + activity panel | Status, README/license/CI/tests, dependency freshness |

Layout modes:
- **Compact**: all views in the left sidebar.
- **Expanded**: Files/Projects/Git move to the panel for a wide layout.

## Capabilities by area

**Files & Workspace**
- Favorites (global + workspace pinned)
- Multi-select copy/cut/paste/rename/delete
- Open in terminal, open in browser, open in Visual Studio (Windows)

**Projects**
- Auto discovery by scan roots (or workspace folders)
- Entry points (scripts, tasks.json, pinned commands)
- Tags, favorites, and quick switching

**Run & PowerShell**
- Integrated, external, and elevated PowerShell (Windows)
- Profiles with defaults + per-project overrides
- Run history and run presets
- Run-by-file (opt-in) for .cs via csproj/sln and .cs scripts (dotnet 10+)

**Git hygiene**
- Branch groups: gone / merged / stale / no-upstream / ahead-behind
- One-click prune/clean for selected repo or all repos

**Dashboard**
- Repo health scoring (README/license/CI/tests/dependency freshness)
- Activity snapshot with package metadata

**Editor tools**
- **Toggle Quotes** (`Ctrl+'`) with per-language chars
- **Unicode substitutions** lint + format with quick-fix actions

**Quality of life**
- Live filters with presets (workspace/global scope)
- Shared state across windows
- No telemetry

## First-run setup

1) Open a folder **or** configure scan roots: **ForgeFlow: Configure Project Scan Roots**  
2) (Optional) Add PowerShell profiles: **ForgeFlow: Run (Choose Profile)** → save as default  
3) (Optional) Configure dashboard tokens: **ForgeFlow: Configure Dashboard Tokens**

## Quick Start

1. `npm install`
2. `npm run compile`
3. Press `F5` to launch the Extension Development Host

## Commands

Open the Command Palette and type **ForgeFlow**. Key groups:

**Files**
- Open / Open to the Side / Rename / Delete / New File / New Folder
- Copy Path / Copy Relative Path / Copy / Cut / Paste
- Pin to Favorites / Pin to Workspace / Favorites View Mode

**Projects**
- Configure Scan Roots / Refresh / Switch Project / Open in New Window
- Set Tags / Rename Tag / Entry Points / Run Project / Run Preset

**Run & PowerShell**
- Run / Run (Choose Profile) / Run Integrated / Run External / Run as Admin
- Run History / Save Preset / Clear History / Reset External Session
- Set Default PowerShell Profile

**Git**
- Select Project / Refresh / Prune Remotes / Delete Merged or Gone Branches
- Configure Project Overrides / Preview Clean Project / Clean Project

**Dashboard**
- Open / Refresh / Configure Tokens

**Browser**
- Open in Browser / Open in Browser (Choose) / Set Preferred Browser

**Layout & filters**
- Toggle Layout (Compact / Expanded)
- Focus/Clear filter + Save/Apply/Delete filter presets (Files/Projects/Git/Dashboard)

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
- `Ctrl+'` / `Cmd+'` → Toggle Quotes (ForgeFlow)

## Notes

- Windows-only elevation is supported via external PowerShell. On non-Windows platforms, elevation is disabled.
- PowerForge integration is **not implemented**. See `docs/architecture.md` for the contract stub.

## License

MIT
