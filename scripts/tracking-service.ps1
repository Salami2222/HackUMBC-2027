param(
  [ValidateSet('status', 'restart')][string]$Action = 'status',
  [Parameter(Mandatory = $true)][string]$RuntimePath,
  [string]$JavaPath = 'java'
)
$ErrorActionPreference = 'Stop'
try {
  $runtimeDir = (Resolve-Path -LiteralPath $RuntimePath).Path
  $jarPath = Join-Path $runtimeDir 'slimevr.jar'
  $pidPath = Join-Path $runtimeDir 'server.pid'
  if (-not (Test-Path -LiteralPath $jarPath -PathType Leaf)) { throw 'Tracking service JAR was not found.' }
  $javaExe = (Get-Command $JavaPath -ErrorAction Stop).Source
  $serviceProcess = $null
  if (Test-Path -LiteralPath $pidPath) {
    $serviceId = 0
    if (-not [int]::TryParse((Get-Content -LiteralPath $pidPath -Raw).Trim(), [ref]$serviceId)) { throw 'Invalid tracking service PID file.' }
    $serviceProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$serviceId"
    if ($serviceProcess) {
      $absoluteJar = [regex]::Escape($jarPath)
      $isOurJar = $serviceProcess.CommandLine -match "(?i)-jar\s+`"?$absoluteJar`"?\s+run(?:\s|$)"
      # Adopt the existing launcher only when both its saved PID and API owner match.
      $legacyJar = $serviceProcess.CommandLine -match '(?i)-jar\s+"?slimevr\.jar"?\s+run(?:\s|$)'
      $apiOwner = @(Get-NetTCPConnection -LocalPort 21110 -State Listen -ErrorAction SilentlyContinue | Where-Object OwningProcess -eq $serviceId).Count -gt 0
      if ($serviceProcess.Name -notmatch '^javaw?\.exe$' -or (-not $isOurJar -and -not ($legacyJar -and $apiOwner))) {
        throw 'Saved PID belongs to an unrecognized process; refusing to stop it.'
      }
      if ($JavaPath -eq 'java' -and $serviceProcess.ExecutablePath) { $javaExe = $serviceProcess.ExecutablePath }
    }
  }
  if ($Action -eq 'restart') {
    $occupied = @(
      Get-NetTCPConnection -LocalPort 21110 -State Listen -ErrorAction SilentlyContinue
      Get-NetUDPEndpoint -LocalPort 6969 -ErrorAction SilentlyContinue
    ) | Where-Object { -not $serviceProcess -or $_.OwningProcess -ne $serviceProcess.ProcessId }
    if ($occupied) { throw 'Another process owns a tracking port. No process was stopped.' }
    if ($serviceProcess) {
      Stop-Process -Id $serviceProcess.ProcessId -Force -ErrorAction Stop
      Wait-Process -Id $serviceProcess.ProcessId -Timeout 10 -ErrorAction SilentlyContinue
    }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $started = Start-Process -FilePath $javaExe -ArgumentList @('-jar', ('"' + $jarPath + '"'), 'run') -WorkingDirectory $runtimeDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir "stdout-$stamp.log") -RedirectStandardError (Join-Path $runtimeDir "stderr-$stamp.log")
    Set-Content -LiteralPath $pidPath -Value $started.Id
    $serviceProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($started.Id)"
    $deadline = (Get-Date).AddSeconds(25)
    do {
      $udpReady = @(Get-NetUDPEndpoint -LocalPort 6969 -ErrorAction SilentlyContinue | Where-Object OwningProcess -eq $started.Id).Count -gt 0
      $apiReady = @(Get-NetTCPConnection -LocalPort 21110 -State Listen -ErrorAction SilentlyContinue | Where-Object OwningProcess -eq $started.Id).Count -gt 0
      if ($udpReady -and $apiReady) { break }
      if (-not (Get-Process -Id $started.Id -ErrorAction SilentlyContinue)) { throw 'Tracking service exited during startup. Check its local runtime logs.' }
      Start-Sleep -Milliseconds 300
    } while ((Get-Date) -lt $deadline)
    if (-not ($udpReady -and $apiReady)) { throw 'Service started but its receiver did not become ready. Check its local runtime logs.' }
  }
  $receiverReady = $false
  $apiReady = $false
  if ($serviceProcess) {
    $receiverReady = @(Get-NetUDPEndpoint -LocalPort 6969 -ErrorAction SilentlyContinue | Where-Object OwningProcess -eq $serviceProcess.ProcessId).Count -gt 0
    $apiReady = @(Get-NetTCPConnection -LocalPort 21110 -State Listen -ErrorAction SilentlyContinue | Where-Object OwningProcess -eq $serviceProcess.ProcessId).Count -gt 0
  }
  @{ available = $true; receiverReady = $receiverReady; apiReady = $apiReady } | ConvertTo-Json -Compress
} catch {
  @{ available = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
  exit 1
}
