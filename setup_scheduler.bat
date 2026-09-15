@echo off
setlocal
set "KAKAO_REPAIR_ROOT=%~dp0"
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; $root=$env:KAKAO_REPAIR_ROOT; $batch=Join-Path $root 'run_crawler.bat'; $quote=[char]34; $arguments='/d /s /c '+$quote+$quote+$batch+$quote+$quote; $action=New-ScheduledTaskAction -Execute ($env:SystemRoot+'\System32\cmd.exe') -Argument $arguments -WorkingDirectory $root; $trigger=New-ScheduledTaskTrigger -Daily -At '10:00'; $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1); $user=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name; $principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited; Register-ScheduledTask -TaskName 'KakaoGiftRankingCrawler' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null; Get-ScheduledTaskInfo -TaskName 'KakaoGiftRankingCrawler'"
exit /b %errorlevel%
