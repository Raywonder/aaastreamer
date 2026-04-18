@echo off
setlocal

set "BASE=%~dp0"
set "VERSION=%~1"
if "%VERSION%"=="" set "VERSION=1.0.0"
set "PROJECT_ROOT=%~2"
if "%PROJECT_ROOT%"=="" set "PROJECT_ROOT=%USERPROFILE%\dev\apps\voicelink-local\windows-native"

echo [1/3] Updating tool repo and repairing shell line endings if needed...
call "%BASE%pull-update.bat"
if errorlevel 1 exit /b 1

echo [2/3] Running host setup...
call "%BASE%run-setup.bat" "%VERSION%" "%PROJECT_ROOT%"
if errorlevel 1 exit /b 1

echo [3/3] Running build...
call "%BASE%run-build.bat" "%VERSION%" "%PROJECT_ROOT%"
if errorlevel 1 exit /b 1

echo All steps completed.
exit /b 0
