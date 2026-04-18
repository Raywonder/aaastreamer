param(
    [string]$KeyFile,
    [string[]]$PublicKey,
    [switch]$EnableTailscaleSSH
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
    param(
        [string[]]$InlineKeys,
        [string]$Path
    )

    $keys = New-Object System.Collections.Generic.List[string]

    if ($InlineKeys) {
        foreach ($k in $InlineKeys) {
            $trimmed = $k.Trim()
            if ($trimmed) { $keys.Add($trimmed) }
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
        Write-Host 'Installing OpenSSH.Server Windows capability...'
        Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
    }

    Start-Service sshd
    Set-Service sshd -StartupType Automatic
}

function Ensure-SshFirewallRule {
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

    foreach ($key in $Keys) {
        if ($existing -notcontains $key) {
            Add-Content -Path $authFile -Value $key
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

Write-Host 'Configuring Windows OpenSSH server...'
Ensure-OpenSshServer
Ensure-SshFirewallRule
Ensure-AuthorizedKeys -Keys $keys

if ($EnableTailscaleSSH) {
    if (Get-Command tailscale -ErrorAction SilentlyContinue) {
        tailscale set --ssh
        Write-Host 'Tailscale SSH enabled.'
    } else {
        Write-Warning 'tailscale CLI not found; skipped tailscale set --ssh.'
    }
}

Restart-Service sshd

$listener = Get-NetTCPConnection -LocalPort 22 -State Listen -ErrorAction SilentlyContinue
if (-not $listener) {
    throw 'sshd is not listening on port 22 after setup.'
}

Write-Host ''
Write-Host 'OpenSSH setup complete.'
Write-Host "User: $env:USERNAME"
Write-Host "Computer: $env:COMPUTERNAME"
Write-Host "Key source: $KeyFile"
Write-Host 'Try from remote host: ssh <username>@<windows-ip-or-tailscale-ip>'
