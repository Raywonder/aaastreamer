param(
    [string]$KeyFile,
    [string[]]$PublicKey,
    [switch]$EnableTailscaleSSH,
    [switch]$InstallDotnet8,
    [switch]$InstallWiX,
    [switch]$InstallGitLfs
)

$ErrorActionPreference = 'Stop'

function Assert-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run this script in an elevated PowerShell session (Run as Administrator).'
    }
}

function Get-PublicKeys {
    param([string[]]$InlineKeys, [string]$Path)
    $keys = New-Object System.Collections.Generic.List[string]

    if ($InlineKeys) {
        foreach ($k in $InlineKeys) {
            $v = $k.Trim()
            if ($v) { $keys.Add($v) }
        }
    }

    if ($Path -and (Test-Path $Path)) {
        Get-Content -Path $Path |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ -and -not $_.StartsWith('#') } |
            ForEach-Object { $keys.Add($_) }
    }

    $distinct = $keys | Select-Object -Unique
    if (-not $distinct -or $distinct.Count -eq 0) {
        throw 'No SSH public keys found. Pass -PublicKey or populate key.txt.'
    }

    return $distinct
}

function Ensure-OpenSshServer {
    $sshd = Get-Service sshd -ErrorAction SilentlyContinue
    if (-not $sshd) {
        Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
    }
    Start-Service sshd
    Set-Service sshd -StartupType Automatic

    $rule = Get-NetFirewallRule -Name sshd -ErrorAction SilentlyContinue
    if (-not $rule) {
        New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
    }
}

function Ensure-AuthorizedKeys {
    param([string[]]$Keys)

    $user = $env:USERNAME
    $sshDir = "C:\Users\$user\.ssh"
    $authFile = Join-Path $sshDir 'authorized_keys'

    New-Item -ItemType Directory -Force -Path $sshDir | Out-Null

    $existing = @()
    if (Test-Path $authFile) {
        $existing = Get-Content -Path $authFile
    }

    foreach ($k in $Keys) {
        if ($existing -notcontains $k) {
            Add-Content -Path $authFile -Value $k
        }
    }

    & icacls $sshDir /inheritance:r /grant "$user:(OI)(CI)F" | Out-Null
    & icacls $authFile /inheritance:r /grant "$user:F" | Out-Null
}

Assert-Admin

if (-not $KeyFile) {
    $localKey = Join-Path (Join-Path $PSScriptRoot '..') '.local\key.txt'
    if (Test-Path $localKey) {
        $KeyFile = $localKey
    } else {
        $KeyFile = Join-Path $PSScriptRoot 'key.template.txt'
    }
}

$keys = Get-PublicKeys -InlineKeys $PublicKey -Path $KeyFile
Ensure-OpenSshServer
Ensure-AuthorizedKeys -Keys $keys

if ($EnableTailscaleSSH) {
    if (Get-Command tailscale -ErrorAction SilentlyContinue) {
        tailscale set --ssh
    }
}

if ($InstallDotnet8) {
    if (-not (Get-Command dotnet -ErrorAction SilentlyContinue) -and (Get-Command winget -ErrorAction SilentlyContinue)) {
        winget install --id Microsoft.DotNet.SDK.8 --silent --accept-package-agreements --accept-source-agreements
    }
}

if ($InstallWiX) {
    if (Get-Command dotnet -ErrorAction SilentlyContinue) {
        $env:Path = "$env:USERPROFILE\.dotnet\tools;$env:Path"
        if (-not (Get-Command wix -ErrorAction SilentlyContinue)) {
            dotnet tool install --global wix
        }
    }
}

if ($InstallGitLfs) {
    $hasLfs = $false
    if (Get-Command git -ErrorAction SilentlyContinue) {
        $null = & git lfs version 2>$null
        if ($LASTEXITCODE -eq 0) { $hasLfs = $true }
    }
    if (-not $hasLfs -and (Get-Command winget -ErrorAction SilentlyContinue)) {
        winget install --id GitHub.GitLFS --silent --accept-package-agreements --accept-source-agreements
    }
    if (Get-Command git -ErrorAction SilentlyContinue) {
        $null = & git lfs version 2>$null
        if ($LASTEXITCODE -eq 0) {
            git lfs install --skip-repo
        }
    }
}

Restart-Service sshd
Write-Host "Host bootstrap complete for $env:COMPUTERNAME ($env:USERNAME)."
