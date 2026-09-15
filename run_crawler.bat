@echo off
setlocal
cd /d "%~dp0"
if not exist "logs" mkdir "logs"
call :pipeline >> "logs\daily_update.log" 2>&1
exit /b %errorlevel%

:pipeline
echo [%date% %time%] Daily update started
py -3 main.py --top_n 50
if errorlevel 1 exit /b 1
py -3 verify_dashboard.py
if errorlevel 1 exit /b 1
git add -- docs/
if errorlevel 1 exit /b 1
git diff --cached --quiet -- docs/
if errorlevel 2 exit /b 1
if not errorlevel 1 goto push
git commit -m "data: daily ranking update" --only -- docs/
if errorlevel 1 exit /b 1
:push
git push origin main
if errorlevel 1 exit /b 1
echo [%date% %time%] Daily update completed
exit /b 0
