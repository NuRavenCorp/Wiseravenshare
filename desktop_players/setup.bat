@echo off
REM WiseRavenShare Desktop Players Setup Script (Windows)
REM Installs dependencies and runs the players

setlocal enabledelayedexpansion

cd /d "%~dp0"

echo 🎵 WiseRavenShare Desktop Players Setup
echo ========================================

REM Check Python version
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python is required but not installed.
    echo    Install from https://www.python.org/
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
echo ✅ Python %PYTHON_VERSION% found

REM Create virtual environment if needed
if not exist "venv" (
    echo 📦 Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Install/upgrade dependencies
echo 📚 Installing dependencies...
python -m pip install --upgrade pip setuptools wheel >nul 2>&1
pip install -r requirements.txt >nul 2>&1

REM Check VLC installation
echo 🎬 Checking VLC installation...
where vlc >nul 2>&1
if errorlevel 1 (
    echo ⚠️  VLC is not installed. Install it for full codec support:
    echo    Download from https://www.videolan.org/vlc/
)

REM Show player options
echo.
echo 🎮 Select player to run:
echo   1) Audio Player
echo   2) Video Player
echo   3) Both (in separate windows)
echo.

set /p choice="Enter choice [1-3]: "

if "%choice%"=="1" (
    echo 🎵 Starting Audio Player...
    python audio_player.py
) else if "%choice%"=="2" (
    echo 🎬 Starting Video Player...
    python video_player.py
) else if "%choice%"=="3" (
    echo 🎵 Starting Audio Player...
    start python audio_player.py
    timeout /t 1 >nul
    echo 🎬 Starting Video Player...
    start python video_player.py
    echo.
    echo Both players started in separate windows.
) else (
    echo Invalid choice
    pause
    exit /b 1
)

pause
