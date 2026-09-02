@echo off
set DIR=c:\Users\tax\.gemini\antigravity-ide\scratch\kakao_gift_crawler

schtasks /Delete /TN "KakaoGiftRankingCrawler" /F 2>nul
schtasks /Create /TN "KakaoGiftRankingCrawler" /TR "cmd /c cd /d \"%DIR%\" ^&^& py -3 run_all.bat" /SC DAILY /ST 10:00 /F

schtasks /Delete /TN "KakaoGiftDashboardServer" /F 2>nul
schtasks /Create /TN "KakaoGiftDashboardServer" /TR "cmd /c cd /d \"%DIR%\" ^&^& py -3 server.py" /SC ONLOGON /DELAY 0001:00 /F

schtasks /Query /TN "KakaoGiftRankingCrawler"
schtasks /Query /TN "KakaoGiftDashboardServer"
