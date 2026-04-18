param(
    [string]$Root,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

if (-not $Root) {
    $Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}
$Root = $Root.Trim().Trim('"')
if ($Root.EndsWith('\') -or $Root.EndsWith('/')) {
    $Root = $Root.Substring(0, $Root.Length - 1)
}

if (-not (Test-Path -LiteralPath $Root)) {
    throw "Root path does not exist: $Root"
}

$scriptDir = Join-Path $Root 'scripts'
if (-not (Test-Path -LiteralPath $scriptDir)) {
    throw "Scripts directory not found: $scriptDir"
}

$targets = Get-ChildItem -LiteralPath $scriptDir -Filter '*.sh' -File -Recurse
$fixed = 0

foreach ($file in $targets) {
    $raw = [System.IO.File]::ReadAllText($file.FullName)
    if ($raw.Contains("`r`n")) {
        $normalized = $raw -replace "`r`n", "`n"
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($file.FullName, $normalized, $utf8NoBom)
        $fixed++
        if (-not $Quiet) { Write-Host "Fixed CRLF -> LF: $($file.FullName)" }
    }
}

if (-not $Quiet) {
    if ($fixed -eq 0) {
        Write-Host 'No .sh line ending fixes were needed.'
    } else {
        Write-Host "Normalized $fixed shell script file(s)."
    }
}
