@echo off  
cd /d "%~dp0"  
py -3 crawler.py  
py -3 auditor.py  
py -3 ip_auditor.py 
