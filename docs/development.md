# Development

## Requirements
- Node.js 20+
- VS Code 1.107.0+

## Install
```bash
npm install
```

## Build
```bash
npm run compile
```

## Typecheck
```bash
npm run typecheck
```

## Test
```bash
npm test
```

## Coverage
```bash
npm run test:coverage
```

## Run in VS Code
- Press `F5` to launch the Extension Development Host.

## Package
```bash
npm run package
```

The generated VSIX is written to `dist/forgeflow-<version>.vsix`.

## Publishing (Marketplace)

### Prerequisites
- VS Code Marketplace publisher created with publisher id `EvotecServices`.
- Marketplace PAT stored as the GitHub organization or repository secret `VSCE_PAT`.
- The PAT needs the Azure DevOps Marketplace `Manage` scope.
- `package.json` must keep `"publisher": "EvotecServices"` so the extension lands under the correct publisher.

### Package locally
```powershell
# Build, lint, typecheck, test, and package
./publish.ps1

# Skip the slower parts when the workspace is already validated
./publish.ps1 -SkipNpmCi -SkipTests
```

### Publish locally
```powershell
$env:VSCE_PAT = '<marketplace-pat>'
./publish.ps1 -Publish -PreRelease
```

Equivalent npm scripts:
```bash
npm run publish:local
npm run publish:marketplace:pre
```

### Publish from GitHub Actions
Use the **Publish VS Code Extension** workflow.

1. Run it from `master`.
2. Keep `pre_release` checked for early Marketplace builds.
3. Check `publish_marketplace` only when the VSIX should be pushed to Marketplace.

The workflow always uploads the packaged VSIX as an artifact. Marketplace publishing is branch-guarded to `master`.

### Verified Publisher
Marketplace verification is handled by Microsoft. Use the Marketplace publisher settings to:
- Set display name to "Evotec Services".
- Verify your domain and request a verified publisher badge.

## Dev install (Insiders)
See README for the dev link install steps. For WSL → Windows Insiders one-shot install:
```bash
npm run install:insiders
```

Windows PowerShell:
```powershell
npm run install:insiders:ps
```
