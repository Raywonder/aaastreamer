param(
    [string]$PublicKey = "",
    [string]$UserName = $env:USERNAME,
    [int]$Port = 22
)

$ErrorActionPreference = "Stop"

function Step([string]$msg) {
    Write-Host $msg -ForegroundColor Cyan
}

function Ok([string]$msg) {
    Write-Host "[OK] $msg" -ForegroundColor Green
}

function Info([string]$msg) {
    Write-Host "[INFO] $msg" -ForegroundColor Yellow
}

function Warn([string]$msg) {
    Write-Host "[WARN] $msg" -ForegroundColor Yellow
}

Write-Host "============================================================="
Write-Host " VoiceLink Remote Build - Windows SSH Bootstrap"
Write-Host "============================================================="
Write-Host ""

if ([string]::IsNullOrWhiteSpace($PublicKey)) {
    throw "PublicKey is required. Pass -PublicKey 'ssh-ed25519 ...'"
}

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).
    IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "Run this script in an elevated PowerShell session (Run as Administrator)."
}

Step "[1/8] Checking OpenSSH Server capability..."
$cap = Get-WindowsCapability -Online | Where-Object Name -like "OpenSSH.Server*"
if (-not $cap) {
    throw "OpenSSH Server capability not found on this Windows version."
}
Info "Capability State: $($cap.State)"
if ($cap.State -ne "Installed") {
    Add-WindowsCapability -Online -Name $cap.Name | Out-Null
    Ok "OpenSSH Server installed."
} else {
    Ok "OpenSSH Server already installed."
}

Step "[2/8] Configuring sshd service startup..."
Set-Service -Name sshd -StartupType Automatic
Ok "sshd service set to Automatic."

Step "[3/8] Starting sshd service..."
Start-Service sshd
Ok "sshd service started."

Step "[4/8] Ensuring firewall rule for TCP $Port..."
$ruleName = "OpenSSH-Server-In-TCP"
$existingRule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if (-not $existingRule) {
    New-NetFirewallRule -Name $ruleName -DisplayName "OpenSSH Server (sshd)" -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort $Port | Out-Null
    Ok "Firewall rule created."
} else {
    Ok "Firewall rule already exists."
}

Step "[5/8] Resolving profile path for user '$UserName'..."
$userProfilePath = "C:\Users\$UserName"
if (-not (Test-Path $userProfilePath)) {
    throw "User profile path not found: $userProfilePath"
}
Ok "Using profile path: $userProfilePath"

Step "[6/8] Creating .ssh folder and authorized_keys..."
$sshDir = Join-Path $userProfilePath ".ssh"
$authKeys = Join-Path $sshDir "authorized_keys"
if (-not (Test-Path $sshDir)) {
    New-Item -ItemType Directory -Path $sshDir -Force | Out-Null
}
if (-not (Test-Path $authKeys)) {
    New-Item -ItemType File -Path $authKeys -Force | Out-Null
}
Ok "SSH directory and authorized_keys are present."

Step "[7/8] Writing authorized_keys entry..."
$keyContent = Get-Content -Path $authKeys -Raw -ErrorAction SilentlyContinue
if ($keyContent -notmatch [Regex]::Escape($PublicKey.Trim())) {
    Add-Content -Path $authKeys -Value $PublicKey.Trim()
    Ok "Public key added."
} else {
    Ok "Public key already present."
}

Step "[8/8] Ensuring administrators_authorized_keys for admin-group matching..."
$adminAuthKeys = "C:\ProgramData\ssh\administrators_authorized_keys"
if (-not (Test-Path $adminAuthKeys)) {
    New-Item -ItemType File -Path $adminAuthKeys -Force | Out-Null
}
$adminKeyContent = Get-Content -Path $adminAuthKeys -Raw -ErrorAction SilentlyContinue
if ($adminKeyContent -notmatch [Regex]::Escape($PublicKey.Trim())) {
    Add-Content -Path $adminAuthKeys -Value $PublicKey.Trim()
    Ok "Public key added to administrators_authorized_keys."
} else {
    Ok "Public key already present in administrators_authorized_keys."
}

Step "[9/9] Applying ACLs to key files..."
icacls $sshDir /inheritance:r | Out-Null
icacls $sshDir /grant:r "${UserName}:(OI)(CI)F" "SYSTEM:(OI)(CI)F" | Out-Null
icacls $authKeys /inheritance:r | Out-Null
icacls $authKeys /grant:r "${UserName}:F" "SYSTEM:F" | Out-Null
icacls $adminAuthKeys /inheritance:r | Out-Null
icacls $adminAuthKeys /grant:r "Administrators:F" "SYSTEM:F" | Out-Null
Ok "ACLs applied."

Write-Host ""
Write-Host "Verifying TCP $Port listener..."
netstat -ano | Select-String ":$Port"

$tailscaleV4 = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -like "100.*" } |
    Select-Object -First 1 -ExpandProperty IPAddress)

if ([string]::IsNullOrWhiteSpace($tailscaleV4)) {
    Warn "No Tailscale IPv4 (100.x.x.x) detected. If Tailscale is installed, make sure it is connected."
} else {
    Ok "Detected Tailscale IP: $tailscaleV4"
}

Write-Host ""
Write-Host "[SUCCESS] Windows SSH is ready for remote build." -ForegroundColor Green
Write-Host "Use this SSH target from macOS:" -ForegroundColor White
if ([string]::IsNullOrWhiteSpace($tailscaleV4)) {
    Write-Host "  $UserName@<tailscale-ip>" -ForegroundColor White
} else {
    Write-Host "  $UserName@$tailscaleV4" -ForegroundColor White
}

$sshTarget = if ([string]::IsNullOrWhiteSpace($tailscaleV4)) { "$UserName@<tailscale-ip>" } else { "$UserName@$tailscaleV4" }
$userKeyPath = Join-Path $sshDir "authorized_keys"
$adminKeyPath = "C:\ProgramData\ssh\administrators_authorized_keys"
$clipReport = @(
    "VoiceLink Windows SSH Bootstrap Report"
    "whoami: $(whoami)"
    "computer: $env:COMPUTERNAME"
    "user_profile: $userProfilePath"
    "ssh_target: $sshTarget"
    "tailscale_ip: $tailscaleV4"
    "user_authorized_keys_exists: $(Test-Path $userKeyPath)"
    "admin_authorized_keys_exists: $(Test-Path $adminKeyPath)"
    "sshd_status: $((Get-Service sshd).Status)"
) -join [Environment]::NewLine

try {
    if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
        Set-Clipboard -Value $clipReport
    } else {
        $clipReport | clip.exe
    }
    Ok "Copied paste-ready SSH report to clipboard."
    Write-Host "Paste it into chat now." -ForegroundColor White
} catch {
    Warn "Could not copy report to clipboard: $($_.Exception.Message)"
}
