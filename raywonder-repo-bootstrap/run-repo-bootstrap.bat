@echo off
setlocal
set "BASE=%~dp0"
set "REPO=%~1"
if "%REPO%"=="" set "REPO=%CD%"

echo [1/2] Updating target repo and repairing shell line endings if needed...
call "%BASE%run-repo-update.bat" "%REPO%"
if errorlevel 1 exit /b 1

echo [2/2] Ensuring host tooling and remote access setup...
call "%BASE%run-host-setup.bat"
if errorlevel 1 exit /b 1

echo Repo bootstrap completed for %REPO%.
exit /b 0
