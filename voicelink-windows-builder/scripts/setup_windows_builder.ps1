param(
    [string]$ProjectRoot = "$env:USERPROFILE\dev\apps\voicelink-local\windows-native",
    [string]$KeyFile,
    [switch]$EnableTailscaleSSH,
    [switch]$InstallDotnet8,
    [switch]$InstallWiX,
    [switch]$RunBuild,
    [string]$Version = '1.0.0'
)

$ErrorActionPreference = 'Stop'

if (-not $KeyFile) {
    $localKey = Join-Path (Join-Path $PSScriptRoot '..') '.local\key.txt'
    if (Test-Path $localKey) {
        $KeyFile = $localKey
    } else {
        $KeyFile = Join-Path $PSScriptRoot 'key.template.txt'
    }
}

$sshScript = Join-Path $PSScriptRoot 'bootstrap_windows_openssh.ps1'
$buildScript = Join-Path $PSScriptRoot 'build_windows_installers.ps1'

Write-Host '--- VoiceLink Windows Builder Bootstrap ---'
Write-Host "ProjectRoot: $ProjectRoot"
Write-Host "KeyFile: $KeyFile"

& $sshScript -KeyFile $KeyFile -EnableTailscaleSSH:$EnableTailscaleSSH

if ($InstallDotnet8) {
    if (Get-Command dotnet -ErrorAction SilentlyContinue) {
        Write-Host 'dotnet already installed.'
    } elseif (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host 'Installing .NET 8 SDK with winget...'
        winget install --id Microsoft.DotNet.SDK.8 --silent --accept-package-agreements --accept-source-agreements
    } else {
        Write-Warning 'winget not found; install .NET 8 SDK manually from https://dotnet.microsoft.com/download/dotnet/8.0'
    }
}

if ($InstallWiX) {
    if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
        Write-Warning 'dotnet not found; cannot install WiX tool yet.'
    } else {
        $env:Path = "$env:USERPROFILE\.dotnet\tools;$env:Path"
        if (-not (Get-Command wix -ErrorAction SilentlyContinue)) {
            Write-Host 'Installing WiX tool...'
            dotnet tool install --global wix
        } else {
            Write-Host 'WiX already installed.'
        }
    }
}

if ($RunBuild) {
    & $buildScript -Version $Version -ProjectRoot $ProjectRoot
}

Write-Host ''
Write-Host 'Bootstrap complete.'
if (-not $RunBuild) {
    Write-Host 'Next: run run-build.bat <version> [projectRoot]'
}
