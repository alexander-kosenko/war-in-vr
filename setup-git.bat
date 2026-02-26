@echo off
REM War in VR - Auto Git Setup Script for Windows
REM This script automatically initializes Git and prepares for push to GitHub

echo 🎮 War in VR - Git Setup
echo ========================
echo.

REM Check if we're in the right directory
if not exist "index.html" (
    echo ❌ Error: Run this script from the war-in-vr folder!
    echo    cd path\to\war-in-vr
    exit /b 1
)

if not exist "admin" (
    echo ❌ Error: Admin folder not found!
    exit /b 1
)

echo ✅ Found War in VR project
echo.

REM Check if Git is installed
git --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Git is not installed!
    echo    Install Git: https://git-scm.com/download/win
    exit /b 1
)

echo ✅ Git is installed
echo.

REM Initialize Git (if not already initialized)
if not exist ".git" (
    echo 🔧 Initializing Git repository...
    git init
    echo ✅ Git initialized
) else (
    echo ✅ Git already initialized
)

echo.

REM Add files
echo 📦 Adding files to Git...
git add .
echo ✅ Files added

echo.

REM Commit
echo 💾 Creating commit...
git commit -m "Initial commit: War in VR project with admin panel"

echo ✅ Commit created

echo.
echo 🎉 Local Git repository ready!
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 📋 NEXT STEPS:
echo.
echo 1️⃣  Create a repository on GitHub:
echo    https://github.com/new
echo.
echo 2️⃣  Copy your repository URL
echo    (e.g.: https://github.com/USERNAME/war-in-vr.git)
echo.
echo 3️⃣  Run these commands:
echo.
echo    git remote add origin YOUR_GITHUB_URL
echo    git branch -M main
echo    git push -u origin main
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 💡 After push:
echo    → Go to pages.cloudflare.com
echo    → Create project → Connect to Git
echo    → Select war-in-vr
echo    → Deploy!
echo.
echo 🔗 Detailed instructions: GITHUB_SETUP.md
echo.
pause
