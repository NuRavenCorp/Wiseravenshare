param(
    [Parameter(Mandatory = $true)]
    [string]$OriginBaseUrl,

    [Parameter(Mandatory = $true)]
    [string]$CdnBaseUrl,

    [Parameter(Mandatory = $true)]
    [string]$ObjectPath,

    [int]$Iterations = 15
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Normalize-BaseUrl {
    param([string]$Value)
    return $Value.Trim().TrimEnd('/')
}

function Normalize-ObjectPath {
    param([string]$Value)
    return $Value.Trim().TrimStart('/')
}

function Invoke-CurlSample {
    param([string]$Url)

    $format = "%{time_starttransfer};%{time_total};%{http_code};%{header_json}"
    $result = & curl.exe -sS -L -o NUL -w $format $Url

    if (-not $result) {
        throw "curl returned no output for $Url"
    }

    $parts = $result -split ';', 4
    if ($parts.Length -lt 4) {
        throw "Unexpected curl output format: $result"
    }

    $ttfb = [double]$parts[0]
    $total = [double]$parts[1]
    $statusCode = [int]$parts[2]
    $headersJson = $parts[3]

    $cacheStatus = ""
    try {
        $headers = $headersJson | ConvertFrom-Json
        if ($headers.PSObject.Properties.Name -contains "cf-cache-status") {
            $raw = $headers."cf-cache-status"
            if ($raw -is [System.Array]) {
                $cacheStatus = [string]$raw[0]
            } else {
                $cacheStatus = [string]$raw
            }
        }
    } catch {
        $cacheStatus = ""
    }

    return [PSCustomObject]@{
        Ttfb = $ttfb
        Total = $total
        StatusCode = $statusCode
        CacheStatus = $cacheStatus
    }
}

function Get-Percentile {
    param(
        [double[]]$Values,
        [double]$Percentile
    )

    if (-not $Values -or $Values.Count -eq 0) {
        return [double]::NaN
    }

    $sorted = $Values | Sort-Object
    if ($sorted.Count -eq 1) {
        return [double]$sorted[0]
    }

    $rank = ($Percentile / 100.0) * ($sorted.Count - 1)
    $lower = [Math]::Floor($rank)
    $upper = [Math]::Ceiling($rank)

    if ($lower -eq $upper) {
        return [double]$sorted[$lower]
    }

    $weight = $rank - $lower
    return [double]$sorted[$lower] + (([double]$sorted[$upper] - [double]$sorted[$lower]) * $weight)
}

function Measure-Target {
    param(
        [string]$Name,
        [string]$BaseUrl,
        [string]$Path,
        [int]$Count
    )

    $url = "$(Normalize-BaseUrl $BaseUrl)/$(Normalize-ObjectPath $Path)"
    Write-Host "\nTesting $Name: $url"

    # Warm cache and connection before timed samples.
    [void](Invoke-CurlSample -Url $url)

    $samples = @()
    for ($i = 1; $i -le $Count; $i++) {
        $sample = Invoke-CurlSample -Url $url
        $samples += $sample
        Write-Host ("  {0,2}: status={1} ttfb={2:N3}s total={3:N3}s cache={4}" -f $i, $sample.StatusCode, $sample.Ttfb, $sample.Total, ($sample.CacheStatus ?? ""))
    }

    $ttfbValues = @($samples | ForEach-Object { [double]$_.Ttfb })
    $totalValues = @($samples | ForEach-Object { [double]$_.Total })

    $cacheStatuses = @($samples | ForEach-Object { $_.CacheStatus } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $cacheHistogram = @{}
    foreach ($status in $cacheStatuses) {
        if (-not $cacheHistogram.ContainsKey($status)) {
            $cacheHistogram[$status] = 0
        }
        $cacheHistogram[$status]++
    }

    return [PSCustomObject]@{
        Name = $Name
        Url = $url
        MedianTtfb = Get-Percentile -Values $ttfbValues -Percentile 50
        P95Ttfb = Get-Percentile -Values $ttfbValues -Percentile 95
        MedianTotal = Get-Percentile -Values $totalValues -Percentile 50
        P95Total = Get-Percentile -Values $totalValues -Percentile 95
        CacheHistogram = $cacheHistogram
    }
}

$origin = Measure-Target -Name "Origin" -BaseUrl $OriginBaseUrl -Path $ObjectPath -Count $Iterations
$cdn = Measure-Target -Name "CDN" -BaseUrl $CdnBaseUrl -Path $ObjectPath -Count $Iterations

Write-Host "\nSummary"
Write-Host "-------"
Write-Host ("Origin median ttfb={0:N3}s p95 ttfb={1:N3}s median total={2:N3}s p95 total={3:N3}s" -f $origin.MedianTtfb, $origin.P95Ttfb, $origin.MedianTotal, $origin.P95Total)
Write-Host ("CDN    median ttfb={0:N3}s p95 ttfb={1:N3}s median total={2:N3}s p95 total={3:N3}s" -f $cdn.MedianTtfb, $cdn.P95Ttfb, $cdn.MedianTotal, $cdn.P95Total)

if ($cdn.CacheHistogram.Count -gt 0) {
    $cacheLine = ($cdn.CacheHistogram.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ", "
    Write-Host ("CDN cf-cache-status: {0}" -f $cacheLine)
} else {
    Write-Host "CDN cf-cache-status: not present"
}

$deltaTtfb = $origin.MedianTtfb - $cdn.MedianTtfb
$deltaTotal = $origin.MedianTotal - $cdn.MedianTotal
Write-Host ("Delta (origin - cdn): median ttfb {0:N3}s, median total {1:N3}s" -f $deltaTtfb, $deltaTotal)
