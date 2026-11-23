param([ValidateSet('Enable','Disable')][string]$Mode, [string]$Directory, [string]$Group)
$ErrorActionPreference = 'Stop'
if ($Group -notmatch '^ReceiptAI-Test-[0-9]+$') { throw 'Invalid test firewall group' }
if ($Mode -eq 'Disable') {
  Get-NetFirewallRule -Group $Group -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  exit 0
}
# Process-specific rules preserve runner connectivity and all loopback traffic.
$outsideLoopback = @('0.0.0.0-126.255.255.255', '128.0.0.0-255.255.255.255', '::/0')
foreach ($relative in @('receipt-ai.exe', 'resources\native\win32-x64\llama-server.exe')) {
  $program = Join-Path $Directory $relative
  if (!(Test-Path $program)) { throw "Installed executable missing: $relative" }
  New-NetFirewallRule -DisplayName "$Group-$relative" -Group $Group -Direction Outbound -Action Block -Program $program -RemoteAddress $outsideLoopback | Out-Null
}
