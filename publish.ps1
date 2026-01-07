# ForgeFlow publish template
# Organization: Evotec

param(
    [string]$SigningThumbprint = "<CODE_SIGN_THUMBPRINT>",
    [string]$MarketplaceToken = "<VSCE_TOKEN>"
)

Write-Host "ForgeFlow publish template"
Write-Host "Signing thumbprint placeholder: $SigningThumbprint"

# TODO: Add PowerForge engine packaging when available.
# - Sign PowerForge binaries
# - Include engine output in VSIX

npm ci
npm run compile
npm run package

# Example (disabled):
# vsce publish -p $MarketplaceToken
