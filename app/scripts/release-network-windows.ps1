param([ValidateSet('Enable','Disable')][string]$Mode, [string]$Directory, [string]$Group)
$ErrorActionPreference = 'Stop'
if ($Group -notmatch '^ReceiptAI-Test-[0-9]+$') { throw 'Invalid test firewall group' }
if ($Mode -eq 'Disable') {
  Get-NetFirewallRule -Group $Group -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  $stateFile = Join-Path $Directory '..\firewall-state.json'
  if (Test-Path $stateFile) {
    foreach ($old in @(Get-Content $stateFile -Raw | ConvertFrom-Json)) {
      Set-NetFirewallProfile -Name $old.Name -Enabled ([bool]$old.Enabled)
    }
  }
  exit 0
}
$profiles = @(Get-NetFirewallProfile)
$disabled = @($profiles | Where-Object { $_.Enabled -ne 'True' })
if ($disabled.Count -gt 0 -and $env:GITHUB_ACTIONS -ne 'true') {
  throw 'Offline verification needs active Windows Firewall profiles. Automatic profile changes are restricted to disposable GitHub runners.'
}
$profiles | ForEach-Object { @{ Name = $_.Name; Enabled = ($_.Enabled -eq 'True') } } | ConvertTo-Json | Set-Content (Join-Path $Directory '..\firewall-state.json')
if ($disabled.Count -gt 0) { Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True }
if (@(Get-NetFirewallProfile | Where-Object { $_.Enabled -ne 'True' }).Count -gt 0) { throw 'Windows Firewall enforcement is unavailable.' }
Get-NetFirewallProfile | Select-Object Name,Enabled | ConvertTo-Json | Write-Output
# Process-specific rules preserve runner connectivity and all loopback traffic.
# Windows rejects ::/0. Both /1 halves were validated on the native runner.
# Inference and inspector connections explicitly use IPv4 loopback.
$outsideLoopback = @('0.0.0.0-126.255.255.255', '128.0.0.0-255.255.255.255', '::/1', '8000::/1')
foreach ($relative in @('receipt-ai.exe', 'resources\native\win32-x64\llama-server.exe')) {
  $program = Join-Path $Directory $relative
  if (!(Test-Path $program)) { throw "Installed executable missing: $relative" }
  New-NetFirewallRule -DisplayName "$Group-$relative" -Group $Group -Direction Outbound -Action Block -Program $program -RemoteAddress $outsideLoopback | Out-Null
}
