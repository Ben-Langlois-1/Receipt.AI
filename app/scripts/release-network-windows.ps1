param([ValidateSet('Enable','Disable')][string]$Mode, [string]$Directory, [string]$Group)
$ErrorActionPreference = 'Stop'
if ($Group -notmatch '^ReceiptAI-Test-[0-9]+$') { throw 'Invalid test firewall group' }
if ($Mode -eq 'Disable') {
  Get-NetFirewallRule -Group $Group -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  $stateFile = Join-Path $Directory '..\firewall-state.json'
  if (Test-Path $stateFile) {
    foreach ($old in @(Get-Content $stateFile -Raw | ConvertFrom-Json)) {
      $enabled = if ($old.Enabled) { 'True' } else { 'False' }
      Set-NetFirewallProfile -Name $old.Name -Enabled $enabled
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
# Canonical IPv4 CIDRs exclude 127/8. Separate rules cover routable IPv6
# unicast, local and multicast destinations. The app uses IPv4 loopback.
$outsideIPv4 = @('0.0.0.0/2','64.0.0.0/3','96.0.0.0/4','112.0.0.0/5','120.0.0.0/6','124.0.0.0/7','126.0.0.0/8','128.0.0.0/1')
$outsideIPv6 = @('2000::/3','fc00::/7','fe80::/10','ff00::/8')
$index = 0
foreach ($relative in @('receipt-ai.exe', 'resources\native\win32-x64\llama-server.exe')) {
  $program = Join-Path $Directory $relative
  if (!(Test-Path $program)) { throw "Installed executable missing: $relative" }
  $index++
  New-NetFirewallRule -DisplayName "$Group-$index-v4" -Group $Group -Direction Outbound -Action Block -Profile Any -Program $program -RemoteAddress $outsideIPv4 | Out-Null
  New-NetFirewallRule -DisplayName "$Group-$index-v6" -Group $Group -Direction Outbound -Action Block -Profile Any -Program $program -RemoteAddress $outsideIPv6 | Out-Null
}
