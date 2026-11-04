$ErrorActionPreference = 'Stop'

$base = $PSScriptRoot
$exe = Join-Path $base '自我导向学习辅助器.exe'

if (-not (Test-Path -LiteralPath $exe)) {
  Write-Host '没有找到「自我导向学习辅助器.exe」。' -ForegroundColor Red
  Write-Host '请先把压缩包完整解压，再运行这个脚本。'
  Read-Host '按回车退出'
  exit 1
}

$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop '自我导向学习辅助器.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnk)
$shortcut.TargetPath = $exe
$shortcut.WorkingDirectory = $base
$shortcut.IconLocation = "$exe,0"
$shortcut.Description = '自我导向学习辅助器'
$shortcut.Save()

Write-Host ''
Write-Host '已创建桌面快捷方式：' -ForegroundColor Green
Write-Host "  $lnk"
Write-Host ''
Write-Host '以后从桌面图标打开即可；数据保存在程序旁的 data\vault。'
Start-Sleep -Seconds 2
