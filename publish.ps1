# ForgeFlow publish script
# Organization: Evotec

[CmdletBinding()]
param(
    [string]$SigningThumbprint = "92e95fb58effa6a4a75e77a33cdd6bfe6dd30f1a",
    [string]$MarketplaceToken = $Env:VSCE_TOKEN,
    [string]$MarketplaceTokenPath = "C:\\Support\\Important\\VSCode.txt",
    [string]$TimestampUrl = "",
    [switch]$Sign,
    [switch]$Publish,
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'

function Invoke-CommandSafe {
    param([string]$Command)
    Write-Host "> $Command" -ForegroundColor Cyan
    Invoke-Expression $Command
}

function Get-VsixPath {
    $vsix = Get-ChildItem -LiteralPath (Get-Location) -Filter "*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $vsix) {
        throw "VSIX not found. Run 'npm run package' first."
    }
    return $vsix.FullName
}

function Sign-Vsix {
    param([string]$VsixPath)

    if ($SigningThumbprint -eq "<CODE_SIGN_THUMBPRINT>") {
        throw "SigningThumbprint is not set. Provide a valid thumbprint."
    }

    $signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if (-not $signtool) {
        throw "signtool.exe not found. Install Windows SDK and ensure signtool is on PATH."
    }

    $timestampArgs = @()
    if ($TimestampUrl) {
        $timestampArgs = @('/tr', $TimestampUrl, '/td', 'sha256')
    }

    # Hardware certificate (USB) prompts for PIN when required.
    & $signtool.Source sign /sha1 $SigningThumbprint /fd sha256 @timestampArgs $VsixPath
}

function Verify-VsixSignature {
    param([string]$VsixPath)

    $signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($signtool) {
        & $signtool.Source verify /pa /v $VsixPath
        return
    }

    $signature = Get-AuthenticodeSignature -FilePath $VsixPath
    if ($signature.Status -ne 'Valid') {
        throw "VSIX signature is not valid: $($signature.Status)"
    }
}

function Resolve-MarketplaceToken {
    if ($MarketplaceToken) {
        return $MarketplaceToken
    }
    if ($MarketplaceTokenPath -and (Test-Path -LiteralPath $MarketplaceTokenPath)) {
        return (Get-Content -LiteralPath $MarketplaceTokenPath -Raw).Trim()
    }
    return $null
}

Write-Host "ForgeFlow publish" -ForegroundColor Green

Invoke-CommandSafe "npm ci"
Invoke-CommandSafe "npm run compile"
Invoke-CommandSafe "npm run lint"
if (-not $SkipTests) {
    Invoke-CommandSafe "npm test"
}
Invoke-CommandSafe "npm run package"

$vsixPath = Get-VsixPath
Write-Host "VSIX: $vsixPath" -ForegroundColor Green

if ($Sign) {
    Sign-Vsix -VsixPath $vsixPath
}

if ($Publish) {
    Verify-VsixSignature -VsixPath $vsixPath
    $resolvedToken = Resolve-MarketplaceToken
    if (-not $resolvedToken) {
        throw "Marketplace token not provided. Set -MarketplaceToken, VSCE_TOKEN, or provide -MarketplaceTokenPath."
    }
    Invoke-CommandSafe "npx vsce publish --packagePath `"$vsixPath`" -p `"$resolvedToken`""
}

Write-Host "Done." -ForegroundColor Green
