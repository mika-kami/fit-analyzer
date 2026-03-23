@echo off
title FIT Analyzer
color 0A
cls

echo.
echo  ============================================
echo   FIT Analyzer - Starting...
echo  ============================================
echo.

cd /d "%~dp0"

:: Check Python
echo  [1/4] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python not found.
    echo  Install from: https://www.python.org/downloads/
    echo  Check "Add Python to PATH" during install.
    pause & exit /b 1
)
for /f "tokens=*" %%i in ('python --version') do echo         %%i
echo        OK

:: Check Node
echo  [2/4] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found. Install from: https://nodejs.org/
    pause & exit /b 1
)
echo        OK

:: Node dependencies
echo  [3/4] Node dependencies...
if not exist "node_modules" (
    echo        Running npm install...
    npm install --silent
)
echo        OK

:: Start Garmin bridge - it handles pip deps itself
echo  [4/4] Starting Garmin bridge on port 8765...
start "Garmin Bridge" /min python garmin_server.py
timeout /t 3 /nobreak >nul
echo        OK

:: Open browser then start Vite
start "" "http://localhost:5173"

echo.
echo  ============================================
echo   App:    http://localhost:5173
echo   Garmin: http://localhost:8765
echo.
echo   Press Ctrl+C or close window to stop.
echo  ============================================
echo.

npm run dev

echo.
echo  Stopping Garmin bridge...
taskkill /f /fi "WINDOWTITLE eq Garmin Bridge" >nul 2>&1
echo  Done.
timeout /t 2 /nobreak >nul
