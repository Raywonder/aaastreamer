@echo off
setlocal
set "BASE=%~dp0"
set "VERSION=%~1"
if "%VERSION%"=="" set "VERSION=1.0.0"
set "PROJECT_ROOT=%~2"
if "%PROJECT_ROOT%"=="" set "PROJECT_ROOT=%USERPROFILE%\dev\apps\voicelink-local\windows-native"
set "KEYFILE=%BASE%.local\key.txt"
if not exist "%KEYFILE%" set "KEYFILE=%BASE%scripts\key.template.txt"

powershell -NoProfile -ExecutionPolicy Bypass -File "%BASE%scripts\setup_windows_builder.ps1" -ProjectRoot "%PROJECT_ROOT%" -KeyFile "%KEYFILE%" -EnableTailscaleSSH -InstallDotnet8 -InstallWiX -Version "%VERSION%"
if errorlevel 1 exit /b 1

echo Setup complete.
exit /b 0
