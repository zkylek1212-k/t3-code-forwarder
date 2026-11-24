param(
    [string]$ConfigPath = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'config.json')
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$cli = Join-Path $repoRoot 'src\cli.mjs'
$node = (Get-Command node -ErrorAction Stop).Source

$running = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match [regex]::Escape($cli) }
if (-not $running) {
    Start-Process -FilePath $node -WorkingDirectory $repoRoot -ArgumentList "`"$cli`" --config `"$ConfigPath`"" -WindowStyle Hidden
}
