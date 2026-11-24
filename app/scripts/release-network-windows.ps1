param([ValidateSet('Enable','Disable')][string]$Mode, [string]$Directory, [string]$Group)
$ErrorActionPreference = 'Stop'
if ($Group -notmatch '^ReceiptAI-Test-[0-9]+$') { throw 'Invalid test firewall group' }

$stateFile = Join-Path $Directory '..\firewall-state.json'
function Restore-TestFirewallState {
  $cleanupErrors = @()
  try {
    Get-NetFirewallRule -Group $Group -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction Stop
  } catch {
    $cleanupErrors += "remove test rules: $($_.Exception.Message)"
  }
  if (Test-Path $stateFile) {
    $profileRestoreFailed = $false
    foreach ($old in @(Get-Content $stateFile -Raw | ConvertFrom-Json)) {
      try {
        $enabled = if ($old.Enabled) { 'True' } else { 'False' }
        Set-NetFirewallProfile -Name $old.Name -Enabled $enabled
      } catch {
        $profileRestoreFailed = $true
        $cleanupErrors += "restore $($old.Name) firewall profile: $($_.Exception.Message)"
      }
    }
    if (!$profileRestoreFailed) {
      try { Remove-Item -LiteralPath $stateFile -Force } catch { $cleanupErrors += "remove saved firewall state: $($_.Exception.Message)" }
    }
  }
  if ($cleanupErrors.Count -gt 0) { throw ($cleanupErrors -join '; ') }
  Write-Output "Removed test firewall rules and restored profile state for $Group."
}

if ($Mode -eq 'Disable') {
  Restore-TestFirewallState
  exit 0
}

try {
  $profiles = @(Get-NetFirewallProfile)
  $disabled = @($profiles | Where-Object { $_.Enabled -ne 'True' })
  if ($disabled.Count -gt 0 -and $env:GITHUB_ACTIONS -ne 'true') {
    throw 'Offline verification needs active Windows Firewall profiles. Automatic profile changes are restricted to disposable GitHub runners.'
  }
  $profiles | ForEach-Object { @{ Name = $_.Name; Enabled = ($_.Enabled -eq 'True') } } | ConvertTo-Json | Set-Content $stateFile
  if ($disabled.Count -gt 0) { Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True }
  if (@(Get-NetFirewallProfile | Where-Object { $_.Enabled -ne 'True' }).Count -gt 0) { throw 'Windows Firewall enforcement is unavailable.' }
  Get-NetFirewallProfile | Select-Object Name,Enabled | ConvertTo-Json | Write-Output

  # Process-specific rules preserve runner connectivity and all loopback traffic.
  # Canonical IPv4 CIDRs exclude non-routable 0/8 and loopback 127/8. Separate
  # rules cover routable IPv6 unicast, local and multicast destinations. The
  # app uses IPv4 loopback. Server 2022 rejects a 0.0.0.0/2 RemoteAddress with
  # error 87, so cover its routable portion with equivalent nonzero prefixes.
  $outsideAddresses = @(
    '1.0.0.0/8','2.0.0.0/7','4.0.0.0/6','8.0.0.0/5','16.0.0.0/4','32.0.0.0/3',
    '64.0.0.0/3','96.0.0.0/4','112.0.0.0/5',
    '120.0.0.0/6','124.0.0.0/7','126.0.0.0/8','128.0.0.0/1',
    '2000::/3','fc00::/7','fe80::/10','ff00::/8'
  )
  $ruleIndex = 0
  foreach ($relative in @('receipt-ai.exe', 'resources\native\win32-x64\llama-server.exe')) {
    $program = Join-Path $Directory $relative
    if (!(Test-Path $program)) { throw "Installed executable missing: $relative" }
    foreach ($address in $outsideAddresses) {
      $ruleIndex++
      try {
        New-NetFirewallRule -DisplayName "$Group-$ruleIndex" -Group $Group -Direction Outbound -Action Block -Profile Any -Program $program -RemoteAddress $address | Out-Null
      } catch {
        throw "New-NetFirewallRule rejected Program='$program' RemoteAddress='$address': $($_.Exception.Message)"
      }
    }
  }
  $installedRules = @(Get-NetFirewallRule -Group $Group -ErrorAction Stop)
  if ($installedRules.Count -ne $ruleIndex) { throw "Expected $ruleIndex test firewall rules, found $($installedRules.Count)." }
  Write-Output "Installed $ruleIndex scoped outbound block rules for offline verification."
} catch {
  $enableError = $_
  try { Restore-TestFirewallState } catch { Write-Warning "Firewall rollback failed: $($_.Exception.Message)" }
  throw $enableError
}
