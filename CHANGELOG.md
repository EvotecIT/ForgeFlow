# Changelog

## 0.1.3
- Fixed repository-container scans so every direct child repository is discovered.
- Refreshed Git status after project-list updates to avoid stale branch data under a fallback project.
- Started initial project discovery before Git and Dashboard project pickers read the project store.

## 0.1.2
- Fixed project discovery when a git-backed scan root contains many child repositories.
- Reduced activation and initial scan work so ForgeFlow loads on demand and coalesces startup scans.
- Preserved layout view placement without requiring startup activation.

## 0.1.1
- Published the first public Marketplace release.

## 0.1.0
- Initial ForgeFlow foundation.
- Files and Projects views.
- PowerShell run profiles.
- Dashboard panel with project identity configuration.
- PowerForge integration stubs.
- Marketplace publisher configured for `EvotecServices`.
- Manual GitHub Actions workflow for packaging and pre-release Marketplace publishing.
- Store metadata, screenshots, support information, and package validation cleanup.
