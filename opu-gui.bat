@echo off
chcp 65001 >nul
cd /d "%~dp0"
"C:\Users\HYC\.workbuddy\binaries\node\versions\22.22.2-2\node.exe" bin/opu.js gui
