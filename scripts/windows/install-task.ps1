param(
    [Parameter(Mandatory = $true)][string]$ListenIp,
    [int]$ListenPort = 3780,
    [int]$TargetPort = 3773,
    [string[]]$Allow = @(),
    [string]$TaskName = 'T3-Code-Forwarder'
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$configPath = Join-Path $repoRoot 'config.json'
$startScript = Join-Path $PSScriptRoot 'start-forwarder.ps1'

$config = [ordered]@{
    listenIp       = $ListenIp
    listenPort     = $ListenPort
    targetHost     = '127.0.0.1'
    targetPort     = $TargetPort
    autoTargetPort = $true
    allow          = @($Allow | Where-Object { $_ -and $_.Trim() })
}
[IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
Write-Host "Saved config to $configPath"

# Restart any already-running forwarder for this repo so new settings apply immediately.
$cli = Join-Path $repoRoot 'src\cli.mjs'
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match [regex]::Escape($cli) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`" -ConfigPath `"$configPath`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "Registered and started scheduled task '$TaskName'."
