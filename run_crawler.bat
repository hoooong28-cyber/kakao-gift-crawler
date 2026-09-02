@echo off
cd /d "%~dp0"
py -3 crawler.py
py -3 auditor.py
py -3 ip_auditor.py
powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).Popup('오늘자 카카오 랭킹 크롤링 및 데이터 검증이 완료되었습니다!', 0, '카카오 대시보드 알림', 64)"
