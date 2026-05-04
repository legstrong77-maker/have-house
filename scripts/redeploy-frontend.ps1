# Have-House 前端一鍵重 build + 部署到 Cloudflare Pages
#
# 用法 (在專案根目錄執行)：
#   .\scripts\redeploy-frontend.ps1 https://xxx-yyy-zzz.trycloudflare.com
#
# 流程：
#   1. 用傳入的 tunnel URL 當 VITE_API_BASE
#   2. npm run build
#   3. wrangler pages deploy

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$TunnelUrl
)

$ErrorActionPreference = "Stop"

# 標準化 URL：移除尾端 / 與 /api
$baseUrl = $TunnelUrl.TrimEnd("/")
if ($baseUrl.EndsWith("/api")) { $baseUrl = $baseUrl.Substring(0, $baseUrl.Length - 4) }

# 簡單驗證
if (-not ($baseUrl -match "^https://[a-z0-9\-]+\.trycloudflare\.com$" -or
          $baseUrl -match "^https://[a-z0-9\-\.]+$")) {
    Write-Host "❌ URL 格式怪：$baseUrl" -ForegroundColor Red
    exit 1
}

$apiBase = "$baseUrl/api"
Write-Host "→ 使用 API base: $apiBase" -ForegroundColor Cyan

$repoRoot = Resolve-Path "$PSScriptRoot\.."
$webDir = Join-Path $repoRoot "web"

Push-Location $webDir
try {
    Write-Host "→ 測 API 通不通..." -ForegroundColor Cyan
    try {
        $r = Invoke-WebRequest "$apiBase/health" -UseBasicParsing -TimeoutSec 10
        if ($r.StatusCode -ne 200) { throw "health 回 $($r.StatusCode)" }
        Write-Host "✓ API 通了 ($apiBase/health)" -ForegroundColor Green
    } catch {
        Write-Host "⚠ API 連不上 — 仍繼續部署，但前端開出來會壞" -ForegroundColor Yellow
        Write-Host "  錯誤：$_" -ForegroundColor Yellow
    }

    Write-Host "→ 編譯前端..." -ForegroundColor Cyan
    $env:VITE_API_BASE = $apiBase
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm build 失敗" }

    Write-Host "→ 加上 SPA _redirects..." -ForegroundColor Cyan
    Copy-Item "public\_redirects" "dist\_redirects" -Force

    Write-Host "→ 部署到 Cloudflare Pages..." -ForegroundColor Cyan
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    wrangler pages deploy dist --project-name=have-house --branch=main --commit-message="redeploy $stamp"
    if ($LASTEXITCODE -ne 0) { throw "wrangler 部署失敗" }

    Write-Host ""
    Write-Host "✅ 完成！打開 https://have-house.pages.dev 並 Ctrl+Shift+R 強制重整" -ForegroundColor Green
}
finally {
    Pop-Location
}
