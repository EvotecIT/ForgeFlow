param(
    [switch] $Publish,
    [switch] $PreRelease,
    [switch] $SkipNpmCi,
    [switch] $SkipTests,
    [string] $OutputDirectory = "dist"
)

$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'scripts/package-vsix.cjs'
$arguments = @($scriptPath, "--output-directory=$OutputDirectory")

if ($Publish) {
    $arguments += '--publish-marketplace'
}
if ($PreRelease) {
    $arguments += '--pre-release'
}
if ($SkipNpmCi) {
    $arguments += '--skip-npm-ci'
}
if ($SkipTests) {
    $arguments += '--skip-tests'
}

& node @arguments
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
