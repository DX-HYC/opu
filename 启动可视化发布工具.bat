@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "C:\Users\HYC\.workbuddy\binaries\node\versions\22.22.2-2\node.exe" (
  echo [错误] 未找到 WorkBuddy 内置 Node，请确认 WorkBuddy 已安装。
  echo 也可改用系统 node：将下面命令中的 node 路径替换为你的 node.exe 路径。
  pause
  exit /b 1
)
"C:\Users\HYC\.workbuddy\binaries\node\versions\22.22.2-2\node.exe" bin/opu.js gui
