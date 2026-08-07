param(
    [Parameter(Mandatory = $true)]
    [string]$YouTubeUrl,

    [int]$TimeoutSec = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-NormalizedYouTubeUrl {
    param([string]$RawUrl)

    if ([string]::IsNullOrWhiteSpace($RawUrl)) {
        throw "YouTube URL is required."
    }

    $trimmed = $RawUrl.Trim()
    if (-not [Uri]::TryCreate($trimmed, [UriKind]::Absolute, [ref]$null)) {
        throw "Invalid URL format: $trimmed"
    }

    $uri = [Uri]$trimmed
    $urlHost = $uri.Host.ToLowerInvariant()

    $allowedHosts = @(
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "youtu.be"
    )

    if ($allowedHosts -notcontains $urlHost) {
        throw "URL host must be youtube.com or youtu.be"
    }

    return $uri.AbsoluteUri
}

function Test-YouTubeVisibility {
    param([string]$Url)

    $oembed = "https://www.youtube.com/oembed?format=json&url=$([Uri]::EscapeDataString($Url))"

    try {
        $response = Invoke-WebRequest -Uri $oembed -Method Get -TimeoutSec $TimeoutSec -UseBasicParsing
        $json = $response.Content | ConvertFrom-Json

        return [pscustomobject]@{
            Url = $Url
            ReachableViaOEmbed = $true
            Status = "pass"
            Message = "Video is reachable and likely public or unlisted."
            Title = [string]$json.title
            Author = [string]$json.author_name
        }
    }
    catch {
        $statusCode = $null
        $body = ""
        if ($_.Exception.PSObject.Properties.Name -contains "Response" -and $null -ne $_.Exception.Response) {
            try { $statusCode = [int]$_.Exception.Response.StatusCode } catch {}
            try { $body = [string]$_.Exception.Response.Content } catch {}
        }

        $message = "Unable to verify video as public/unlisted."
        if ($statusCode -eq 401 -or $statusCode -eq 403 -or $statusCode -eq 404) {
            $message = "Video appears private, removed, or inaccessible. Use a public or unlisted URL."
        }

        return [pscustomobject]@{
            Url = $Url
            ReachableViaOEmbed = $false
            Status = "fail"
            Message = $message
            HttpStatus = $statusCode
            ResponseBody = $body
        }
    }
}

$normalized = Get-NormalizedYouTubeUrl -RawUrl $YouTubeUrl
$result = Test-YouTubeVisibility -Url $normalized

$result | Format-List

if ($result.Status -eq "pass") {
    exit 0
}

exit 2
