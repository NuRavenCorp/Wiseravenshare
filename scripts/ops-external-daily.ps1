param(
    [string]$Domain = "wise-ravens.com",
    [string]$WwwDomain = "www.wise-ravens.com",
    [string]$ExpectedCanonicalHost = "wise-ravens.com",
    [string[]]$ExpectedNameservers = @(),
    [string]$ApiHealthUrl = "",
    [int]$TimeoutSec = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Add-Result {
    param(
        [System.Collections.Generic.List[object]]$List,
        [string]$Check,
        [string]$Status,
        [string]$Details
    )

    $List.Add([pscustomobject]@{
        check = $Check
        status = $Status
        details = $Details
    }) | Out-Null
}

function Invoke-HeaderCheck {
    param(
        [string]$Url,
        [int]$Timeout
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -Method Head -MaximumRedirection 5 -TimeoutSec $Timeout
        return [pscustomobject]@{ ok = $true; code = [int]$response.StatusCode; location = $response.Headers.Location }
    }
    catch {
        $ex = $_.Exception
        $message = $ex.Message
        $code = $null
        $location = $null

        if ($ex.PSObject.Properties.Name -contains "Response" -and $null -ne $ex.Response) {
            try { $code = [int]$ex.Response.StatusCode } catch {}
            try { $location = $ex.Response.Headers.Location } catch {}
        }

        return [pscustomobject]@{ ok = $false; code = $code; location = $location; error = $message }
    }
}

$results = [System.Collections.Generic.List[object]]::new()

# 1) NS delegation
try {
    $nsRecords = Resolve-DnsName -Name $Domain -Type NS |
        Where-Object { $_.Section -eq "Answer" -and ($_.PSObject.Properties.Name -contains "NameHost") } |
        Select-Object -ExpandProperty NameHost
    $nsSorted = $nsRecords | Sort-Object
    Add-Result -List $results -Check "dns_ns" -Status "ok" -Details ($nsSorted -join ", ")

    if ($ExpectedNameservers.Count -gt 0) {
        $expected = $ExpectedNameservers | ForEach-Object { $_.ToLowerInvariant().TrimEnd('.') } | Sort-Object
        $actual = $nsSorted | ForEach-Object { $_.ToLowerInvariant().TrimEnd('.') } | Sort-Object

        $expectedJoined = $expected -join ","
        $actualJoined = $actual -join ","

        if ($expectedJoined -ne $actualJoined) {
            Add-Result -List $results -Check "dns_ns_expected" -Status "warn" -Details "Expected: $($expected -join ', ') | Actual: $($actual -join ', ')"
        }
        else {
            Add-Result -List $results -Check "dns_ns_expected" -Status "ok" -Details "Delegation matches expected nameservers"
        }
    }
}
catch {
    Add-Result -List $results -Check "dns_ns" -Status "fail" -Details $_.Exception.Message
}

# 2) A/AAAA for apex
foreach ($recordType in @("A", "AAAA")) {
    try {
        $records = Resolve-DnsName -Name $Domain -Type $recordType | Where-Object { $_.Section -eq "Answer" }
        $ips = $records | ForEach-Object {
            if ($recordType -eq "A") {
                if ($_.PSObject.Properties.Name -contains "IPAddress") { $_.IPAddress } elseif ($_.PSObject.Properties.Name -contains "IP4Address") { $_.IP4Address } else { $null }
            }
            else {
                if ($_.PSObject.Properties.Name -contains "IPAddress") { $_.IPAddress } elseif ($_.PSObject.Properties.Name -contains "IP6Address") { $_.IP6Address } else { $null }
            }
        } | Where-Object { $_ }

        if (-not $ips -or $ips.Count -eq 0) {
            Add-Result -List $results -Check "dns_$($recordType.ToLowerInvariant())" -Status "fail" -Details "No $recordType record values returned"
        }
        else {
            Add-Result -List $results -Check "dns_$($recordType.ToLowerInvariant())" -Status "ok" -Details ($ips -join ", ")
        }
    }
    catch {
        Add-Result -List $results -Check "dns_$($recordType.ToLowerInvariant())" -Status "fail" -Details $_.Exception.Message
    }
}

# 3) WWW CNAME and target
try {
    $cname = Resolve-DnsName -Name $WwwDomain -Type CNAME |
        Where-Object { $_.Section -eq "Answer" -and ($_.PSObject.Properties.Name -contains "NameHost") } |
        Select-Object -First 1 -ExpandProperty NameHost
    if ($null -eq $cname -or [string]::IsNullOrWhiteSpace($cname)) {
        Add-Result -List $results -Check "dns_www_cname" -Status "warn" -Details "No CNAME found for $WwwDomain"
    }
    else {
        Add-Result -List $results -Check "dns_www_cname" -Status "ok" -Details "$WwwDomain -> $cname"
    }
}
catch {
    Add-Result -List $results -Check "dns_www_cname" -Status "warn" -Details $_.Exception.Message
}

# 4) HTTP and HTTPS checks
$httpsApex = Invoke-HeaderCheck -Url "https://$Domain" -Timeout $TimeoutSec
if ($httpsApex.ok) {
    Add-Result -List $results -Check "https_apex" -Status "ok" -Details "HTTP $($httpsApex.code)"
}
else {
    Add-Result -List $results -Check "https_apex" -Status "fail" -Details "Error: $($httpsApex.error)"
}

$httpsWww = Invoke-HeaderCheck -Url "https://$WwwDomain" -Timeout $TimeoutSec
if ($httpsWww.ok) {
    Add-Result -List $results -Check "https_www" -Status "ok" -Details "HTTP $($httpsWww.code)"
}
else {
    Add-Result -List $results -Check "https_www" -Status "fail" -Details "Error: $($httpsWww.error)"
}

if ($httpsWww.location) {
    $expectedLocation = "https://$ExpectedCanonicalHost/"
    if ($httpsWww.location -like "https://$ExpectedCanonicalHost*") {
        Add-Result -List $results -Check "canonical_redirect" -Status "ok" -Details "www redirects to $($httpsWww.location)"
    }
    else {
        Add-Result -List $results -Check "canonical_redirect" -Status "warn" -Details "Unexpected redirect target: $($httpsWww.location)"
    }
}

if (-not [string]::IsNullOrWhiteSpace($ApiHealthUrl)) {
    $apiHealth = Invoke-HeaderCheck -Url $ApiHealthUrl -Timeout $TimeoutSec
    if ($apiHealth.ok) {
        Add-Result -List $results -Check "api_health" -Status "ok" -Details "HTTP $($apiHealth.code)"
    }
    else {
        Add-Result -List $results -Check "api_health" -Status "fail" -Details "Error: $($apiHealth.error)"
    }
}

# Print report
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ssK"
Write-Host "Ops external daily report - $timestamp"
$results | Format-Table -AutoSize

$failCount = ($results | Where-Object { $_.status -eq "fail" }).Count
$warnCount = ($results | Where-Object { $_.status -eq "warn" }).Count

Write-Host "Summary: fail=$failCount warn=$warnCount"

if ($failCount -gt 0) {
    exit 2
}
elseif ($warnCount -gt 0) {
    exit 1
}

exit 0
