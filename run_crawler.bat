@echo off
chcp 65001 > nul
echo.
echo ============================================================
echo  카카오 선물하기 크롤러 + GitHub Pages 자동 배포 시작
echo ============================================================
echo.

:: 1. 크롤링 + 분석 + web/data.json 갱신 (main.py 통합 파이프라인)
echo [1/4] 크롤링 및 데이터 가공 시작 (main.py)...
py -3 main.py
if %errorlevel% neq 0 (
    echo [오류] main.py 실행 실패. 종료합니다.
    pause
    exit /b 1
)

:: 2. IP 감사 리포트 생성
echo.
echo [2/4] IP 감사 리포트 생성 중 (ip_auditor.py)...
py -3 ip_auditor.py

:: 3. git add + commit + push (web/data.json, web/insight_cards.json만 배포)
echo.
echo [3/4] GitHub Pages 자동 배포 중...
git add web/data.json web/insight_cards.json
git commit -m "data: %date% 데이터 자동 업데이트"
git push origin main
if %errorlevel% neq 0 (
    echo [경고] git push 실패. 네트워크나 인증을 확인하세요.
) else (
    echo [완료] GitHub Pages에 최신 데이터가 배포되었습니다!
)

:: 4. 완료 알림
echo.
echo ============================================================
echo  전체 파이프라인 완료!
echo  GitHub Pages 반영까지 약 1-2분 소요됩니다.
echo ============================================================
echo.
powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('카카오 선물 크롤링 및 GitHub Pages 배포가 완료되었습니다!', '카카오 선물 알림')"
