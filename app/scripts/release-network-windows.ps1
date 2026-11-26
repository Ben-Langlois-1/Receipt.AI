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

# Hosted runners expose TEMP as an 8.3 short path (C:\Users\RUNNER~1\...).
# Windows Firewall cannot resolve a short-name -Program (error 87) and matches
# processes by their long image path, so expand program paths first.
function Get-LongPath([string]$Path) {
  if (-not ('ReceiptAI.NativePath' -as [type])) {
    Add-Type -Namespace ReceiptAI -Name NativePath -MemberDefinition '[DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern uint GetLongPathName(string shortPath, System.Text.StringBuilder longPath, uint bufferLength);'
  }
  $buffer = New-Object System.Text.StringBuilder 32768
  $length = [ReceiptAI.NativePath]::GetLongPathName($Path, $buffer, [uint32]$buffer.Capacity)
  if ($length -eq 0 -or $length -ge $buffer.Capacity) { throw "Could not resolve long path for $Path" }
  $buffer.ToString()
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
  # IPv4 ranges exclude non-routable 0/8 and loopback 127/8. Separate ranges
  # cover routable IPv6 unicast, local and multicast destinations. The app
  # uses IPv4 loopback. Documented address-range syntax expresses the same
  # scopes as the equivalent CIDRs.
  $outsideAddresses = @(
    '1.0.0.0-126.255.255.255',
    '128.0.0.0-255.255.255.255',
    '2000::-3fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
    'fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
    'fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
    'ff00::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'
  )
  $ruleIndex = 0
  foreach ($relative in @('receipt-ai.exe', 'resources\native\win32-x64\llama-server.exe')) {
    $program = Join-Path $Directory $relative
    if (!(Test-Path $program)) { throw "Installed executable missing: $relative" }
    $program = Get-LongPath $program
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
