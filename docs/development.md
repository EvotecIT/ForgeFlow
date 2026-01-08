# Development

## Requirements
- Node.js 20+
- VS Code 1.90+

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

## Run in VS Code
- Press `F5` to launch the Extension Development Host.

## Package
```bash
npm run package
```

## Publishing (Marketplace)

### Prerequisites
- VS Code Marketplace publisher created (publisher id: `evotec`).
- Marketplace PAT exported to `VSCE_TOKEN` (or pass `-MarketplaceToken`).
- Windows code signing certificate installed (USB token supported) and its thumbprint.
- Windows SDK installed (for `signtool.exe`).

### Publish locally (Windows)
```powershell
# Build + test + package
./publish.ps1

# Sign with USB token (PIN prompt)
./publish.ps1 -Sign -SigningThumbprint "92e95fb58effa6a4a75e77a33cdd6bfe6dd30f1a" -TimestampUrl "https://timestamp.digicert.com"

# Publish
./publish.ps1 -Publish -MarketplaceToken $env:VSCE_TOKEN

# Publish using token file (default: C:\Support\Important\VSCode.txt)
./publish.ps1 -Publish
```

### Publish from GitHub Actions (signed VSIX only)
This workflow **will not publish** unless the VSIX signature is valid. Signing remains local (USB token).

1) Sign locally and upload the VSIX to a GitHub Release (e.g., `forgeflow.vsix`).
2) Run the **Publish (Signed VSIX)** workflow with `release_tag` (or `vsix_url`).
3) Ensure `VSCE_TOKEN` is set in repo secrets.

### Verified Publisher
Marketplace verification is handled by Microsoft. Use the Marketplace publisher settings to:
- Set display name to "Evotec Services" (publisher id can remain `evotec`).
- Verify your domain and request a verified publisher badge.

## Dev install (Insiders)
See README for the dev link install steps.
