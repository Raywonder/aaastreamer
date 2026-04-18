@echo off
setlocal
set "BASE=%~dp0"
set "REPO=%~1"
if "%REPO%"=="" set "REPO=%CD%"
set "SSH_KEY=%USERPROFILE%\.ssh\raywonder"

cd /d "%REPO%"
if errorlevel 1 (
  echo Failed to open repo path: %REPO%
  exit /b 1
)

for /f "delims=" %%I in ('git remote get-url origin 2^>nul') do set "ORIGIN_URL=%%I"
if defined ORIGIN_URL (
  echo %ORIGIN_URL% | findstr /R /C:"https://github\.com/" >nul
  if not errorlevel 1 (
    set "NEW_URL=%ORIGIN_URL:https://github.com/=git@devine-creations.com:%"
    if /I not "%NEW_URL:~-4%"==".git" set "NEW_URL=%NEW_URL%.git"
    git remote set-url origin "%NEW_URL%"
  )
  echo %ORIGIN_URL% | findstr /R /C:"git@github\.com:" >nul
  if not errorlevel 1 (
    set "NEW_URL=%ORIGIN_URL:git@github.com:=git@devine-creations.com:%"
    if /I not "%NEW_URL:~-4%"==".git" set "NEW_URL=%NEW_URL%.git"
    git remote set-url origin "%NEW_URL%"
  )
)

if exist "%SSH_KEY%" (
  set "GIT_SSH_COMMAND=ssh -i \"%SSH_KEY%\" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%BASE%scripts\pull_and_fix_repo.ps1" -RepoRoot "%REPO%"
if errorlevel 1 exit /b 1

echo Repo update complete for %REPO%.
exit /b 0
