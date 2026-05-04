# ============================================================
# 把本機 Have-House 同步到 NAS 的 /docker/have-house/
# 用法：.\scripts\sync-to-nas.ps1
# ============================================================

# 改成你的 NAS IP 或主機名稱
$NAS_HOST  = "fukai"            # 例：fukai 或 192.168.1.10
$NAS_SHARE = "docker"
$NAS_SUB   = "have-house"

$src = (Resolve-Path "$PSScriptRoot\..").Path
$dst = "\\$NAS_HOST\$NAS_SHARE\$NAS_SUB"

if (-not (Test-Path $dst)) {
    Write-Host "找不到 $dst — 請確認 NAS 已連線、共用資料夾名稱正確、且已登入過 SMB。" -ForegroundColor Red
    Write-Host "可先在檔案總管網址列輸入 \\$NAS_HOST 試連看看。" -ForegroundColor Yellow
    exit 1
}

# robocopy: /MIR 鏡像、/Z 中斷續傳、/XD 排除資料夾
Write-Host "Sync $src -> $dst" -ForegroundColor Cyan
robocopy $src $dst /MIR /Z `
    /XD ".git" "node_modules" "__pycache__" ".venv" "dist" "build" ".vite" "data" `
    /XF "*.log" ".DS_Store"

# robocopy 退出碼 0~7 都算成功（8 以上才是錯誤）
if ($LASTEXITCODE -ge 8) {
    Write-Host "同步失敗，請檢查 NAS 連線。" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "`n同步完成。" -ForegroundColor Green
Write-Host "下一步（NAS 端）：" -ForegroundColor Yellow
Write-Host "  - 改了 Python / SQL / nginx：Container Manager → 專案 → have-house → 動作 → 重新建立"
Write-Host "  - 改了前端 (web/)：同上（會 rebuild image）"
Write-Host "  - 只改了 .env：同上"
exit 0
