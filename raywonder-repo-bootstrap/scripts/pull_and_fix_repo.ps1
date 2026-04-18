param(
    [string]$RepoRoot,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = (Get-Location).Path
}

if (-not (Test-Path (Join-Path $RepoRoot '.git'))) {
    throw "Not a git repository: $RepoRoot"
}

Push-Location $RepoRoot
try {
    git -c credential.helper= pull --ff-only
} finally {
    Pop-Location
}

$shFiles = Get-ChildItem -Path $RepoRoot -Filter '*.sh' -File -Recurse -ErrorAction SilentlyContinue
$fixed = 0

foreach ($file in $shFiles) {
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
        Write-Host 'No shell script fixes needed.'
    } else {
        Write-Host "Normalized $fixed shell script file(s)."
    }
}
