@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 灵敢足迹地图服务
echo 正在启动灵敢足迹地图，请保持此窗口打开...
set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS_EXE%" (
  echo 找不到 Windows PowerShell：%PS_EXE%
  pause
  exit /b 1
)
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -NoExit -Command "& '%~dp0启动地图.ps1'"
echo.
echo 地图服务已停止，按任意键关闭窗口...
pause
