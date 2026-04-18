@echo off
setlocal
set "BASE=%~dp0"
set "KEYFILE=%BASE%.local\key.txt"
if not exist "%KEYFILE%" set "KEYFILE=%BASE%scripts\key.template.txt"

powershell -NoProfile -ExecutionPolicy Bypass -File "%BASE%scripts\bootstrap_windows_host.ps1" -KeyFile "%KEYFILE%" -EnableTailscaleSSH -InstallDotnet8 -InstallWiX -InstallGitLfs
if errorlevel 1 exit /b 1

echo Host setup complete.
exit /b 0
