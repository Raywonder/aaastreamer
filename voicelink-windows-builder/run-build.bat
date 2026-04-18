@echo off
setlocal
set "BASE=%~dp0"
set "VERSION=%~1"
if "%VERSION%"=="" set "VERSION=1.0.0"
set "PROJECT_ROOT=%~2"
if "%PROJECT_ROOT%"=="" set "PROJECT_ROOT=%USERPROFILE%\dev\apps\voicelink-local\windows-native"

powershell -NoProfile -ExecutionPolicy Bypass -File "%BASE%scripts\build_windows_installers.ps1" -Version "%VERSION%" -ProjectRoot "%PROJECT_ROOT%"
if errorlevel 1 exit /b 1

echo Build complete.
exit /b 0
