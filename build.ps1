# ForgeFlow build script
# Organization: Evotec

[CmdletBinding()]
param(
    [string]$Configuration = "Release",
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'

Write-Host "ForgeFlow build - $Configuration" -ForegroundColor Green

# TODO: Add build steps for PowerForge engine integration when available.
# - Restore .NET tooling
# - Build C# engine
# - Emit JSON contract bundle

npm ci
npm run compile
npm run lint
if (-not $SkipTests) {
    npm test
}
