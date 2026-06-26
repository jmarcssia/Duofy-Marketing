#requires -Version 5.1
<#
.SYNOPSIS
    Inicia o frontend Next.js da worktree Cloud Code do DUOFY V1.

.DESCRIPTION
    Inicializacao reproduzivel do frontend de desenvolvimento Cloud Code.
    - Confirma que esta na worktree Cloud (C:\DUOFY_V1_MARKETING_AI_CLOUD).
    - Valida a existencia de apps/web/.env.local.
    - Valida que a API compartilhada esta saudavel em http://localhost:8000/health.
    - Usa a porta registrada do frontend Cloud (default 3001), nunca a 3000.
    - Inicia somente o frontend Next.js.

    Nao inclui segredos. Nao sobe Docker. Nao toca no backend, banco ou na
    pasta original. Encerre o processo com Ctrl+C.

.PARAMETER Port
    Porta do frontend Cloud. Default 3001. A porta 3000 e proibida (pertence
    ao frontend original).

.EXAMPLE
    ./scripts/start-cloud-frontend.ps1
.EXAMPLE
    ./scripts/start-cloud-frontend.ps1 -Port 3002
#>
[CmdletBinding()]
param(
    [int]$Port = 3001
)

$ErrorActionPreference = 'Stop'

$ExpectedWorktree = 'C:\DUOFY_V1_MARKETING_AI_CLOUD'
$ApiUrl           = 'http://localhost:8000'
$HealthUrl        = "$ApiUrl/health"

# Raiz da worktree = pasta pai de /scripts
$RepoRoot = Split-Path -Parent $PSScriptRoot

function Fail($message) {
    Write-Host "[ERRO] $message" -ForegroundColor Red
    exit 1
}

# 1. Confirmar worktree Cloud
if ($RepoRoot.TrimEnd('\') -ine $ExpectedWorktree.TrimEnd('\')) {
    Fail "Worktree incorreta. Esperado '$ExpectedWorktree', atual '$RepoRoot'."
}

# 5. Impedir uso da porta 3000
if ($Port -eq 3000) {
    Fail "A porta 3000 pertence ao frontend original e nao pode ser usada aqui."
}

# 2. Validar apps/web/.env.local
$EnvLocal = Join-Path $RepoRoot 'apps\web\.env.local'
if (-not (Test-Path $EnvLocal)) {
    Fail "apps/web/.env.local nao encontrado. Crie com NEXT_PUBLIC_API_URL=$ApiUrl."
}

# 3. Validar saude da API compartilhada
try {
    $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 15
    if ($health.status -ne 'ok') {
        Fail "API respondeu, mas status != ok em $HealthUrl."
    }
} catch {
    Fail "API nao esta saudavel em $HealthUrl. Suba o backend compartilhado (pasta original) antes de iniciar o frontend Cloud."
}

# 4 + 6 + 7. Resumo e inicio do Next.js
$Branch = (& git -C $RepoRoot branch --show-current).Trim()
$FrontendUrl = "http://localhost:$Port"

Write-Host ''
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host ' DUOFY V1 - Frontend Cloud Code' -ForegroundColor Cyan
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host (" Frontend Cloud : {0}" -f $FrontendUrl)
Write-Host (" API            : {0}" -f $ApiUrl)
Write-Host (" Branch         : {0}" -f $Branch)
Write-Host (" Worktree       : {0}" -f $RepoRoot)
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
