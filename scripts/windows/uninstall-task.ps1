param(
    [string]$TaskName = 'T3-Code-Forwarder'
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$cli = Join-Path $repoRoot 'src\cli.mjs'

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match [regex]::Escape($cli) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host "Stopped PID $($_.ProcessId)" }

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task '$TaskName'."
} else {
    Write-Host "Scheduled task '$TaskName' not found."
}
