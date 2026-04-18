param(
    [string]$Version = "1.0.0",
    [string]$ProjectRoot = "$env:USERPROFILE\dev\apps\voicelink-local\windows-native"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ProjectRoot)) {
    throw "ProjectRoot not found: $ProjectRoot"
}

$Project = Join-Path $ProjectRoot "VoiceLinkNative/VoiceLinkNative.csproj"
$PublishDir = Join-Path $ProjectRoot "publish/win-x64"
$DistDir = Join-Path $ProjectRoot "dist"
$WixMsi = Join-Path $ProjectRoot "installer/wix/VoiceLink.msi.wxs"
$WixBundle = Join-Path $ProjectRoot "installer/wix/VoiceLink.bundle.wxs"

if (-not (Test-Path $Project)) { throw "Missing project file: $Project" }
if (-not (Test-Path $WixMsi)) { throw "Missing WiX MSI file: $WixMsi" }
if (-not (Test-Path $WixBundle)) { throw "Missing WiX bundle file: $WixBundle" }

New-Item -ItemType Directory -Path $DistDir -Force | Out-Null

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw "dotnet SDK is required. Install .NET 8 SDK first."
}

$env:Path = "$env:USERPROFILE\.dotnet\tools;$env:Path"
if (-not (Get-Command wix -ErrorAction SilentlyContinue)) {
    dotnet tool install --global wix
}

wix extension add WixToolset.UI.wixext | Out-Null
wix extension add WixToolset.Bal.wixext | Out-Null

dotnet restore $Project
dotnet publish $Project -c Release -r win-x64 --self-contained true -o $PublishDir /p:PublishSingleFile=true

$MsiOut = Join-Path $DistDir "VoiceLinkNative-$Version-win-x64.msi"
$ExeOut = Join-Path $DistDir "VoiceLinkNative-$Version-setup.exe"

wix build $WixMsi -arch x64 -d Version=$Version -o $MsiOut
wix build $WixBundle -arch x64 -ext WixToolset.Bal.wixext -d Version=$Version -o $ExeOut

Write-Host "Built artifacts:" -ForegroundColor Green
Get-Item $MsiOut, $ExeOut | Select-Object FullName, Length, LastWriteTime
