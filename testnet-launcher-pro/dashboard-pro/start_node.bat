@echo off
title KASCompute Node
cd /d "%~dp0"

echo.
echo Starting KASCompute Node...
echo (This window will stay open. Press CTRL+C to stop.)
echo.

powershell -ExecutionPolicy Bypass -NoLogo -NoProfile -File ".\start_node_pro.ps1"

echo.
echo Node script finished or crashed.
pause
