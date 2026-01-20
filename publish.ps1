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
    [switch]$PreflightOnly,
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'

function Write-Header($Text) { Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-Ok($Text) { Write-Host "[OK] $Text" -ForegroundColor Green }
function Write-Warn($Text) { Write-Host "[!] $Text" -ForegroundColor Yellow }
function Write-Fail($Text) { Write-Host "[X] $Text" -ForegroundColor Red }

function Invoke-CommandSafe {
    param([string]$Command)
    Write-Host "> $Command" -ForegroundColor Cyan
    Invoke-Expression $Command
}

function Test-Command {
    param([string]$Name)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    return $null -ne $cmd
}

function Resolve-SignToolPath {
    param([string]$Path)
    if (-not [string]::IsNullOrWhiteSpace($Path)) {
        $cmd = Get-Command $Path -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
    }
    $kitsRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\\10\\bin'
    if (Test-Path $kitsRoot) {
        $versions = Get-ChildItem -Path $kitsRoot -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending
        foreach ($ver in $versions) {
            foreach ($arch in @('x64','x86')) {
                $candidate = Join-Path $ver.FullName (Join-Path $arch 'signtool.exe')
                if (Test-Path $candidate) { return $candidate }
            }
        }
    }
    return $null
}

function Test-CertificateThumbprint {
    param([string]$Thumbprint)
    if (-not $Thumbprint) {
        return $false
    }
    $normalized = $Thumbprint -replace '\s',''
    foreach ($store in @('Cert:\\CurrentUser\\My','Cert:\\LocalMachine\\My')) {
        try {
            $match = Get-ChildItem -Path $store -ErrorAction SilentlyContinue |
                Where-Object { $_.Thumbprint -eq $normalized } |
                Select-Object -First 1
            if ($match) {
                return $true
            }
        } catch {
            # ignore store access issues
        }
    }
    return $false
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

function Resolve-MarketplaceTokenInfo {
    if ($PSBoundParameters.ContainsKey('MarketplaceToken') -and $MarketplaceToken) {
        return @{ Token = $MarketplaceToken; Source = 'MarketplaceToken parameter' }
    }
    if ($Env:VSCE_TOKEN) {
        return @{ Token = $Env:VSCE_TOKEN; Source = 'VSCE_TOKEN env var' }
    }
    if ($MarketplaceTokenPath -and (Test-Path -LiteralPath $MarketplaceTokenPath)) {
        $token = (Get-Content -LiteralPath $MarketplaceTokenPath -Raw).Trim()
        if ($token) {
            return @{ Token = $token; Source = "file $MarketplaceTokenPath" }
        }
    }
    return @{ Token = $null; Source = 'not found' }
}

function Invoke-Preflight {
    Write-Header 'Preflight'
    $issues = 0

    if (Test-Command 'node') { Write-Ok 'node found' } else { Write-Fail 'node not found'; $issues++ }
    if (Test-Command 'npm') { Write-Ok 'npm found' } else { Write-Fail 'npm not found'; $issues++ }

    if ($Sign) {
        if ($SigningThumbprint -eq "<CODE_SIGN_THUMBPRINT>") {
            Write-Fail 'Signing thumbprint placeholder is still set.'
            $issues++
        } elseif (Test-CertificateThumbprint -Thumbprint $SigningThumbprint) {
            Write-Ok "Signing certificate found ($SigningThumbprint)"
        } else {
            Write-Warn "Signing certificate not found in CurrentUser/LocalMachine stores ($SigningThumbprint)"
        }
        $signtool = Resolve-SignToolPath -Path 'signtool.exe'
        if ($signtool) { Write-Ok "signtool found ($signtool)" } else { Write-Fail 'signtool not found'; $issues++ }
    }

    if ($Publish) {
        $tokenInfo = Resolve-MarketplaceTokenInfo
        if ($tokenInfo.Token) {
            Write-Ok "Marketplace token resolved (${tokenInfo.Source})"
        } else {
            Write-Fail 'Marketplace token not found (set VSCE_TOKEN or provide token file).'
            $issues++
        }
    }

    if ($issues -gt 0) {
        throw "Preflight failed with $issues issue(s)."
    }
}

Write-Host "ForgeFlow publish" -ForegroundColor Green

Invoke-Preflight
if ($PreflightOnly) {
    Write-Host "Preflight complete." -ForegroundColor Green
    return
}

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
