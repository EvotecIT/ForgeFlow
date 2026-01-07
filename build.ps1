# ForgeFlow build template
# Organization: Evotec

param(
    [string]$Configuration = "Release",
    [string]$SigningThumbprint = "<CODE_SIGN_THUMBPRINT>"
)

Write-Host "ForgeFlow build template - $Configuration"
Write-Host "Signing thumbprint placeholder: $SigningThumbprint"

# TODO: Add build steps for PowerForge engine integration when available.
# - Restore .NET tooling
# - Build C# engine
# - Emit JSON contract bundle

# Current extension build
npm ci
npm run compile
npm run lint
npm test
