## ForgeFlow TODO

### High value, low risk

### PowerShell reliability

### UX / productivity

### Stability / diagnostics

### Tests

### Done
- Added a global "Clear Run History" confirmation prompt.
- Added multi-select "Save recent runs as presets" for project recent runs.
- Added a "Run recent for project" quick-pick from Projects root.
- Show project run defaults in tooltip (target + cwd + profile).
- Added a toggle to send external session output to a dedicated output channel.
- Added "Run as Admin (choose profile)" quick-pick.
- Added a "Reset External Session" command (per profile and all).
- Detect stale external sessions and auto-recreate when reuse is enabled.
- Added an option to always recreate external session on error.
- Added a search focus command for each view.
- Added Recent Runs sorting (time/type/label).
- Improve error reporting with context (project/run/path).
- Add a local diagnostics export (JSON).
- Added RunHistoryStore tests (sorting/dedup/limits).
- Added view node tests for Recent Runs and Run Presets.
- Added tests for run history preset conversion.
- Add explicit status messages when external session reuse falls back to spawning.
- Inline filter info/actions in view header (Files/Projects/Git). Dashboard already inline.
