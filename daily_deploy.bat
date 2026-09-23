@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   Kakao Gift Ranking - Daily Crawl ^& Deploy
echo ============================================
echo.

echo [1/6] Switching to main...
git switch main
if errorlevel 1 goto :error

echo.
echo [2/6] Getting latest version from GitHub...
git pull --ff-only origin main
if errorlevel 1 goto :error

echo.
echo [3/6] Running crawler...
py -3 main.py
if errorlevel 1 goto :error

echo.
echo [4/6] Staging dashboard files...
git add docs/
if errorlevel 1 goto :error

echo.
echo [5/6] Committing...
git diff --cached --quiet -- docs/
if errorlevel 1 (
    git commit -m "Update daily gift ranking data"
    if errorlevel 1 goto :error
) else (
    echo No new dashboard changes to commit.
)

echo.
echo [6/6] Pushing to GitHub...
git push origin main
if errorlevel 1 goto :error

echo.
echo ============================================
echo   SUCCESS!
echo   Dashboard deployment completed.
echo ============================================
pause
exit /b 0

:error
echo.
echo ============================================
echo   DEPLOY FAILED
echo   Check the error message above.
echo ============================================
pause
exit /b 1