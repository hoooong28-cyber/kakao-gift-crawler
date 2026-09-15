@echo off
setlocal
cd /d "%~dp0"
if not exist "logs" mkdir "logs"
call :repair > "logs\repair.log" 2>&1
set "RESULT=%errorlevel%"
type "logs\repair.log"
echo.
if "%RESULT%"=="0" (echo Repair and GitHub upload completed.) else (echo Repair stopped. See logs\repair.log for the error.)
pause
exit /b %RESULT%

:repair
echo Rebuilding today's dashboard from today's existing CSV...
py -3 main.py --skip_scrape --top_n 50
if errorlevel 1 exit /b 1
echo Checking generated data...
py -3 verify_dashboard.py
if errorlevel 1 exit /b 1
echo Registering daily task for 10:00...
call setup_scheduler.bat
if errorlevel 1 exit /b 1
git add -- .gitignore crawler.py main.py run_crawler.bat setup_scheduler.bat setup_scheduler.ps1 finish_repair.bat verify_dashboard.py docs/
if errorlevel 1 exit /b 1
git diff --cached --quiet -- .gitignore crawler.py main.py run_crawler.bat setup_scheduler.bat setup_scheduler.ps1 finish_repair.bat verify_dashboard.py docs/
if errorlevel 2 exit /b 1
if not errorlevel 1 goto push
git commit -m "fix: restore daily collection and dashboard date updates" --only -- .gitignore crawler.py main.py run_crawler.bat setup_scheduler.bat setup_scheduler.ps1 finish_repair.bat verify_dashboard.py docs/
if errorlevel 1 exit /b 1
:push
git push origin main
exit /b %errorlevel%
