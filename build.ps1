# ForgeFlow build script
# Organization: Evotec

[CmdletBinding()]
param(
    [string]$Configuration = "Release",
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -Path $scriptRoot

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' not found. Install Node.js (20+) to continue."
    }
}

Require-Command -Name 'node'
Require-Command -Name 'npm'

Write-Host "ForgeFlow build - $Configuration" -ForegroundColor Green

# TODO: Add build steps for PowerForge engine integration when available.
# - Restore .NET tooling
# - Build C# engine
# - Emit JSON contract bundle

try {
    npm ci
} catch {
    Write-Warning "npm ci failed. Retrying with npm install..."
    npm install
}
npm run compile
npm run lint
if (-not $SkipTests) {
    npm test
}
