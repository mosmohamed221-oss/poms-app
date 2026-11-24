@echo off
chcp 65001 >nul
title POMS V3 - Parliamentary Office Management System
color 1F

echo ============================================================
echo   POMS V3 - Parliamentary Office Management System
echo   Local Server & Multi-Device (Phones + PCs) Launcher
echo ============================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js is not installed on this computer!
  echo Please download and install Node.js LTS from: https://nodejs.org
  echo Then double-click start-poms.bat again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/3] Installing required packages for the first time...
  call npm install
  if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies. Check your internet connection.
    pause
    exit /b 1
  )
) else (
  echo [1/3] Dependencies already installed.
)

echo.
echo [2/3] Detected Local Network IP addresses for Phones ^& other PCs:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=1" %%b in ("%%a") do (
    echo   -^> Open on Phone / Tablet / Other PC: http://%%b:3000
  )
)
echo   -^> Open on this PC: http://localhost:3000
echo   -^> Citizen Portal (/register): http://localhost:3000/register
echo.
echo IMPORTANT: Keep this window open while other devices are using the system.
echo If Windows Firewall asks for permission, click "Allow access".
echo.
echo [3/3] Starting POMS V3 server on port 3000...
start "" http://localhost:3000
call npm run dev
pause
