@echo off
setlocal

set "REPO=%~dp0.."
set "FIXER=%~dp0scripts\repair-line-endings.ps1"
set "SSH_KEY=%USERPROFILE%\.ssh\raywonder"

echo Updating .GITHUB repo...
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

git -c credential.helper= pull --ff-only
if errorlevel 1 (
  echo git pull failed.
  exit /b 1
)

echo Checking shell script line endings...
powershell -NoProfile -ExecutionPolicy Bypass -File "%FIXER%" -Root "%~dp0." -Quiet
if errorlevel 1 (
  echo Line ending repair failed.
  exit /b 1
)

echo Update complete.
exit /b 0
