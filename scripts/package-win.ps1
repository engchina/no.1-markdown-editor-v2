[CmdletBinding()]
param(
  [switch]$OpenOutput
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')
$bundleRoot = Join-Path $repoRoot 'src-tauri\target\release\bundle'

Set-Location $repoRoot

Write-Host ''
Write-Host '==> Building Windows installer packages...' -ForegroundColor Cyan
Write-Host "Repo root: $repoRoot"

npm run tauri -- build

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$installers = @()

foreach ($pattern in @('*.msi', '*.exe')) {
  $installers += Get-ChildItem -Path $bundleRoot -Recurse -File -Filter $pattern -ErrorAction SilentlyContinue |
    Where-Object { $_.DirectoryName -match '\\(msi|nsis)$' }
}

if ($installers.Count -eq 0) {
  throw "No Windows installer packages were found under $bundleRoot."
}

$installers = $installers | Sort-Object FullName -Unique

Write-Host ''
Write-Host '==> Installer packages created:' -ForegroundColor Green

foreach ($installer in $installers) {
  Write-Host " - $($installer.FullName)"
}

if ($OpenOutput) {
  Start-Process explorer.exe $bundleRoot
}
