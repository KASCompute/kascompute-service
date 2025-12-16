@echo off
title KASCompute Miner
cd /d "%~dp0"

echo.
echo Starting KASCompute Miner...
echo Make sure the node is already running.
echo.

powershell -ExecutionPolicy Bypass -NoLogo -NoProfile -File ".\start_miner_pro.ps1"

echo.
echo Miner script finished or crashed.
pause
