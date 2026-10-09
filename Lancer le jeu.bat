@echo off
cd /d "%~dp0"
py server.py || python server.py
pause
