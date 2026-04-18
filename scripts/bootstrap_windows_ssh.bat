@echo off
setlocal EnableExtensions

REM VoiceLink Remote Build - Windows SSH Bootstrap launcher
REM Runs bootstrap_windows_ssh.ps1 with elevation and execution-policy bypass.

set "SCRIPT_DIR=%~dp0"
set "PS1=%SCRIPT_DIR%bootstrap_windows_ssh.ps1"
set "KEY_FILE=%SCRIPT_DIR%.local\key.txt"
if not exist "%KEY_FILE%" set "KEY_FILE=%SCRIPT_DIR%key.template.txt"

if not exist "%PS1%" (
  echo [ERROR] Missing PowerShell script:
  echo         %PS1%
  exit /b 1
)

REM Check for admin rights.
net session >nul 2>&1
if not %errorlevel%==0 (
  echo [INFO] Requesting Administrator elevation...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -Verb RunAs -ArgumentList '/c ""%~f0"" %*'"
  exit /b 0
)

if "%~1"=="" goto prompt

REM Pass-through mode: allows scripted usage with args.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Unblock-File -Path '%PS1%' -ErrorAction SilentlyContinue; & '%PS1%' %*"
exit /b %errorlevel%

:prompt
set "USERNAME_INPUT=40493"
set /p "USERNAME_INPUT=Windows username [40493]: "
if "%USERNAME_INPUT%"=="" set "USERNAME_INPUT=40493"

set "PUBKEY_INPUT="
if exist "%KEY_FILE%" (
  for /f "usebackq delims=" %%K in ("%KEY_FILE%") do (
    if not defined PUBKEY_INPUT set "PUBKEY_INPUT=%%K"
  )
)
if defined PUBKEY_INPUT (
  echo [INFO] Loaded public key from %KEY_FILE%
) else (
  set /p "PUBKEY_INPUT=Public key (ssh-ed25519 ...): "
)
if "%PUBKEY_INPUT%"=="" (
  echo [ERROR] Public key is required.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Unblock-File -Path '%PS1%' -ErrorAction SilentlyContinue; & '%PS1%' -UserName '%USERNAME_INPUT%' -PublicKey '%PUBKEY_INPUT%'"
exit /b %errorlevel%
