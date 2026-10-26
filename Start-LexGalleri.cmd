@echo off
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo Python mangler. Installer Python 3.12 eller nyere fra https://www.python.org/downloads/windows/
  pause
  exit /b 1
)
py -3 start.py
pause
