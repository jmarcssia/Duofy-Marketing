#requires -Version 5.1
<#
.SYNOPSIS
    Inicia o frontend Next.js de desenvolvimento do DUOFY V1.

.DESCRIPTION
    Script para uso sequencial de Codex ou Cloud Code na pasta oficial do projeto.
    - Funciona a partir de C:\DUOFY_V1_MARKETING_AI ou de qualquer clone/worktree atual.
    - Valida apps/web/.env.local.
    - Valida a API compartilhada em http://localhost:8000/health.
    - Usa a porta 3001 por padrão para não conflitar com o frontend Docker em 3000.
    - Não sobe Docker, não toca no backend, banco, Redis ou worker.

.PARAMETER Port
    Porta do frontend dev. Default 3001.

.EXAMPLE
    ./scripts/start-frontend-dev.ps1
.EXAMPLE
    ./scripts/start-frontend-dev.ps1 -Port 3002
#>
[CmdletBinding()]
param(
    [int]$Port = 3001
)

$ErrorActionPreference = 'Stop'

$ApiUrl = 'http://localhost:8000'
$HealthUrl = "$ApiUrl/health"
$RepoRoot = Split-Path -Parent $PSScriptRoot

function Fail($message) {
    Write-Host "[ERRO] $message" -ForegroundColor Red
    exit 1
}

if ($Port -eq 3000) {
    Fail 'A porta 3000 fica reservada para o frontend Docker. Use 3001 ou outra porta livre.'
}

$EnvLocal = Join-Path $RepoRoot 'apps\web\.env.local'
if (-not (Test-Path $EnvLocal)) {
    Fail "apps/web/.env.local nao encontrado. Crie com NEXT_PUBLIC_API_URL=$ApiUrl."
}

try {
    $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 15
    if ($health.status -ne 'ok') {
        Fail "API respondeu, mas status != ok em $HealthUrl."
    }
} catch {
    Fail "API nao esta saudavel em $HealthUrl. Suba a stack compartilhada antes de iniciar o frontend dev."
}

$Branch = (& git -C $RepoRoot branch --show-current).Trim()
$FrontendUrl = "http://localhost:$Port"

Write-Host ''
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host ' DUOFY V1 - Frontend Dev' -ForegroundColor Cyan
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host (" Frontend dev : {0}" -f $FrontendUrl)
Write-Host (" API          : {0}" -f $ApiUrl)
Write-Host (" Branch       : {0}" -f $Branch)
Write-Host (" Projeto      : {0}" -f $RepoRoot)
Write-Host '--------------------------------------------------' -ForegroundColor Cyan
Write-Host ' Encerre com Ctrl+C.' -ForegroundColor Yellow
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host ''

Push-Location $RepoRoot
try {
    & npm.cmd --prefix apps/web run dev -- -p $Port
} finally {
    Pop-Location
}
