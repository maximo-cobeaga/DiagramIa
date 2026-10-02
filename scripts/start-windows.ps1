$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
Write-Host "Instalando dependencias del lockfile..."
npm ci
if ($LASTEXITCODE -ne 0) { throw "npm ci fallo" }
Write-Host "Comprobando core, editor y MCP..."
npm run check
if ($LASTEXITCODE -ne 0) { throw "Los checks fallaron" }
Write-Host "Abriendo servidor de desarrollo del editor..."
npm run dev
